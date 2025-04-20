# 📈 Dexscreener Scraper 📊

A Python tool for extracting real-time trading data from Dexscreener (dexscreener.com) via WebSocket ⚡ and HTTP requests 🌐.

## Description 📝

This project provides a Flask based Python script 🐍 designed to automate the retrieval of live trading data from Dexscreener. It utilizes both WebSocket connections 🔌 for real-time updates and HTTP requests 📡 for static data, enabling users to efficiently monitor 👁️ and analyze decentralized exchange (DEX) activity.

## Features ✨

- **Real-time WebSocket Data 🚀:** Captures live price updates 💰, volume changes 📈, and other dynamic data directly from Dexscreener's WebSocket feed.
- **HTTP Data Retrieval 📦:** Fetches static data, such as token information ℹ️ and historical data 🕰️, using dexscreener official api.
- **Modular Design 🧩:** Filters can be added as desired 🛠️, allowing users to customize data retrieval and processing.
- **Data Parsing and Formatting 📄:** Parses the raw data from Dexscreener into a structured format (e.g., JSON) for easy use in other applications.
- **Error Handling 🛡️:** Implements robust error handling to ensure stable and reliable data retrieval.

## Installation 🛠️

1.  **Clone the repository 📥:**

    ```bash
    git clone https://github.com/doffn/Dexscreen-scraper.git
    cd Dexscreener-scraper
    ```

2.  **Install dependencies 📦:**

    ```bash
    pip install -r requirements.txt
    ```

## Usage 🚀

1.  **Run the scraper 🏃:**

    ```bash
    export FLASK_APP=api.index
    export API=7263379847:AAHZaaKZNtxXqoSM_nhxz5tdNGfpUWvulnk
    export CHANNEL_ID=@Pumpfun_api_bot
    python -m flask run
    ```

2.  **Configuration (Optional) ⚙️:**
    - Modify the `Filter` to customize the scraping parameters, such as target trading pairs 🎯, data output 📄, and WebSocket connection settings 🔌.
    - You may need to inspect the Dexscreener website 🌐 to identify the correct trading filter identifiers.

## Example Output 📊

The script outputs data in JSON format 📄 to the console or as specified in the configuration. Example:

```json
{
      "chainId": "bsc",
      "dexId": "pancakeswap",
      "url": "https://dexscreener.com/bsc/0x8c022004014db789d8fe2c97ac619fade5ffa244",
      "pairAddress": "0x8c022004014Db789d8fE2c97aC619FADE5ffA244",
      "labels": [
        "v3"
      ],
      "baseToken": {
        "address": "0xcCe08BeFb7640357166932399311a434e54799c5",
        "name": "Muppets",
        "symbol": "MUPPETS"
      },
      "quoteToken": {
        "address": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        "name": "Wrapped BNB",
        "symbol": "WBNB"
      },
      "priceNative": "0.00001594",
      "priceUsd": "0.009610",
      "txns": {
        "m5": {
          "buys": 124,
          "sells": 97
        },
        "h1": {
          "buys": 2346,
          "sells": 1919
        },
        "h6": {
          "buys": 21345,
          "sells": 17708
        },
        "h24": {
          "buys": 27700,
          "sells": 23008
        }
      },
      "volume": {
        "h24": 23690217.59,
        "h6": 21011813.68,
        "h1": 2983195.4,
        "m5": 142060.36
      },
      "priceChange": {
        "m5": 2.67,
        "h1": -12.71,
        "h6": 1012,
        "h24": 12341
      },
      "liquidity": {
        "usd": 528595.18,
        "base": 30637307,
        "quote": 388.4129
      },
      "fdv": 9610615,
      "marketCap": 9610615,
      "pairCreatedAt": 1743245657000,
      "info": {
        "imageUrl": "https://dd.dexscreener.com/ds-data/tokens/bsc/0xcce08befb7640357166932399311a434e54799c5.png?key=c661a2",
        "header": "https://dd.dexscreener.com/ds-data/tokens/bsc/0xcce08befb7640357166932399311a434e54799c5/header.png?key=c661a2",
        "openGraph": "https://cdn.dexscreener.com/token-images/og/bsc/0xcce08befb7640357166932399311a434e54799c5?timestamp=1743273900000",
        "websites": [
          {
            "label": "Website",
            "url": "https://linktr.ee/muppetsbinance"
          }
        ],
        "socials": [
          {
            "type": "twitter",
            "url": "https://x.com/BNBCHAIN/status/1905935769803350315"
          }
        ]
      }
    },
```

## Dependencies 📦

- `Flask`
- `websockets`
- `requests`
- `json` (standard Python library)

## Ethical Considerations ⚖️

- This project is intended for personal and educational use 📚.
- Users are responsible for complying with Dexscreener's terms of service 📜.
- Avoid excessive requests 🛑 that could overload Dexscreener's servers.

## Disclaimer ⚠️

This project is provided "as is" without any warranty 🚫. Use it at your own risk ⚠️. The developers are not responsible for any consequences resulting from its use.

## Contributing 🤝

Pull requests are welcome 🎉. For major changes, please open an issue 💬 first to discuss what you would like to change.

## Credits 🙌

This project was created by **Dawit Neri**

## NOTE 🗒

If you want to run on a specific filter, define the filter. By default the `/dex` route gives the home page of dexscreener without any filter.

## Support 💬

If you encounter any issues or have any questions, feel free to reach out to dawitneri888@gmail.com or open an issue in the GitHub repository. Thank you for using my app.
