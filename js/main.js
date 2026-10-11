/*****************************************************
 * main.js - Hybrid Placeholder + Future Expandability
 *****************************************************/

/** 
 * goToPage - Simple function to navigate between pages.
 */
function goToPage(page) {
  window.location.href = page;
}

/**
 * connectWallet - Handles wallet connection using ethers.js and backend API.
 */
async function connectWallet() {
    if (typeof window.ethereum === "undefined") {
        alert("MetaMask is not installed. Please install MetaMask to use this feature.");
        return;
    }

    try {
        console.log("Checking existing connection...");
        const provider = new ethers.providers.Web3Provider(window.ethereum);

        // Check if already connected
        const accounts = await window.ethereum.request({ method: "eth_accounts" });

        if (accounts.length > 0) {
            console.log("Wallet already connected:", accounts[0]);
            updateWalletUI(accounts[0]);
            return; // Avoid sending another connection request
        }

        console.log("Requesting wallet connection...");
        const newAccounts = await window.ethereum.request({ method: "eth_requestAccounts" });

        if (!newAccounts || newAccounts.length === 0) {
            throw new Error("No accounts found. Please connect to MetaMask.");
        }

        console.log("Connected Wallet Address:", newAccounts[0]);
        updateWalletUI(newAccounts[0]);

        // Ensure user is on Binance Smart Chain (BSC)
        const chainId = await window.ethereum.request({ method: "eth_chainId" });

        if (chainId !== "0x38") { // 0x38 = BSC Mainnet
            alert("Please switch to Binance Smart Chain (BSC Mainnet) in MetaMask.");
            return;
        }

        alert("Wallet connected successfully!");
    } catch (error) {
        console.error("Error connecting wallet:", error);
        alert("Failed to connect wallet: " + error.message);
    }
}

// Function to update UI with wallet address
function updateWalletUI(walletAddress) {
    document.querySelectorAll(".neon-btn").forEach(button => {
        if (button.innerText === "Connect Wallet") {
            button.innerText = walletAddress.slice(0, 6) + "..." + walletAddress.slice(-4);
        }
    });

    // Store the wallet in session storage
    sessionStorage.setItem("connectedWallet", walletAddress);
}

// Reconnect wallet if user reloads the page
async function checkExistingWallet() {
    const storedWallet = sessionStorage.getItem("connectedWallet");

    if (storedWallet) {
        console.log("Reconnecting previous wallet:", storedWallet);
        updateWalletUI(storedWallet);
    } else {
        console.log("No previous wallet found.");
    }
}

// Run check on page load
window.addEventListener("load", checkExistingWallet);

/**
 * Fetch PROC price from backend
 */
async function fetchProcData() {
    const contractAddress = "0x372dC085148adDeA482671473BFa97a27DEA7081"; // PROC Contract
    const apiUrl = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.pairs && data.pairs.length > 0 && data.pairs[0].priceUsd) {
            const price = parseFloat(data.pairs[0].priceUsd).toFixed(6);
            const marketCap = (parseFloat(price) * 1618033988000).toFixed(2); // Total supply

            // Ensure elements exist before updating them
            const procPriceElement = document.getElementById("procPrice");
            const marketCapElement = document.getElementById("marketCap");

            if (procPriceElement) {
                procPriceElement.textContent = `$${price}`;
            }
            if (marketCapElement) {
                marketCapElement.textContent = `$${marketCap} USD`;
            }
        }
    } catch (error) {
        console.error("Error fetching PROC price:", error);
    }
}

// Fetch price every 10 seconds
setInterval(fetchProcData, 10000);
fetchProcData();

/**
 * Fetch Top Net Buyers for Flash Sale Leaderboard
 */
const PROC_CONTRACT = "0x372dC085148adDeA482671473BFa97a27DEA7081"; // PROC Contract Address
const BSC_API_KEY = "HHCUH925WWQ9FKGNU88TWMJNJC7FHAY8Z8"; // BscScan API Key

// Hard-code competition start & end timestamps for Feb 23, 2025 (UTC)
const feb23_2025_UTC = new Date(Date.UTC(2025, 1, 23, 0, 0, 0));
const competitionStart = Math.floor(feb23_2025_UTC.getTime() / 1000);
const competitionEnd = competitionStart + 86400; // 24 hours

async function fetchTopNetBuyers() {
    const BURN_ADDRESS = "0x000000000000000000000000000000000000dead"; // Standard Burn Address
    
    // The actual PancakeSwap Pair for PROC (based on your DexScreener link/logs)
    // Replace with the correct pair address if needed.
    const PANCAKESWAP_PAIR = "0xa9010893dd2de8a39c9fa6d08ceaea4963d62664".toLowerCase();

    const url = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${PROC_CONTRACT}&startblock=0&endblock=99999999&sort=desc&apikey=${BSC_API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.result) {
            console.error("Error fetching transaction data:", data);
            return;
        }

        // Object to track buys, sells, and net buys
        const buyers = {};

        data.result.forEach(tx => {
            const fromWallet = tx.from.toLowerCase();
            const toWallet = tx.to.toLowerCase();
            const amount = parseFloat(tx.value) / 1e18; // Convert from Wei to PROC
            const timestamp = parseInt(tx.timeStamp);

            // Ignore transactions outside competition time window
            if (timestamp < competitionStart || timestamp > competitionEnd) {
                return;
            }

            // Ignore transactions involving the burn address
            if (toWallet === BURN_ADDRESS || fromWallet === BURN_ADDRESS) {
                return;
            }

            // === BUY: from the Pair to the user ===
            if (fromWallet === PANCAKESWAP_PAIR && tx.value > 0) {
                if (!buyers[toWallet]) {
                    buyers[toWallet] = { buys: 0, sells: 0, net: 0 };
                }
                buyers[toWallet].buys += amount;
                buyers[toWallet].net += amount;
            }

            // === SELL: from the user to the Pair ===
            if (toWallet === PANCAKESWAP_PAIR && tx.value > 0) {
                if (!buyers[fromWallet]) {
                    buyers[fromWallet] = { buys: 0, sells: 0, net: 0 };
                }
                buyers[fromWallet].sells += amount;
                buyers[fromWallet].net -= amount;
            }
        });

        // Sort buyers by net PROC purchased and get top 10
        const sortedNetBuyers = Object.entries(buyers)
            .sort((a, b) => b[1].net - a[1].net)
            .slice(0, 10);

        // Update leaderboard table
        const leaderboardTable = document.getElementById("flashBuyLeaderboard");
        leaderboardTable.innerHTML = sortedNetBuyers.map(([wallet, data], index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${wallet.slice(0, 6)}...${wallet.slice(-4)}</td>
                <td>${data.buys.toFixed(2)} PROC</td>
                <td>${data.sells.toFixed(2)} PROC</td>
                <td>${data.net.toFixed(2)} PROC</td>
            </tr>
        `).join("");

        console.log("Leaderboard Updated Successfully");

    } catch (error) {
        console.error("Failed to fetch net buyers data:", error);
    }
}

// Run updates only during competition hours
function startNetBuyerTracking() {
    const now = Math.floor(Date.now() / 1000);

    if (now >= competitionStart && now <= competitionEnd) {
        fetchTopNetBuyers();
        setInterval(fetchTopNetBuyers, 300000); // Update every 5 minutes
    } else {
        console.log("Competition is outside active hours.");
    }
}

// Start tracking
startNetBuyerTracking();