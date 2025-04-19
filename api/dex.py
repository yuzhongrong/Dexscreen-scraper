import asyncio
import base64
import os
from curl_cffi.requests import AsyncSession
import json
import nest_asyncio
import re
import requests
import telebot  # 使用 pyTelegramBotAPI

# Apply nest_asyncio
nest_asyncio.apply()

Api = os.environ.get("API")  # Telegram Bot Token
ID = os.environ.get("CHANNEL_ID")  # Telegram Channel ID

class DexBot():
    def __init__(self, api_key, url, channel_id=ID, max_token=10):
        self.api_key = api_key
        self.channel_id = channel_id
        self.max_token = max_token
        self.url = url
        # 初始化 Telegram Bot
        if not self.api_key:
            raise ValueError("Telegram Bot Token (API) is not set")
        if not self.channel_id:
            raise ValueError("Telegram Channel ID (CHANNEL_ID) is not set")
        self.bot = telebot.TeleBot(self.api_key)

    def generate_sec_websocket_key(self):
        random_bytes = os.urandom(16)
        key = base64.b64encode(random_bytes).decode('utf-8')
        return key

    def get_headers(self):
        headers = {
            "Host": "io.dexscreener.com",
            "Connection": "Upgrade",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Upgrade": "websocket",
            "Origin": "https://dexscreener.com",
            'Sec-WebSocket-Version': '13',
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Sec-WebSocket-Key": self.generate_sec_websocket_key()
        }
        return headers

    def format_token_data(self):
        """
        Fetch information about specific tokens from the Dexscreener API and send to Telegram.
        """
        token_addresses = self.start()
        base_url = "https://api.dexscreener.com/latest/dex/tokens/"
        results = []

        for address in token_addresses:
            try:
                response = requests.get(f"{base_url}{address}")
                if response.status_code == 200:
                    data = response.json()
                    pairs = data.get('pairs', [])
                    if pairs and len(pairs) > 0:
                        pair_data = pairs[0]
                        results.append(pair_data)
                        # 格式化并发送到 Telegram
                        message = self.format_telegram_message(pair_data)
                        self.tg_send(message)
                    else:
                        results.append({"pairAddress": address, "Error": "No data Retrieved"})
                else:
                    results.append({"pairAddress": address, "Error": f"Status code {response.status_code}"})
            except requests.RequestException as e:
                results.append({"pairAddress": address, "Error": f"Request error: {str(e)}"})

        return json.dumps({"data": results}, indent=2)

    def format_telegram_message(self, pair_data):
        """
        Format token data into a Telegram message.
        """
        try:
            base_token = pair_data.get('baseToken', {})
            price_usd = pair_data.get('priceUsd', 'N/A')
            market_cap = pair_data.get('marketCap', 'N/A')
            volume = pair_data.get('volume', {}).get('h24', 'N/A')
            price_change = pair_data.get('priceChange', {}).get('h24', 'N/A')
            liquidity = pair_data.get('liquidity', {}).get('usd', 'N/A')
            url = pair_data.get('url', 'N/A')
            websites = pair_data.get('info', {}).get('websites', [])
            socials = pair_data.get('info', {}).get('socials', [])

            # 提取网站和 Twitter 链接
            website_url = next((w['url'] for w in websites if w['label'] == 'Website'), 'N/A')
            twitter_url = next((s['url'] for s in socials if s['type'] == 'twitter'), 'N/A')

            # 格式化消息 (MarkdownV2 格式)
            message = (
                f"*Token*: {base_token.get('name', 'N/A')} \\({base_token.get('symbol', 'N/A')}\\) \n"
                f"*Price*: \\${price_usd} \n"
                f"*Market Cap*: \\${market_cap:,.2f} \n"
                f"*24h Volume*: \\${volume:,.2f} \n"
                f"*24h Price Change*: {'+' if price_change > 0 else ''}{price_change}% \n"
                f"*Liquidity*: \\${liquidity:,.2f} \n"
                f"*Pair*: {url} \n"
                f"*Website*: {website_url} \n"
                f"*Twitter*: {twitter_url}"
            )
            return message
        except Exception as e:
            return f"Error formatting message: {str(e)}"

    async def connect(self):
        headers = self.get_headers()
        try:
            session = AsyncSession(headers=headers)
            ws = await session.ws_connect(self.url)
            print(self.url)

            while True:
                try:
                    data = await ws.recv()
                    if data:
                        response = data[0]
                        if "pairs" in str(response):
                            return response
                    else:
                        print("No data received.")
                        break
                except Exception as e:
                    print(f"Error receiving message: {str(e)}")
                    break

            await ws.close()
            await session.close()
        except Exception as e:
            print(f"Connection error: {str(e)}")
            return f"Connection error: {str(e)}"

    def tg_send(self, message):
        """
        Send a message to the Telegram channel.
        """
        try:
            self.bot.send_message(
                chat_id=self.channel_id,
                text=message,
                parse_mode='MarkdownV2',
                disable_web_page_preview=True
            )
            print(f"Message sent to Telegram: {message[:50]}...")
        except Exception as e:
            print(f"Telegram sending error: {e}")

    def start(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        mes = loop.run_until_complete(self.connect())
        loop.close()

        decoded_text = ''.join(chr(b) if 32 <= b <= 126 else ' ' for b in mes)
        words = [word for word in decoded_text.split() if len(word) >= 55]
        filtered_words = [re.sub(r'["*<$@(),.].*', '', word) for word in words]
        extracted_data = []

        for token in filtered_words:
            try:
                if "0x" in token:
                    token = re.findall(r'(0x[0-9a-fA-F]+)', token)[-1]
                elif "pump" in token:
                    token = re.findall(r".{0,40}pump", token)[0]
                else:
                    token = token[-44:]
                extracted_data.append(token)
            except Exception as e:
                print(f"There is an error in the token list: {e}")

        return extracted_data[:60]

    def token_getter(self, message):
        pass