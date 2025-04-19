import asyncio
import base64
import os
import time
import json
import re
import requests
from curl_cffi.requests import AsyncSession
import nest_asyncio
import telebot  # pyTelegramBotAPI
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Apply nest_asyncio
nest_asyncio.apply()

# 环境变量
API = os.environ.get("API")  # Telegram Bot Token
CHANNEL_ID = os.environ.get("CHANNEL_ID")  # Telegram Channel ID

class DexBot:
    def __init__(self, api_key=API, url=None, channel_id=CHANNEL_ID, max_token=10):
        self.api_key = api_key
        self.channel_id = channel_id
        self.max_token = max_token
        self.url = url
        # 验证环境变量
        if not self.api_key:
            logger.error("Telegram Bot Token (API) is not set")
            raise ValueError("Telegram Bot Token (API) is not set")
        if not self.channel_id:
            logger.error("Telegram Channel ID (CHANNEL_ID) is not set")
            raise ValueError("Telegram Channel ID (CHANNEL_ID) is not set")
        # 初始化 Telegram Bot
        self.bot = telebot.TeleBot(self.api_key)
        logger.info("DexBot initialized with Telegram Bot")

    def generate_sec_websocket_key(self):
        random_bytes = os.urandom(16)
        key = base64.b64encode(random_bytes).decode('utf-8')
        return key

    def get_headers(self):
        return {
            "Host": "io.dexscreener.com",
            "Connection": "Upgrade",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Upgrade": "websocket",
            "Origin": "https://dexscreener.com",
            "Sec-WebSocket-Version": "13",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Sec-WebSocket-Key": self.generate_sec_websocket_key()
        }

    def format_token_data(self):
        """
        Fetch token data from DexScreener API and send to Telegram.
        """
        token_addresses = self.start()
        logger.info(f"Processing {len(token_addresses)} token addresses")
        base_url = "https://api.dexscreener.com/latest/dex/tokens/"
        results = []

        for address in token_addresses[:self.max_token]:  # 限制处理数量
            try:
                logger.info(f"Fetching data for address: {address}")
                response = requests.get(f"{base_url}{address}", timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    pairs = data.get('pairs', [])
                    if pairs:
                        pair_data = pairs[0]
                        # 可选：过滤高潜力 token
                        price_change = pair_data.get('priceChange', {}).get('h24', 0)
                        if price_change > 100:  # 只处理 24h 价格变化 > 100% 的 token
                            results.append(pair_data)
                            message = self.format_telegram_message(pair_data)
                            self.tg_send(message)
                            time.sleep(1)  # 限制消息频率
                        else:
                            logger.info(f"Skipping {address}: 24h price change {price_change}% < 100%")
                    else:
                        results.append({"pairAddress": address, "Error": "No data retrieved"})
                        self.tg_send(f"Error: No data retrieved for address {address}")
                else:
                    error_msg = f"API Error: Status code {response.status_code} for address {address}"
                    logger.error(error_msg)
                    results.append({"pairAddress": address, "Error": error_msg})
                    self.tg_send(error_msg)
            except requests.RequestException as e:
                error_msg = f"Request error for address {address}: {str(e)}"
                logger.error(error_msg)
                results.append({"pairAddress": address, "Error": error_msg})
                self.tg_send(error_msg)
            time.sleep(0.5)  # API 调用间隔

        logger.info(f"Processed {len(results)} tokens")
        return json.dumps({"data": results}, indent=2)

    def format_telegram_message(self, pair_data):
        """
        Format token data into a Telegram message (MarkdownV2).
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

            # 提取链接
            website_url = next((w['url'] for w in websites if w['label'] == 'Website'), 'N/A')
            twitter_url = next((s['url'] for s in socials if s['type'] == 'twitter'), 'N/A')

            # MarkdownV2 格式，注意转义特殊字符
            message = (
                f"*Token*: {self.escape_md(base_token.get('name', 'N/A'))} \\({self.escape_md(base_token.get('symbol', 'N/A'))}\\) \n"
                f"*Price*: \\${self.escape_md(str(price_usd))} \n"
                f"*Market Cap*: \\${market_cap:,.2f} \n"
                f"*24h Volume*: \\${volume:,.2f} \n"
                f"*24h Price Change*: {self.escape_md('+' if price_change > 0 else '')}{price_change}% \n"
                f"*Liquidity*: \\${liquidity:,.2f} \n"
                f"*Pair*: {self.escape_md(url)} \n"
                f"*Website*: {self.escape_md(website_url)} \n"
                f"*Twitter*: {self.escape_md(twitter_url)}"
            )
            return message
        except Exception as e:
            error_msg = f"Error formatting message: {str(e)}"
            logger.error(error_msg)
            return error_msg

    def escape_md(self, text):
        """
        Escape special characters for MarkdownV2.
        """
        if not isinstance(text, str):
            text = str(text)
        special_chars = r'_*[]()~`>#+-=|{}.!'
        for char in special_chars:
            text = text.replace(char, f'\\{char}')
        return text

    async def connect(self):
        headers = self.get_headers()
        try:
            session = AsyncSession(headers=headers)
            ws = await session.ws_connect(self.url)
            logger.info(f"WebSocket connected: {self.url}")

            while True:
                try:
                    data = await ws.recv()
                    if data:
                        response = data[0]
                        if "pairs" in str(response):
                            logger.info("Received pairs data")
                            return response
                    else:
                        logger.warning("No data received from WebSocket")
                        break
                except Exception as e:
                    logger.error(f"Error receiving WebSocket message: {str(e)}")
                    break

            await ws.close()
            await session.close()
        except Exception as e:
            logger.error(f"WebSocket connection error: {str(e)}")
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
            logger.info(f"Message sent to Telegram: {message[:50]}...")
        except Exception as e:
            logger.error(f"Telegram sending error: {str(e)}")

    def start(self):
        if not self.url:
            logger.error("WebSocket URL is not set")
            return []
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        mes = loop.run_until_complete(self.connect())
        loop.close()

        if isinstance(mes, str) and "error" in mes.lower():
            logger.error(f"WebSocket error: {mes}")
            return []

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
                logger.info(f"Extracted token: {token}")
            except Exception as e:
                logger.error(f"Error in token extraction: {str(e)}")

        return extracted_data[:self.max_token]

    def token_getter(self, message):
        pass