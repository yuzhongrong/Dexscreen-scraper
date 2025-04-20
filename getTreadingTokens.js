const axios = require("axios");

// Function to convert timestamp to readable date
const timestampToDate = (timestamp) => {
  return new Date(timestamp).toUTCString();
};

// Function to summarize token data
const summarizeTokenData = (tokenData, tokenName) => {
  console.log(`\n=== Summary for ${tokenName} ===`);
  tokenData.forEach((pair) => {
    const dexId = pair.dexId || "Unknown";
    const pairAddress = pair.pairAddress || "Unknown";
    const priceUsd = parseFloat(pair.priceUsd || 0);
    const liquidityUsd = pair.liquidity?.usd || 0;
    const volumeH24 = pair.volume?.h24 || 0;
    const priceChangeH24 = pair.priceChange?.h24 || 0;
    const pairCreatedAt = timestampToDate(pair.pairCreatedAt || 0);
    const quoteToken = pair.quoteToken?.symbol || "Unknown";

    console.log(`\nDEX: ${dexId}`);
    console.log(`Pair Address: ${pairAddress}`);
    console.log(`Price (USD): $${priceUsd.toFixed(6)}`);
    console.log(`Liquidity (USD): $${liquidityUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    console.log(`24h Volume (USD): $${volumeH24.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    console.log(`24h Price Change: ${priceChangeH24.toFixed(2)}%`);
    console.log(`Pair Created At: ${pairCreatedAt}`);
    console.log(`Quote Token: ${quoteToken}`);
  });
};

// Function to compare tokens across DEXs
const compareTokens = (data) => {
  const tokens = data.data || {};

  for (const [tokenAddress, tokenData] of Object.entries(tokens)) {
    const tokenName = tokenData[0]?.baseToken?.name || "Unknown";
    summarizeTokenData(tokenData, tokenName);

    // Calculate average price and total liquidity
    const prices = tokenData
      .filter((pair) => pair.priceUsd)
      .map((pair) => parseFloat(pair.priceUsd));
    const liquidities = tokenData
      .filter((pair) => pair.liquidity?.usd)
      .map((pair) => pair.liquidity.usd);

    const avgPrice = prices.length ? prices.reduce((sum, p) => sum + p, 0) / prices.length : 0;
    const totalLiquidity = liquidities.length ? liquidities.reduce((sum, l) => sum + l, 0) : 0;

    console.log(`\n--- ${tokenName} Aggregated Stats ---`);
    console.log(`Average Price (USD): $${avgPrice.toFixed(6)}`);
    console.log(`Total Liquidity (USD): $${totalLiquidity.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  }
};

// Function to fetch JSON data from local interface
const fetchTokenData = async () => {
  try {
    // Adjust the URL based on your local server's address and port
    const response = await axios.get("http://localhost:3000/dex/json");
    const jsonData = response.data;

    // Process the fetched data
    compareTokens(jsonData);
  } catch (error) {
    console.error(`Error fetching or processing JSON data: ${error.message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
    }
  }
};

// Main execution
fetchTokenData();