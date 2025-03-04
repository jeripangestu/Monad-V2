const ethers = require("ethers");
const colors = require("colors");
const readline = require("readline");
const axios = require("axios");
const fs = require("fs");
const { loadData, checkProxyIP } = require("../utils");

const RPC_URL = "https://monad-testnet.g.alchemy.com/v2/3DN4EyaWIGRgyimE133RK7jwBvmq-ADi";
const EXPLORER_URL = "https://testnet.monadexplorer.com/tx/";
let provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const RPC_URLS = ["https://testnet-rpc.monad.xyz", "https://testnet-rpc.monorail.xyz", "https://monad-testnet.drpc.org"];

const CHAIN_ID = 10143;
const UNISWAP_V2_ROUTER_ADDRESS = "0xCa810D095e90Daae6e867c19DF6D9A8C56db2c89";
const WETH_ADDRESS = "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701";

const TOKEN_ADDRESSES = {
  "DAC  ": "0x0f0bdebf0f83cd1ee3974779bcb7315f9808c714",
  "USDT ": "0x88b8e2161dedc77ef4ab7585569d2415a1c1055d",
  "WETH ": "0x836047a99e11f376522b447bffb6e3495dd0637c",
  "MUK  ": "0x989d38aeed8408452f0273c7d4a17fef20878e62",
  "USDC ": "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea",
  "CHOG ": "0xE0590015A873bF326bd645c3E1266d4db41C4E6B",
};

const erc20Abi = [
  { constant: true, inputs: [{ name: "_owner", type: "address" }], name: "balanceOf", outputs: [{ name: "balance", type: "uint256" }], type: "function" },
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
  },
];

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

async function connectToRpc(proxy) {
  for (const url of RPC_URLS) {
    try {
      provider = new ethers.providers.JsonRpcProvider({
        url: url,
        headers: {
          "Proxy-Authorization": `Basic ${Buffer.from(proxy.split("@")[0]).toString("base64")}`,
        },
      });
      await provider.getNetwork();
      console.log(`Starting Uniswap ⏩⏩⏩⏩`.blue);
      console.log(` `);
      return provider;
    } catch (error) {
      console.log(`Failed to connect to ${url}, trying another...`);
    }
  }
  throw new Error(`❌ Unable to connect`.red);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomEthAmount() {
  return ethers.utils.parseEther((Math.random() * (0.01 - 0.0001) + 0.0001).toFixed(6));
}

async function swapEthForTokens(wallet, tokenAddress, amountInWei, tokenSymbol) {
  const router = new ethers.Contract(
    UNISWAP_V2_ROUTER_ADDRESS,
    [
      {
        name: "swapExactETHForTokens",
        type: "function",
        stateMutability: "payable",
        inputs: [
          { internalType: "uint256", name: "amountOutMin", type: "uint256" },
          { internalType: "address[]", name: "path", type: "address[]" },
          { internalType: "address", name: "to", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
        ],
      },
    ],
    wallet
  );

  try {
    console.log(`🔄 Swap ${ethers.utils.formatEther(amountInWei)} MON > ${tokenSymbol}`.green);

    const nonce = await wallet.getTransactionCount("pending");

    const tx = await router.swapExactETHForTokens(0, [WETH_ADDRESS, tokenAddress], wallet.address, Math.floor(Date.now() / 1000) + 60 * 10, {
      value: amountInWei,
      gasLimit: 210000,
      nonce: nonce,
    });
    console.log(`➡️  Hash: ${tx.hash}`.yellow);
  } catch (error) {
    console.error(`❌ Failed swap: ${error.message}`.red);
  }
}

async function swapTokensForEth(wallet, tokenAddress, tokenSymbol) {
  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
  const balance = await tokenContract.balanceOf(wallet.address);

  if (balance.eq(0)) {
    console.log(`❌ No balance ${tokenSymbol}, skip`.black);
    return;
  }

  const router = new ethers.Contract(
    UNISWAP_V2_ROUTER_ADDRESS,
    [
      {
        name: "swapExactTokensForETH",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          { internalType: "uint256", name: "amountOutMin", type: "uint256" },
          { internalType: "address[]", name: "path", type: "address[]" },
          { internalType: "address", name: "to", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
        ],
      },
    ],
    wallet
  );

  try {
    console.log(`🔄 Swap ${tokenSymbol} > MON`.green);

    await tokenContract.approve(UNISWAP_V2_ROUTER_ADDRESS, balance);

    const nonce = await wallet.getTransactionCount("pending");

    const tx = await router.swapExactTokensForETH(balance, 0, [tokenAddress, WETH_ADDRESS], wallet.address, Math.floor(Date.now() / 1000) + 60 * 10, {
      gasLimit: 210000,
      nonce: nonce,
    });
    console.log(`➡️  Hash ${tx.hash}`.yellow);

    const delay = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
    console.log(`⏳ Wait ${delay / 1000} seconds`.grey);
    console.log(` `);

    await sleep(delay);
  } catch (error) {
    console.error(`❌ Failed: ${error.message}`.red);
  }
}

async function getBalance(wallet) {
  const provider = wallet.provider;

  const monBalance = await provider.getBalance(wallet.address);
  console.log(`🧧 MON    : ${ethers.utils.formatEther(monBalance)} MON`.green);

  const wethContract = new ethers.Contract(WETH_ADDRESS, erc20Abi, wallet);
  const wethBalance = await wethContract.balanceOf(wallet.address);
  console.log(`🧧 WETH   : ${ethers.utils.formatEther(wethBalance)} WETH`.green);
  console.log(" ");
}

async function runCycle(wallet, cycleNumber) {
  console.log(`\n=== Starting cycle ${cycleNumber} / ${wallet.address} ===`);

  await getBalance(wallet);

  for (const [tokenSymbol, tokenAddress] of Object.entries(TOKEN_ADDRESSES)) {
    const ethAmount = getRandomEthAmount();
    await swapEthForTokens(wallet, tokenAddress, ethAmount, tokenSymbol);
    const delay = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
    console.log(`⏳ Wait ${delay / 1000} seconds`.grey);
    console.log(` `);
    await sleep(delay);
  }
  console.log(" ");
  console.log(`🧿 All Token Reverse to MONAD`.white);
  console.log(" ");
  for (const [tokenSymbol, tokenAddress] of Object.entries(TOKEN_ADDRESSES)) {
    await swapTokensForEth(wallet, tokenAddress, tokenSymbol);
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function processAccount(privateKey, cycleCount, proxy) {
  try {
    if (!privateKey.startsWith("0x")) {
      privateKey = "0x" + privateKey;
    }
    const provider = await connectToRpc(proxy);
    const wallet = new ethers.Wallet(privateKey, provider);
    const shortAddress = `${wallet.address.substring(0, 6)}...${wallet.address.substring(wallet.address.length - 4)}`;

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
  getRandomAmount,
  getRandomDelay,
};

if (require.main === module) {
  run();
}
