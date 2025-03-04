const { ethers } = require("ethers");
const fs = require("fs");
const colors = require("colors");
const { config } = require("../config");
const { loadData } = require("../utils");

const privateKey = config.PRIVATE_KEY_MAIN_WALLET;

const network = {
  name: "Monad Testnet",
  chainId: 10143,
  rpc: "https://monad-testnet.g.alchemy.com/v2/3DN4EyaWIGRgyimE133RK7jwBvmq-ADi",
  symbol: "MON",
  explorer: "https://testnet.monadexplorer.com/tx/",
};

const provider = new ethers.providers.JsonRpcProvider(network.rpc);

// Hàm gửi token
async function transferTokens(mainwallet, addressRecipient) {
  const min = config.AMOUNT_SEND_FEE[0];
  const max = config.AMOUNT_SEND_FEE[1];

  const randomAmount = (Math.random() * (max - min) + min).toFixed(6);
  console.log(`Sending ${randomAmount} MON to ${addressRecipient}...`);

  try {
    const nonce = await provider.getTransactionCount(mainwallet.address);
    const gasPrice = await provider.getGasPrice();

    console.log(ethers.utils.parseUnits(randomAmount, 6));
    const tx = {
      nonce: nonce,
      gasLimit: ethers.utils.hexlify(21000), // Số lượng gas
      gasPrice: gasPrice,
      chainId: network.chainId,
      to: addressRecipient,
      value: ethers.utils.parseEther(randomAmount),
    };

    const signedTx = await mainwallet.signTransaction(tx);
    const transaction = await provider.sendTransaction(signedTx);
    await transaction.wait();

    console.log(`✅ (Wallet ${addressRecipient}) [confirm]: ${network.explorer}${transaction.hash}`.green);
  } catch (error) {
    console.error(`❌ Giao dịch đến ${addressRecipient} thất bại: ${error.message}`.red);
  }
}

// Hàm chính để gửi token
async function run() {
  const privateKeys = loadData("privateKeys.txt");
  const mainwallet = new ethers.Wallet(privateKey, provider);
  console.log(`Starting AutoSend ⏩⏩⏩⏩`.blue);

  try {
    for (const key of privateKeys) {
      if (config.PRIVATE_KEY_MAIN_WALLET === key) {
        continue; // Bỏ qua ví chính
      }

      const wallet = new ethers.Wallet(key.startsWith("0x") ? key : `0x${key}`, provider);
      const address = wallet.address;
      await transferTokens(mainwallet, address);
    }
    console.log("⏩ All transactions completed successfully!".green);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

module.exports = {
  run,
};

if (require.main === module) {
  run();
}
