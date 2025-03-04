const prompts = require("prompts");
const colors = require("colors");

const availableScripts = [
  { title: "1.Deploy Contract", value: "deploy" },
  { title: "2.Send Fee To Mutiple Wallet", value: "send" },
  { title: "3.Faucet Monad", value: "faucet" },
  { title: "4.Monorail (swap)", value: "mono" },
  { title: "5.Ambient (swap)", value: "ambient" },
  { title: "6.Bebop (Swap)", value: "bebop" },
  { title: "7.Uniswap (Swap)", value: "uni" },
  { title: "8.Rubics (Swap)", value: "rubic" },
  { title: "9.Izumi (Swap)", value: "izumi" },
  { title: "10.Beanswap (Swap)", value: "beanswap" },
  { title: "11.Magma Staking (Stake)", value: "magma" },
  { title: "12.Apriori Staking (Stake)", value: "apriori" },
  { title: "13.Kintsu Staking (Stake)", value: "kintsu" },
  { title: "14.Run automation all options", value: "all" },
  { title: "Exit", value: "exit" },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scriptConfigs = {
  rubic: { cycles: 1, intervalHours: null },
  magma: { cycles: 1, intervalHours: null },
  izumi: { cycles: 1, intervalHours: null },
  apriori: { cycles: 1, intervalHours: null },
  beanswap: { cycles: 1, intervalHours: null },
  ambient: { cycles: 1, intervalHours: null },
  kintsu: { cycles: 1, intervalHours: null },
  mono: { cycles: 1, intervalHours: null },
  uni: { cycles: 1, intervalHours: null },
  bebop: { cycles: 1, intervalHours: null },
};

// Fungsi untuk menampilkan banner dengan warna-warni
function showBanner() {
    const banner = `
    \x1b[34m____\x1b[0m                           
   \x1b[34m/ __ \\____ __________ ______\x1b[0m    
  \x1b[34m/ / / / __ \`/ ___/ __ \`/ ___/\x1b[0m    
 \x1b[34m/ /_/ / /_/ (__  ) /_/ / /\x1b[0m        
\x1b[34m/_____/_\__,_/____/\__,_/_/\x1b[0m          
    
    \x1b[32m____\x1b[0m                       \x1b[33m__\x1b[0m    
   \x1b[32m/ __ \\___  ____ ___  __  __/ /_\x1b[0m \x1b[33m ______  ____ _\x1b[0m    
  \x1b[32m/ /_/ / _ \\/ __ \`__ \\/ / / / / /\x1b[0m \x1b[33m/ __ \/ __ \`/\x1b[0m    
 \x1b[32m/ ____/  __/ / / / / / /_/ / / /\x1b[0m \x1b[33m/ / / / /_/ /\x1b[0m     
\x1b[32m/_/    \___/_/ /_/ /_/\__,_/_/\x1b[0m \x1b[33m/ / /_/\__, /\x1b[0m      
                                         \x1b[33m/____/\x1b[0m        
    
====================================================    
     \x1b[35mAutomation\x1b[0m         : \x1b[36mAuto Install Node and Bot\x1b[0m    
     \x1b[35mTelegram Channel\x1b[0m   : \x1b[36m@dasarpemulung\x1b[0m    
     \x1b[35mTelegram Group\x1b[0m     : \x1b[36m@parapemulung\x1b[0m    
====================================================    
    `;

    console.log(banner); 
}

async function runScript(scriptName, automated = false) {
  try {
    let scriptModule;

    switch (scriptName) {
      case "rubic":
        console.log("Run Rubics (Swap)...");
        scriptModule = require("./scripts/rubic");
        break;
      case "ambient":
        console.log("Run ambients (Swap)...");
        scriptModule = require("./scripts/ambient");
        break;
      case "kintsu":
        console.log("kintsu staking...");
        scriptModule = require("./scripts/kintsu");
        break;
      case "send":
        console.log("Run Send Monad To Multiple Wallets...");
        scriptModule = require("./scripts/send");
        break;
      case "faucet":
        console.log("Run faucet...");
        scriptModule = require("./scripts/faucet");
        break;
      case "deploy":
        console.log("Deploy Contract...");
        scriptModule = require("./scripts/deploy");
        break;
      case "mono":
        console.log("Run Monorail...");
        scriptModule = require("./scripts/mono");
        break;
      case "uni":
        console.log("Run Uniswap (Swap)...");
        scriptModule = require("./scripts/uniswap");
        break;
      case "bebop":
        console.log("Run Bebop (Swap)...");
        scriptModule = require("./scripts/bebop");
        break;

      case "magma":
        console.log("Run Magma (Stake)...");
        scriptModule = require("./scripts/magma");
        break;

      case "izumi":
        console.log("Run Izumi (Swap)...");
        scriptModule = require("./scripts/izumi");
        break;

      case "apriori":
        console.log("Run Apriori (Stake)...");
        scriptModule = require("./scripts/apriori");
        break;

      case "beanswap":
        console.log("Run Beanswap (Swap)...");
        scriptModule = require("./scripts/beanswap");
        break;

      default:
        console.log(`Unknown script: ${scriptName}`);
        return;
    }

    if (automated && scriptModule.runAutomated) {
      await scriptModule.runAutomated(scriptConfigs[scriptName].cycles, scriptConfigs[scriptName].intervalHours);
    } else if (automated) {
      console.log(`Warning: ${scriptName} not support automation.`.yellow);
      await scriptModule.run();
    } else {
      await scriptModule.run();
    }
  } catch (error) {
    console.error(`Can't run ${scriptName} script:`, error.message);
  }
}

async function runAllScriptsSequentially() {
  const scriptOrder = ["rubic", "izumi", "beanswap", "magma", "apriori", "mono", "kintsu", "uni", "bebop"];

  console.log("-".repeat(60));
  console.log("Automatically run all scripts...".blue);
  console.log("-".repeat(60));

  const response = await prompts([
    {
      type: "number",
      name: "cycles",
      message: "How many cycles would you like to run for each script?",
      initial: 1,
    },
    {
      type: "number",
      name: "intervalHours",
      message: "Run interval in hours (0 for no repetition):",
      initial: 0,
    },
  ]);

  for (const script of scriptOrder) {
    scriptConfigs[script].cycles = response.cycles || 1;
    scriptConfigs[script].intervalHours = response.intervalHours > 0 ? response.intervalHours : null;
  }

  for (let i = 0; i < scriptOrder.length; i++) {
    const scriptName = scriptOrder[i];
    console.log(`\n[${i + 1}/${scriptOrder.length}] Starting ${scriptName.toUpperCase()}...`);

    await runScript(scriptName, true);

    if (i < scriptOrder.length - 1) {
      console.log(`\nCompleted ${scriptName.toUpperCase()}. Wating 5s...`);
      await delay(5000);
    } else {
      console.log(`\nCompleted ${scriptName.toUpperCase()}.`);
    }
  }

  console.log("-".repeat(60));
  console.log("Completed all wallets".green);
  console.log("-".repeat(60));
}

async function run() {
  showBanner();

  const response = await prompts({
    type: "select",
    name: "script",
    message: "Chose options:",
    choices: availableScripts,
  });

  const selectedScript = response.script;

  if (!selectedScript) {
    console.log("Invalid options...");
    return;
  }

  if (selectedScript === "all") {
    await runAllScriptsSequentially();
  } else if (selectedScript === "exit") {
    process.exit(0);
  } else {
    await runScript(selectedScript);
  }
}

run().catch((error) => {
  console.error("Error occurred:", error);
});

// module.exports = { runScript, runAllScriptsSequentially };
