const { ethers } = require("ethers");
const colors = require("colors");
const readline = require("readline");
const fs = require("fs");
const { loadData, checkProxyIP } = require("../utils");
const { config } = require("../config");

const RPC_URL = "https://testnet-rpc.monad.xyz/";
const EXPLORER_URL = "https://testnet.monadexplorer.com/tx/";
const WMON_CONTRACT = "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701";
const ACCOUNT_SWITCH_DELAY = 3000;
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

// Fungsi mendapatkan gas limit acak antara 120.000 - 150.000
function getRandomGasLimit() {
  return Math.floor(Math.random() * (150000 - 120000 + 1)) + 120000;
}

async function wrapMON(amount, contract) {
  try {
    console.log(`🔄 Wrap ${ethers.utils.formatEther(amount)} MON → WMON...`.magenta);
    const tx = await contract.deposit({ value: amount, gasLimit: getRandomGasLimit() });
    console.log(`✔️  Wrap MON → WMON successful`.green.underline);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error("❌ Error occurred:".red, error);
    return false;
  }
}

async function unwrapMON(amount, contract) {
  try {
    console.log(`🔄 Unwrap ${ethers.utils.formatEther(amount)} WMON → MON...`.magenta);
    const tx = await contract.withdraw(amount, { gasLimit: getRandomGasLimit() });
    console.log(`✔️  Unwrap WMON → MON successful`.green.underline);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error("❌ Error occurred:".red, error);
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function performSwapCycle(wallet, contract, cycleNumber, totalCycles) {
  try {
    console.log(`Cycle ${cycleNumber} / ${totalCycles}:`.magenta);
    const randomAmount = await getRandomAmount(wallet);

    const wrapSuccess = await wrapMON(randomAmount, contract);
    if (!wrapSuccess) return false;

    const unwrapSuccess = await unwrapMON(randomAmount, contract);
    if (!unwrapSuccess) return false;

    return true;
  } catch (error) {
    console.error(`❌ Error occurred: ${error.message}`.red);
    return false;
  }
}

async function runSwapCyclesForAccount(privateKey, cycles, proxy) {
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
    const contract = new ethers.Contract(WMON_CONTRACT, ["function deposit() public payable", "function withdraw(uint256 amount) public"], wallet);

    const address = wallet.address;
    const truncatedAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    console.log(`\n👤 Processing account: ${truncatedAddress}`.cyan);

    const balance = await wallet.getBalance();
    console.log(`💰 Balance: ${ethers.utils.formatEther(balance)} MON`.cyan);

    let completedCycles = 0;
    for (let i = 0; i < cycles; i++) {
      const success = await performSwapCycle(wallet, contract, i + 1, cycles);
      if (success) {
        completedCycles++;
      } else {
        console.log(`⚠️ Cycle ${i + 1} failed, moving to the next cycle`.yellow);
      }
    }

    console.log(`✅ Completed ${completedCycles}/${cycles} cycles for account ${truncatedAddress}`.green);
    return true;
  } catch (error) {
    console.error(`❌ Error processing account, check if the private key is correct ${privateKey.substring(0, 6)}...: ${error.message}`.red);
    return false;
  }
}

async function processAllAccounts(cycles, interval) {
  try {
    const privateKeys = loadData("privateKeys.txt");
    const proxies = loadData("proxy.txt");
    console.log(`📋 Found ${privateKeys.length} accounts in privateKeys.txt`.cyan);

    for (let i = 0; i < privateKeys.length; i++) {
      const proxyIP = await checkProxyIP(proxies[i]);
      if (!proxyIP) {
        console.log(`Failed check proxy ${proxies[i]}, moving to next account`.yellow);
        continue;
      }
      console.log(`\n🔄 Processing account ${i + 1} of ${privateKeys.length} | IP: ${proxyIP}`.cyan);
      const success = await runSwapCyclesForAccount(privateKeys[i], cycles, proxies[i]);

      if (!success) {
        console.log(`⚠️ Unable to process account ${i + 1}, moving to the next account`.yellow);
      }

      if (i < privateKeys.length - 1) {
        console.log(`⏱️ Waiting 3 seconds before moving to the next account...`.cyan);
        await delay(ACCOUNT_SWITCH_DELAY);
      }
    }

    if (interval) {
      console.log(`\n⏱️ All accounts processed. The next batch will run in ${interval} hours`.cyan);
      setTimeout(() => processAllAccounts(cycles, interval), interval * 60 * 60 * 1000);
    } else {
      console.log(`\n✅ All accounts processed successfully`.green.bold);
    }
  } catch (error) {
    console.error(`❌ An error occurred: ${error.message}`.red);
  }
}

function run() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("How many cycles do you want to perform for each account? (Enter defaults to 1): ", (cycles) => {
    rl.question("How long do you want each cycle to run (in hours)? (Press enter to run immediately): ", (hours) => {
      let cyclesCount = cycles ? parseInt(cycles) : 1;
      let intervalHours = hours ? parseInt(hours) : null;

      if (isNaN(cyclesCount) || (intervalHours !== null && isNaN(intervalHours))) {
        console.log("❌ Please enter a valid number.".red);
        rl.close();
        return;
      }

      processAllAccounts(cyclesCount, intervalHours);
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
};

if (require.main === module) {
  run();
}
