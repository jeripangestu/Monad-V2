const ethers = require("ethers");
const colors = require("colors");
const readline = require("readline");
const axios = require("axios");
const fs = require("fs");
const { loadData, checkProxyIP } = require("../utils");
const { config } = require("../config");

const RPC_URL = "https://monad-testnet.g.alchemy.com/v2/3DN4EyaWIGRgyimE133RK7jwBvmq-ADi";
const EXPLORER_URL = "https://testnet.monadexplorer.com/tx";
const WMON_CONTRACT = "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701";

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


// Fungsi mendapatkan gas limit acak antara 120.000 - 150.000
function getRandomGasLimit() {
  return Math.floor(Math.random() * (150000 - 120000 + 1)) + 120000;
}

function getRandomDelay() {
  return Math.floor(Math.random() * (3 * 60 * 1000 - 1 * 60 * 1000 + 1) + 1 * 60 * 1000);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function wrapMON(wallet, amount, cycleNumber) {
  try {
    const address = await wallet.getAddress();
    const formattedAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

    console.log(`[Wallet ${formattedAddress}][Cycle ${cycleNumber}] 🔄 Wrap ${ethers.utils.formatEther(amount)} MON → WMON...`.magenta);

    const contract = new ethers.Contract(WMON_CONTRACT, ["function deposit() public payable", "function withdraw(uint256 amount) public"], wallet);

    const tx = await contract.deposit({ value: amount, gasLimit: getRandomGasLimit() });
    console.log(`✔️  Wrap MON → WMON successful`.green.underline);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error("❌ Error wrapping MON:".red, error.message);
    return false;
  }
}

async function unwrapMON(wallet, amount, cycleNumber) {
  try {
    const address = await wallet.getAddress();
    const formattedAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

    console.log(`[Wallet ${formattedAddress}][Cycle ${cycleNumber}] 🔄 Unwrap ${ethers.utils.formatEther(amount)} WMON → MON...`.magenta);

    const contract = new ethers.Contract(WMON_CONTRACT, ["function deposit() public payable", "function withdraw(uint256 amount) public"], wallet);

    const tx = await contract.withdraw(amount, { gasLimit: getRandomGasLimit() });
    console.log(`✔️  Unwrap WMON → MON successful`.green.underline);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error("❌ Error unwrapping WMON:".red, error.message);
    return false;
  }
}

async function processWallet(privateKey, cycles, walletIndex, totalWallets, proxy) {
  try {
    provider = new ethers.providers.JsonRpcProvider({
      url: RPC_URL,
      headers: {
        "Proxy-Authorization": `Basic ${Buffer.from(proxy.split("@")[0]).toString("base64")}`,
      },
    });
    const wallet = new ethers.Wallet(privateKey, provider);
    const address = await wallet.getAddress();
    const formattedAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

    console.log(`\n=== Processing wallet ${walletIndex + 1}/${totalWallets}: ${formattedAddress} ===`.cyan.bold);

    for (let i = 1; i <= cycles; i++) {
      console.log(`\n[Wallet ${formattedAddress}] Starting Cycle ${i} / ${cycles}:`.magenta);

      try {
        const randomAmount = await getRandomAmount(wallet);
        console.log(`Random amount: ${ethers.utils.formatEther(randomAmount)} MON `);

        const wrapSuccess = await wrapMON(wallet, randomAmount, i);
        if (!wrapSuccess) {
          console.log(`[Wallet ${formattedAddress}] Skipping Cycle ${i} due to wrap error`.yellow);
          continue;
        }

        const unwrapSuccess = await unwrapMON(wallet, randomAmount, i);
        if (!unwrapSuccess) {
          console.log(`[Wallet ${formattedAddress}] Cycle ${i} not completed due to unwrap error`.yellow);
          continue;
        }

        console.log(`[Wallet ${formattedAddress}] Cycle ${i} completed`.green);

        if (i < cycles) {
          const randomDelay = getRandomDelay();
          console.log(`[Wallet ${formattedAddress}] Waiting ${randomDelay / 1000 / 60} minutes for the next cycle...`.yellow);
          await delay(randomDelay);
        }
      } catch (error) {
        console.error(`[Wallet ${formattedAddress}] Error in cycle ${i}:`.red, error.message);
        continue;
      }
    }

    console.log(`\n=== Completed all cycles for wallet ${formattedAddress} ===`.cyan.bold);
    return true;
  } catch (error) {
    console.error(`Error processing wallet ${walletIndex + 1}:`.red, error.message);
    return false;
  }
}

async function runSwapCycles(cycles) {
  try {
    console.log("Starting wrap/unwrap WMON...".green);

    const privateKeys = loadData("privateKeys.txt");
    const proxies = loadData("proxy.txt");

    for (let i = 0; i < privateKeys.length; i++) {
      const proxyIP = await checkProxyIP(proxies[i]);
      if (!proxyIP) {
        console.log(`Failed check proxy ${proxies[i]}, moving to next account`.yellow);
        continue;
      }
      console.log(`\n🔄 Processing account ${i + 1} / ${privateKeys.length} | IP: ${proxyIP}`.cyan);
      await processWallet(privateKeys[i], cycles, i, privateKeys.length, proxies[i]);

      if (i < privateKeys.length - 1) {
        console.log(`\nMoving to the next wallet after 3 seconds...`.yellow);
        await delay(3000);
      }
    }

    console.log(`\nAll wallets have been processed successfully!`.green.bold);
    return true;
  } catch (error) {
    console.error("Operation not successful:".red, error.message);
    return false;
  }
}

async function run() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("How many cycles do you want to run on each wallet? ", (cycles) => {
    let cyclesCount = cycles ? parseInt(cycles) : 1;

    if (isNaN(cyclesCount) || cyclesCount <= 0) {
      console.log("❌ Please enter a valid number.".red);
      rl.close();
      return;
    }
    runSwapCycles(cyclesCount);

    rl.close();
  });
}

async function runAutomated(cycles = 1, intervalHours = null) {
  try {
    console.log("[Automated] Starting wrap/unwrap WMON...".green);
    console.log(`[Automated] Running ${cycles} cycles on each wallet`.yellow);

    const result = await runSwapCycles(cycles);

    if (result && intervalHours) {
      const intervalMs = intervalHours * 60 * 60 * 1000;
      console.log(`\n⏱️ Next run scheduled after ${intervalHours} hours`.cyan);
      setTimeout(() => runAutomated(cycles, intervalHours), intervalMs);
    }

    return result;
  } catch (error) {
    console.error("[Automated] Operation not successful:".red, error.message);
    return false;
  }
}

module.exports = {
  run,
  runAutomated,
  wrapMON,
  unwrapMON,
  getRandomAmount,
  getRandomDelay,
};

if (require.main === module) {
  run();
}
