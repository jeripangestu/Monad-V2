const ethers = require("ethers");
const colors = require("colors");
const readline = require("readline");
const axios = require("axios");
const fs = require("fs");
const { loadData, checkProxyIP } = require("../utils");
const { config } = require("../config");

const RPC_URL = "https://monad-testnet.g.alchemy.com/v2/3DN4EyaWIGRgyimE133RK7jwBvmq-ADi";
const EXPLORER_URL = "https://testnet.monadexplorer.com/tx/";
const contractAddress = "0xb2f82D0f38dc453D596Ad40A37799446Cc89274A";
let provider = new ethers.providers.JsonRpcProvider(RPC_URL);
function getRandomGas(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const gasLimitStake = getRandomGas(120000, 145000);
const gasLimitUnstake = getRandomGas(150000, 200000);
const gasLimitClaim = getRandomGas(150000, 200000);

const minimalABI = ["function getPendingUnstakeRequests(address) view returns (uint256[] memory)"];

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

    // Konversi ke float, bulatkan ke 2 desimal, lalu kembali ke BigNumber
    const formattedAmount = parseFloat(ethers.utils.formatEther(randomAmount)).toFixed(2);
    return ethers.utils.parseEther(formattedAmount.toString());
  } catch (error) {
    console.error("❌ Error calculating random amount:".red, error.message);
    return ethers.utils.parseEther("0.1");
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
    console.log(`Wallet: ${wallet.address}`.cyan);

    const stakeAmount = await getRandomAmount(wallet);
    console.log(`Random stake amount: ${ethers.utils.formatEther(stakeAmount)} MON `);

    const data = "0x6e553f65" + ethers.utils.hexZeroPad(stakeAmount.toHexString(), 32).slice(2) + ethers.utils.hexZeroPad(wallet.address, 32).slice(2);

    const tx = {
      to: contractAddress,
      data: data,
      gasLimit: ethers.utils.hexlify(gasLimitStake),
      value: stakeAmount,
    };

    console.log("🔄 Sending stake request...");
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${txResponse.hash}`.yellow);

    console.log("Waiting for transaction confirmation...");
    const receipt = await txResponse.wait();
    console.log(`✔️ Stake successful!`.green.underline);

    return { receipt, stakeAmount };
  } catch (error) {
    console.error("❌ Stake failed:".red, error.message);
    throw error;
  }
}

async function requestUnstakeAprMON(wallet, amountToUnstake, cycleNumber) {
  try {
    console.log(`\n[Cycle ${cycleNumber}] Preparing to unstake aprMON...`.magenta);
    console.log(`Wallet: ${wallet.address}`.cyan);
    console.log(`Amount to unstake: ${ethers.utils.formatEther(amountToUnstake)} aprMON`);

    const data =
      "0x7d41c86e" + ethers.utils.hexZeroPad(amountToUnstake.toHexString(), 32).slice(2) + ethers.utils.hexZeroPad(wallet.address, 32).slice(2) + ethers.utils.hexZeroPad(wallet.address, 32).slice(2);

    const tx = {
      to: contractAddress,
      data: data,
      gasLimit: ethers.utils.hexlify(gasLimitUnstake),
      value: ethers.utils.parseEther("0"),
    };

    console.log("🔄 Sending unstake request...");
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${txResponse.hash}`.yellow);

    console.log("🔄 Waiting for transaction confirmation...");
    const receipt = await txResponse.wait();
    console.log(`✔️  Unstake successful!`.green.underline);

    return receipt;
  } catch (error) {
    console.error("❌ Unstake failed:".red, error.message);
    throw error;
  }
}

async function checkClaimableStatus(walletAddress) {
  try {
    const apiUrl = `https://stake-api.apr.io/withdrawal_requests?address=${walletAddress}`;
    const response = await axios.get(apiUrl);

    const claimableRequest = response.data.find((request) => !request.claimed && request.is_claimable);

    if (claimableRequest) {
      console.log(`Found claimable request ID: ${claimableRequest.id}`);
      return {
        id: claimableRequest.id,
        isClaimable: true,
      };
    }
    return {
      id: null,
      isClaimable: false,
    };
  } catch (error) {
    console.error("❌ Error occurred:".red, error.message);
    return {
      id: null,
      isClaimable: false,
    };
  }
}

async function claimMON(wallet, cycleNumber) {
  try {
    console.log(`\n[Cycle ${cycleNumber}] Checking claimable MON...`);
    console.log(`Wallet: ${wallet.address}`.cyan);

    const { id, isClaimable } = await checkClaimableStatus(wallet.address);

    if (!isClaimable || !id) {
      console.log("No claimable withdrawal requests at this time");
      return null;
    }

    console.log(`Withdrawal request ID: ${id}`);

    const data =
      "0x492e47d2" +
      "0000000000000000000000000000000000000000000000000000000000000040" +
      ethers.utils.hexZeroPad(wallet.address, 32).slice(2) +
      "0000000000000000000000000000000000000000000000000000000000000001" +
      ethers.utils.hexZeroPad(ethers.BigNumber.from(id).toHexString(), 32).slice(2);

    const tx = {
      to: contractAddress,
      data: data,
      gasLimit: ethers.utils.hexlify(gasLimitClaim),
      value: ethers.utils.parseEther("0"),
    };

    console.log("Creating transaction...");
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`Transaction sent: ${EXPLORER_URL}${txResponse.hash}`);

    console.log("Waiting for transaction confirmation...");
    const receipt = await txResponse.wait();
    console.log(`Claim successful with ID: ${id}`.green.underline);

    return receipt;
  } catch (error) {
    console.error("Claim failed:", error.message);
    throw error;
  }
}

async function runCycle(wallet, cycleNumber) {
  try {
    console.log(`\n=== Starting cycle ${cycleNumber} / ${wallet.address} ===`);

    const { stakeAmount } = await stakeMON(wallet, cycleNumber);

    const delayTimeBeforeUnstake = getRandomDelay();
    console.log(`🔄 Waiting ${delayTimeBeforeUnstake / 1000} seconds before requesting unstake...`);
    await delay(delayTimeBeforeUnstake);

    await requestUnstakeAprMON(wallet, stakeAmount, cycleNumber);

    console.log(`Waiting 660 seconds (11 minutes) before checking claim status...`.magenta);
    await delay(6600);

    await claimMON(wallet, cycleNumber);

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
    const provider = new ethers.providers.JsonRpcProvider({
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
  requestUnstakeAprMON,
  claimMON,
  getRandomAmount,
  getRandomDelay,
};

if (require.main === module) {
  run();
}
