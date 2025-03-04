const fs = require("fs");
const colors = require("colors");
const path = require("path");
const { HttpsProxyAgent } = require("https-proxy-agent");
const axios = require("axios");

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

function _isArray(obj) {
  if (Array.isArray(obj) && obj.length > 0) {
    return true;
  }

  try {
    const parsedObj = JSON.parse(obj);
    return Array.isArray(parsedObj) && parsedObj.length > 0;
  } catch (e) {
    return false;
  }
}

function splitIdPet(num) {
  const numStr = num.toString();
  const firstPart = numStr.slice(0, 3);
  const secondPart = numStr.slice(3); 

  return [parseInt(firstPart), parseInt(secondPart)];
}


const envFilePath = path.join(__dirname, ".env");
async function updateEnv(variable, value) {
  // Đọc file .env
  fs.readFile(envFilePath, "utf8", (err, data) => {
    if (err) {
      console.log("Không thể đọc file .env:", err);
      return;
    }
    // console.log(value, variable);

    const regex = new RegExp(`^${variable}=.*`, "m");
    const newData = data.replace(regex, `${variable}=${value}`);


    if (!regex.test(data)) {
      newData += `\n${variable}=${value}`;
    }

    // Ghi lại file .env
    fs.writeFile(envFilePath, newData, "utf8", (err) => {
      if (err) {
        console.error("Không thể ghi file .env:", err);
      } else {
        // console.log(`Đã cập nhật ${variable} thành ${value}`);
      }
    });
  });
}

function sleep(seconds = null) {
  if (seconds && typeof seconds === "number") return new Promise((resolve) => setTimeout(resolve, seconds * 1000));

  let DELAY_BETWEEN_REQUESTS = [1, 5];
  if (seconds && Array.isArray(seconds)) {
    DELAY_BETWEEN_REQUESTS = seconds;
  }
  min = DELAY_BETWEEN_REQUESTS[0];
  max = DELAY_BETWEEN_REQUESTS[1];

  return new Promise((resolve) => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    setTimeout(resolve, delay * 1000);
  });
}

function saveToken(id, token) {
  const tokens = JSON.parse(fs.readFileSync("token.json", "utf8"));
  tokens[id] = token;
  fs.writeFileSync("token.json", JSON.stringify(tokens, null, 4));
}

function getToken(id) {
  const tokens = JSON.parse(fs.readFileSync("token.json", "utf8"));
  return tokens[id] || null;
}
function isTokenExpired(token) {
  if (!token) return true;

  try {
    const [, payload] = token.split(".");
    if (!payload) return true;

    const decodedPayload = JSON.parse(Buffer.from(payload, "base64").toString());
    const now = Math.floor(Date.now() / 1000);

    if (!decodedPayload.exp) {
      // console.log("Eternal token".yellow);
      return false;
    }

    const expirationDate = new Date(decodedPayload.exp * 1000);
    const isExpired = now > decodedPayload.exp;

    console.log(`Token expires after: ${expirationDate.toLocaleString()}`.magenta);
    console.log(`Token status: ${isExpired ? "Expired".yellow : "Valid".green}`);

    return isExpired;
  } catch (error) {
    console.log(`Error checking token: ${error.message}`.red);
    return true;
  }
}

function generateRandomHash() {
  const characters = "0123456789abcdef";
  let hash = "0x"; 

  for (let i = 0; i < 64; i++) {
    // 64 ký tự cho hash
    const randomIndex = Math.floor(Math.random() * characters.length);
    hash += characters[randomIndex];
  }

  return hash;
}

function getRandomElement(arr) {
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
}

function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function loadData(file) {
  try {
    const datas = fs.readFileSync(file, "utf8").replace(/\r/g, "").split("\n").filter(Boolean);
    if (datas?.length <= 0) {
      console.log(colors.red(`Không tìm thấy dữ liệu ${file}`));
      return [];
    }
    return datas;
  } catch (error) {
    console.log(`Không tìm thấy file ${file}`.red);
    return [];
  }
}

async function saveData(data, filename) {
  fs.writeFileSync(filename, data.join("\n"));
}

function log(msg, type = "info") {
  switch (type) {
    case "success":
      console.log(`[*] ${msg}`.green);
      break;
    case "custom":
      console.log(`[*] ${msg}`.magenta);
      break;
    case "error":
      console.log(`[!] ${msg}`.red);
      break;
    case "warning":
      console.log(`[*] ${msg}`.yellow);
      break;
    default:
      console.log(`[*] ${msg}`.blue);
  }
}

function saveJson(id, value, filename) {
  const data = JSON.parse(fs.readFileSync(filename, "utf8"));
  data[id] = value;
  fs.writeFileSync(filename, JSON.stringify(data, null, 4));
}

function getItem(id, filename) {
  const data = JSON.parse(fs.readFileSync(filename, "utf8"));
  return data[id] || null;
}

function getOrCreateJSON(id, value, filename) {
  let item = getItem(id, filename);
  if (item) {
    return item;
  }
  item = saveJson(id, value, filename);
  return item;
}

module.exports = {
  checkProxyIP,
  _isArray,
  saveJson,
  getRandomNumber,
  updateEnv,
  saveToken,
  splitIdPet,
  getToken,
  isTokenExpired,
  generateRandomHash,
  getRandomElement,
  loadData,
  saveData,
  log,
  getOrCreateJSON,
  sleep,
};
