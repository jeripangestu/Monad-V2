const axios = require("axios");
const fs = require("fs");
const readline = require("readline");
const { loadData, saveJson } = require("../utils");
const { config } = require("../config");
const { ethers } = require("ethers");
const { HttpsProxyAgent } = require("https-proxy-agent");

const RPC_URL = "https://testnet-rpc.monad.xyz/";

const solveCaptcha = async () => {
  switch (config.TYPE_CAPTCHA) {
    case "2captcha":
      return await solve2Captcha();
    case "anticaptcha":
      return await solveAntiCaptcha();
    default:
      console.log("Invalid type captcha.".red);
      process.exit(1);
  }
};

const solve2Captcha = async () => {
  let retries = 5;
  try {
    // Step 1: Create a CAPTCHA task
    const taskResponse = await axios.post(
      "https://api.2captcha.com/createTask",
      {
        clientKey: config.API_KEY_2CAPTCHA,
        task: {
          type: "RecaptchaV2TaskProxyless",
          websiteURL: config.CAPTCHA_URL,
          websiteKey: config.WEBSITE_KEY,
          isInvisible: false,
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const requestId = taskResponse.data.taskId;
    // Step 2: Poll for the result
    let result;
    do {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const resultResponse = await axios.post(
        "https://api.2captcha.com/getTaskResult",
        {
          clientKey: config.API_KEY_2CAPTCHA,
          taskId: requestId,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      result = resultResponse.data;
      if (result.status === "processing") {
        console.log("CAPTCHA still processing...".yellow);
      }
      retries--;
    } while (result.status === "processing" && retries > 0);

    // Step 3: Use the CAPTCHA solution
    if (result.status === "ready") {
      console.log("CAPTCHA success..".green);
      const captchaSolution = result.solution.token; // This is the CAPTCHA token

      // Use the token in your request
      return captchaSolution; // Store the token for further use

      // You can now send this token to the backend or use it as needed
    } else {
      console.error("Error:", result);
      return null;
    }
  } catch (error) {
    console.error("Error:", error.message);
    return null;
  }
};

const solveAntiCaptcha = async () => {
  let retries = 5;
  try {
    // Step 1: Create a CAPTCHA task
    const taskResponse = await axios.post(
      "https://api.anti-captcha.com/createTask",
      {
        clientKey: config.API_KEY_ANTICAPTCHA,
        task: {
          type: "NoCaptchaTaskProxyless",
          websiteURL: config.CAPTCHA_URL,
          websiteKey: config.WEBSITE_KEY,
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const requestId = taskResponse.data.taskId;

    // Step 2: Poll for the result
    let result;
    do {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const resultResponse = await axios.post(
        "https://api.anti-captcha.com/getTaskResult",
        {
          clientKey: config.API_KEY_ANTICAPTCHA,
          taskId: requestId,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      result = resultResponse.data;

      if (result.status === "processing") {
        console.log("CAPTCHA still processing...".yellow);
      }
      retries--;
    } while (result.status === "processing" && retries > 0);

    // Step 3: Use the CAPTCHA solution
    if (result.status === "ready") {
      console.log("CAPTCHA solved successfully.".green);
      const captchaSolution = result.solution.gRecaptchaResponse; // This is the CAPTCHA token

      // Use the token in your request
      return captchaSolution; // Store the token for further use

      // You can now send this token to the backend or use it as needed
    } else {
      console.error("Error:", result);
      return null;
    }
  } catch (error) {
    console.error("Error:", error.message);
    return null;
  }
};

async function checkProxyIP(proxy) {
  try {
    const proxyAgent = new HttpsProxyAgent(proxy);
    const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
    if (response.status === 200) {
      return response.data.ip;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

async function handleFaucet(wallet, proxy, proxyIP) {
  try {
    let proxyAgent = null;
    if (proxy) {
      proxyAgent = new HttpsProxyAgent(proxy);
    }
    const token = await solveCaptcha();
    if (!token) {
      return { data: null, success: false, mess: "Failed to solve CAPTCHA" };
    }
    // visitorId: "6472a032e0463dc05e360ca334f00e18",

    const payload = {
      address: wallet,
      visitorId: generateId(),
      // visitorId: "6472a032e0463dc05e360ca334f00e18",
      recaptchaToken: token,
    };
    const response = await axios({
      method: "POST",
      url: "https://testnet.monad.xyz/api/claim",
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.7",
        "content-type": "application/json",
        origin: "https://testnet.monad.xyz",
        referer: "https://testnet.monad.xyz/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      },
      httpsAgent: proxyAgent,
      data: payload,
    });

    if (response.data.message === "Success") {
      console.log(`Faucet successful! | ${new Date().toLocaleString()}`.green);
      saveJson(wallet, { lastFaucet: new Date(), ip: proxyIP }, "localStorage.json");
      return true;
    } else {
      console.log(`Faucet failed: ${response.data.message}`.yellow);
      return false;
    }
  } catch (error) {
    console.log(`Error performing Faucet: ${error.response?.data?.message || error.message}`.red);
    return false;
  }
}

function generateId() {
  const characters = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

async function run() {
  console.log("JANGAN BRUTAL!".yellow);

  const proxyList = loadData("proxy.txt");
  const privateKeys = loadData("privateKeys.txt");
  const localStorage = require("../localStorage.json");

  for (let i = 0; i < privateKeys.length; i++) {
    const proxyIP = await checkProxyIP(proxyList[i]);
    if (!proxyIP) {
      console.log(`Proxy ${proxyList[i]} is not valid. Skipping faucet ${wallet} request.`.red);
      continue;
    }

    const provider = new ethers.providers.JsonRpcProvider({
      url: RPC_URL,
      headers: {
        "Proxy-Authorization": `Basic ${Buffer.from(proxyList[i].split("@")[0]).toString("base64")}`,
      },
    });
    const wallet = new ethers.Wallet(privateKeys[i], provider);
    const address = await wallet.getAddress();
    const balance = await provider.getBalance(wallet.address);
    const balanceInEther = ethers.utils.formatEther(balance);
    console.log(`[${i + 1}/${privateKeys.length}] Address: ${address} | Balance: ${balanceInEther} | IP: ${proxyIP}`);

    try {
      const lastCheckIn = localStorage[address]?.lastFaucet;
      if (!isToday(lastCheckIn) || !lastCheckIn) {
        console.log("Starting faucet monad...".blue);
        await handleFaucet(address, proxyList[i], proxyIP);
      } else {
        console.log("You faucet already today...".yellow);
      }
    } catch (error) {
      console.error(`❌ [${wallet}] Failed to claim faucet.`);
      console.error("Response:", error.response.data);
      continue;
    }
  }

  console.log("All transactions completed.");
  process.exit(0);
}

const isToday = (checkInDate) => {
  const checkIn = new Date(checkInDate);
  const now = new Date();

  // Set the time of both dates to midnight (00:00:00) for comparison
  const hoursDiff = (now - checkIn) / (1000 * 60 * 60);
  return hoursDiff >= 12; // Returns true if checked in today
};

module.exports = {
  run,
};

if (require.main === module) {
  run();
}
