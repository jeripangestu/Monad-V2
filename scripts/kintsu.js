const ethers = require("ethers");
const colors = require("colors");
const readline = require("readline");
const axios = require("axios");
const fs = require("fs");
const { loadData, checkProxyIP } = require("../utils");
const { config } = require("../config");

const RPC_URL = "https://testnet-rpc.monad.xyz/";
const EXPLORER_URL = "https://testnet.monadexplorer.com/tx/";
let provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const contractAddress = "0x07AabD925866E8353407E67C1D157836f7Ad923e";
const gasLimitStake = 500000;
const gasLimitUnstake = 800000;

async function getRandomAmount(wallet) {
  try {
    const balance = await provider.getBalance(wallet.address);
    const minPercentage = config.PERCENT_TRANSACTION[0];
    const maxPercentage = config.PERCENT_TRANSACTION[1];

    const min = balance.mul(minPercentage * 10).div(1000); // minPercentage% of balance
    const max = balance.mul(maxPercentage * 10).div(1000); // maxPercentage% of balance

    if (min.lt(ethers.utils.parseEther("0.0001"))) {
      console.log("Balance too low, using minimum amount".yellow);
      return ethers.utils.parseEther("0.0001");
    }

    const range = max.sub(min);
    const randomBigNumber = ethers.BigNumber.from(ethers.utils.randomBytes(32)).mod(range);

    const randomAmount = min.add(randomBigNumber);

    return randomAmount;
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

async function stakeMON(wallet, cycleNumber) {
  try {
    console.log(`\n[Cycle ${cycleNumber}] Starting to stake MON...`.magenta);

    const walletAddress = await wallet.getAddress();
    console.log(`Wallet: ${walletAddress}`.cyan);

    const stakeAmount = await getRandomAmount(wallet);
    console.log(`Random stake amount: ${ethers.utils.formatEther(stakeAmount)} MON `);

    const tx = {
      to: contractAddress,
      nonce: await wallet.getTransactionCount(),
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
    console.log(`✅ Unstake: ${ethers.utils.formatEther(amountToUnstake)} gMON`.green);

    console.log(`\n[Cycle ${cycleNumber}] Preparing to unstake aprMON...`.magenta);
    console.log(`Wallet: ${wallet.address}`.cyan);
    console.log(`Amount to unstake: ${ethers.utils.formatEther(amountToUnstake)} aprMON`);

    const data =
      "0x30af6b2e" + ethers.utils.hexZeroPad(amountToUnstake.toHexString(), 32).slice(2) + ethers.utils.hexZeroPad(wallet.address, 32).slice(2) + ethers.utils.hexZeroPad(wallet.address, 32).slice(2);

    const tx = {
      to: contractAddress,
      data: data,
      gasLimit: ethers.utils.hexlify(gasLimitUnstake),
      nonce: await wallet.getTransactionCount(),
    };

    console.log(`✅ Unstake`.green);
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`➡️  Hash: ${EXPLORER_URL}${txResponse.hash}`.yellow);
    console.log(`⏳ Wait Confirmation`.grey);
    await txResponse.wait();
    console.log(`✅ Unstake DONE!`.green);
    return receipt;
  } catch (error) {
    console.error(`❌ Unstaking failed:`.red, error.message);
    throw error;
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runCycle(wallet, cycleNumber) {
  try {
    console.log(`\n=== Starting cycle ${cycleNumber} / ${wallet.address} ===`);

    const { stakeAmount } = await stakeMON(wallet, cycleNumber);

    const delayTimeBeforeUnstake = getRandomDelay();
    console.log(`🔄 Waiting ${delayTimeBeforeUnstake / 1000} seconds before requesting unstake...`);
    await delay(delayTimeBeforeUnstake);

    await unstakeGMON(wallet, stakeAmount, cycleNumber);

    console.log(`=== Cycle ${cycleNumber} for wallet ${wallet.address} completed! ===`.magenta.bold);
  } catch (error) {
    console.error(`❌ Cycle ${cycleNumber} failed:`.red, error.message);
    throw error;
  }
}

async function processAccount(privateKey, cycleCount, proxy) {
  try {
    if (!privateKey.startsWith("0x")) {
      privateKey = "0x" + privateKey;
    }
    provider = new ethers.providers.JsonRpcProvider({
      url: RPC_URL,
      headers: {
        "Proxy-Authorization": `Basic ${Buffer.from(proxy.split("@")[0]).toString("base64")}`,
      },
    });
    const wallet = new ethers.Wallet(privateKey, provider);
    const shortAddress = `${wallet.address.substring(0, 6)}...${wallet.address.substring(wallet.address.length - 4)}`;
    console.log(`\n=== Processing account ${shortAddress} ===`.cyan.bold);

    const initialBalance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.utils.formatEther(initialBalance)} MON`.yellow);

    for (let i = 1; i <= cycleCount; i++) {
      await runCycle(wallet, i);

      if (i < cycleCount) {
        const interCycleDelay = getRandomDelay();
        console.log(`\nWaiting ${interCycleDelay / 1000} seconds before next cycle...`);
        await delay(interCycleDelay);
      }
    }

    const finalBalance = await provider.getBalance(wallet.address);
    console.log(`\nFinal balance: ${ethers.utils.formatEther(finalBalance)} MON`.yellow);

    const difference = finalBalance.sub(initialBalance);
    if (difference.gt(0)) {
      console.log(`Profit: +${ethers.utils.formatEther(difference)} MON`.green);
    } else {
      console.log(`Loss: ${ethers.utils.formatEther(difference)} MON`.red);
    }

    console.log(`=== Process completed for wallet ${shortAddress} ===`.cyan.bold);
    return true;
  } catch (error) {
    console.error(`❌ Account processing failed:`.red, error.message);
    return false;
  }
}

async function processAllAccounts(cycleCount, intervalHours) {
  try {
    const privateKeys = loadData("privateKeys.txt");
    const proxy = loadData("proxy.txt");

    if (privateKeys.length === 0) {
      console.error("No private keys found in privateKeys.txt".red);
      return false;
    }

    console.log(`📋 Found ${privateKeys.length} wallets in privateKeys.txt`.cyan);
    console.log(`Running ${cycleCount} cycles for each account...`.yellow);

    for (let i = 0; i < privateKeys.length; i++) {
      const proxyIP = await checkProxyIP(proxy[i]);
      if (!proxyIP) {
        console.log(`Failed check proxy ${proxy[i]}, moving to next account`.yellow);
        continue;
      }
      console.log(`\n🔄 Processing account ${i + 1} / ${privateKeys.length} | IP: ${proxyIP}`.cyan);
      const success = await processAccount(privateKeys[i], cycleCount, proxy[i]);

      if (!success) {
        console.log(`⚠️ Unable to process account ${i + 1}, moving to next account`.yellow);
      }

      if (i < privateKeys.length - 1) {
        console.log("\nMoving to next account after 3 seconds...".cyan);
        await delay(3000);
      }
    }

    console.log(`\n✅ All ${privateKeys.length} accounts have been processed successfully!`.green.bold);

    if (intervalHours) {
      console.log(`\n⏱️ All accounts processed. Next run will be after ${intervalHours} hours`.cyan);
      setTimeout(() => processAllAccounts(cycleCount, intervalHours), intervalHours * 60 * 60 * 1000);
    }

    return true;
  } catch (error) {
    console.error("❌ Operation failed:".red, error.message);
    return false;
  }
}

function run() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("How many cycles do you want to run for each account? ", (answer) => {
    const cycleCount = parseInt(answer);

    if (isNaN(cycleCount) || cycleCount <= 0) {
      console.error("Please enter a valid number!".red);
      rl.close();
      process.exit(1);
    }

    rl.question("How long do you want the cycle to run between each run (in hours)? (Press enter for immediate run): ", (hours) => {
      let intervalHours = hours ? parseInt(hours) : null;

      if (hours && (isNaN(intervalHours) || intervalHours < 0)) {
        console.error("Please enter a valid number!".red);
        rl.close();
        process.exit(1);
      }
      processAllAccounts(cycleCount, intervalHours);
      rl.close();
    });
  });
}

async function runAutomated(cycles = 1, intervalHours = null) {
  await processAllAccounts(cycles, intervalHours);
  return true;
}

module.exports = {
  run,
  runAutomated,
  stakeMON,
  unstakeGMON,
  getRandomAmount,
  getRandomDelay,
};

if (require.main === module) {
  run();
}
