const ethers = require("ethers");
const colors = require("colors");
const readline = require("readline");
const fs = require("fs");
const { loadData, checkProxyIP } = require("../utils");
const { config } = require("../config");

const RPC_URL = "https://testnet-rpc.monad.xyz/";
const EXPLORER_URL = "https://testnet.monadexplorer.com/tx/";
const contractAddress = "0x2c9C959516e9AAEdB2C748224a41249202ca8BE7";
function getRandomGas(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const gasLimitStake = getRandomGas(120000, 145000);
const gasLimitUnstake = getRandomGas(120000, 145000);
let provider = new ethers.providers.JsonRpcProvider(RPC_URL);

async function getRandomAmount(wallet) {
  try {
    const balance = await provider.getBalance(wallet.address);
    const minPercentage = config.PERCENT_TRANSACTION[0];
    const maxPercentage = config.PERCENT_TRANSACTION[1];

    const min = balance.mul(minPercentage).div(100); // minPercentage% dari saldo
    const max = balance.mul(maxPercentage).div(100); // maxPercentage% dari saldo

    if (min.lt(ethers.utils.parseEther("0.0001"))) {
      console.log("Balance too low, using minimum amount".yellow);
      return ethers.utils.parseEther("0.01");
    }

    const range = max.sub(min);
    const randomBigNumber = ethers.BigNumber.from(ethers.utils.randomBytes(32)).mod(range);
    const randomAmount = min.add(randomBigNumber);

    // Konversi ke Ether, format 2 angka di belakang koma
    let formattedAmount = parseFloat(ethers.utils.formatEther(randomAmount)).toFixed(2);

    // Konversi kembali ke BigNumber untuk transaksi
    return ethers.utils.parseEther(formattedAmount.toString());
  } catch (error) {
    console.error("❌ Error calculating random amount:".red, error.message);
    return ethers.utils.parseEther("0.01");
  }
}
function getRandomDelay() {
  const minDelay = 30 * 1000;
  const maxDelay = 1 * 60 * 1000;
  return Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stakeMON(wallet, cycleNumber) {
  try {
    console.log(`\n[Cycle ${cycleNumber}] Starting to stake MON...`.magenta);

    const walletAddress = await wallet.getAddress();
    console.log(`Wallet: ${walletAddress}`.cyan);

    const stakeAmount = await getRandomAmount(wallet);
    console.log(`Random stake amount: ${ethers.utils.formatEther(stakeAmount)} MON `);

    const tx = {
      to: contractAddress,
      data: "0xd5575982",
      gasLimit: ethers.utils.hexlify(gasLimitStake),
      value: stakeAmount,
    };

    console.log("🔄 Starting to create transaction...");
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${txResponse.hash}`.yellow);

    console.log("🔄 Waiting for transaction confirmation...");
    const receipt = await txResponse.wait();
    console.log(`✔️  Stake successful!`.green.underline);

    return { receipt, stakeAmount };
  } catch (error) {
    console.error("❌ Stake failed:".red, error.message);
    throw error;
  }
}

async function unstakeGMON(wallet, amountToUnstake, cycleNumber) {
  try {
    console.log(`\n[Cycle ${cycleNumber}] Starting to unstake gMON...`.magenta);

    const walletAddress = await wallet.getAddress();
    console.log(`Wallet: ${walletAddress}`.cyan);

    console.log(`Amount to unstake: ${ethers.utils.formatEther(amountToUnstake)} gMON`);

    const functionSelector = "0x6fed1ea7";
    const paddedAmount = ethers.utils.hexZeroPad(amountToUnstake.toHexString(), 32);
    const data = functionSelector + paddedAmount.slice(2);

    const tx = {
      to: contractAddress,
      data: data,
      gasLimit: ethers.utils.hexlify(gasLimitUnstake),
    };

    console.log("🔄 Starting to create transaction...");
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`➡️  Transaction sent ${EXPLORER_URL}${txResponse.hash}`.yellow);

    console.log("🔄 Waiting for transaction confirmation...");
    const receipt = await txResponse.wait();
    console.log(`✔️  Unstake successful!`.green.underline);

    return receipt;
  } catch (error) {
    console.error("❌ Unstake failed:".red, error.message);
    console.error("Full error:", JSON.stringify(error, null, 2));
    throw error;
  }
}

async function runCycle(wallet, cycleNumber) {
  try {
    const walletAddress = await wallet.getAddress();
    console.log(`\n=== Starting cycle ${cycleNumber} for wallet ${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)} ===`.magenta.bold);

    const { stakeAmount } = await stakeMON(wallet, cycleNumber);

    const delayTime = getRandomDelay();
    console.log(`Waiting ${delayTime / 1000} seconds to start unstaking...`);
    await delay(delayTime);

    await unstakeGMON(wallet, stakeAmount, cycleNumber);

    console.log(`=== Cycle ${cycleNumber} for wallet ${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)} completed! ===`.magenta.bold);
    return true;
  } catch (error) {
    console.error(`❌ Cycle ${cycleNumber} encountered an error:`.red, error.message);
    return false;
  }
}

async function processWallet(privateKey, cycleCount, walletIndex, totalWallets, proxy) {
  try {
    provider = new ethers.providers.JsonRpcProvider({
      url: RPC_URL,
      headers: {
        "Proxy-Authorization": `Basic ${Buffer.from(proxy.split("@")[0]).toString("base64")}`,
      },
    });
    const wallet = new ethers.Wallet(privateKey, provider);
    const walletAddress = await wallet.getAddress();

    console.log(`\n=== Processing wallet ${walletIndex + 1}/${totalWallets}: ${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)} ===`.cyan.bold);

    for (let i = 1; i <= cycleCount; i++) {
      const success = await runCycle(wallet, i);

      if (!success) {
        console.log(`Skipping remaining cycles for this wallet due to error`.yellow);
        break;
      }

      if (i < cycleCount) {
        const interCycleDelay = getRandomDelay();
        console.log(`\nWaiting ${interCycleDelay / 1000} seconds for the next cycle...`);
        await delay(interCycleDelay);
      }
    }

    console.log(`\n=== Completed all cycles for wallet ${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)} ===`.cyan.bold);
  } catch (error) {
    console.error(`Error processing wallet ${walletIndex + 1}:`.red, error.message);
  }
}

function getCycleCount() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("How many stake cycles do you want to run for each wallet? ", (answer) => {
      const cycleCount = parseInt(answer);
      if (isNaN(cycleCount) || cycleCount <= 0) {
        console.error("Please enter a number!".red);
        rl.close();
        process.exit(1);
      }
      rl.close();
      resolve(cycleCount);
    });
  });
}

async function run() {
  try {
    console.log("Starting Magma Stake...".green);
    console.log("Reading wallets from privateKeys.txt...".yellow);

    const privateKeys = loadData("privateKeys.txt");
    const proxy = loadData("proxy.txt");

    console.log(`Found ${privateKeys.length} wallets from privateKeys.txt`.green);

    const cycleCount = await getCycleCount();
    console.log(`Starting to run ${cycleCount} cycles on each wallet...`.yellow);

    for (let i = 0; i < privateKeys.length; i++) {
      const proxyIP = await checkProxyIP(proxy[i]);
      if (!proxyIP) {
        console.log(`Failed check proxy ${proxy[i]}, moving to next account`.yellow);
        continue;
      }
      console.log(`\n🔄 Processing account ${i + 1} / ${privateKeys.length} | IP: ${proxyIP}`.cyan);

      await processWallet(privateKeys[i], cycleCount, i, privateKeys.length, proxy[i]);

      if (i < privateKeys.length - 1) {
        console.log(`\nSwitching to the next wallet in 3 seconds...`.yellow);
        await delay(3000);
      }
    }

    console.log(`\nAll wallets processed successfully!`.green.bold);
  } catch (error) {
    console.error("Operation failed:".red, error.message);
  }
}

async function runAutomated(cycles = 1, intervalHours = null) {
  try {
    console.log("[Automated] Starting Magma Stake...".green);

    const privateKeys = loadData("privateKeys.txt");
    const proxies = loadData("proxy.txt");
    console.log(`Found ${privateKeys.length} wallets from privateKeys.txt`.green);
    console.log(`[Automated] Starting to run ${cycles} cycles on each wallet...`.yellow);

    for (let i = 0; i < privateKeys.length; i++) {
      const proxyIP = await checkProxyIP(proxies[i]);
      if (!proxyIP) {
        console.log(`Failed check proxy ${proxies[i]}, moving to next account`.yellow);
        continue;
      }
      console.log(`\n🔄 Processing account ${i + 1} of ${privateKeys.length} | IP: ${proxyIP}`.cyan);

      await processWallet(privateKeys[i], cycles, i, privateKeys.length, proxies[i]);

      if (i < privateKeys.length - 1) {
        console.log(`\nSwitching to the next wallet in 3 seconds...`.yellow);
        await delay(3000);
      }
    }

    console.log(`\n[Automated] All wallets processed successfully!`.green.bold);

    if (intervalHours) {
      const intervalMs = intervalHours * 60 * 60 * 1000;
      console.log(`\n⏱️ Next run scheduled after ${intervalHours} hour(s)`.cyan);
      setTimeout(() => runAutomated(cycles, intervalHours), intervalMs);
    }

    return true;
  } catch (error) {
    console.error("[Automated] Operation failed:".red, error.message);
    return false;
  }
}

let configCycles = 1;
function setCycles(cycles) {
  if (cycles && !isNaN(cycles) && cycles > 0) {
    configCycles = cycles;
    console.log(`[Config] Set cycles to ${cycles}`.yellow);
  }
}

module.exports = {
  run,
  runAutomated,
  setCycles,
  stakeMON,
  unstakeGMON,
  getRandomAmount,
  getRandomDelay,
};

if (require.main === module) {
  run();
}
