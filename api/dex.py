import asyncio
import base64
import os
from curl_cffi.requests import AsyncSession
import json
import nest_asyncio
from datetime import datetime
import time
import struct
from decimal import Decimal, ROUND_DOWN
import re
import aiohttp  # 替换 requests 以支持异步请求
import telebot

# Apply nest_asyncio
nest_asyncio.apply()

Api = os.environ.get("API")  # Telegram Bot Token
ID = os.environ.get("CHANNEL_ID", "Channel ID")  # Telegram Channel ID

class DexBot:
    def __init__(self, api_key=Api, url=None, channel_id=ID, max_token=3):  # 减少默认 max_token
        self.api_key = api_key
        self.channel_id = channel_id
        self.max_token = max_token
        self.url = url
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

    async def fetch_token_data(self, address, session):
        """异步获取单个代币的交易对数据"""
        base_url = "https://api.dexscreener.com/latest/dex/tokens/"
        try:
            async with session.get(f"{base_url}{address}", timeout=5) as response:
                if response.status == 200:
                    data = await response.json()
                    pairs = data.get('pairs', [])
                    if pairs:
                        return address, pairs
                    return address, [{"pairAddress": address, "Error": "No pairs found"}]
                return address, [{"pairAddress": address, "Error": f"Status code {response.status}"}]
        except Exception as e:
            return address, [{"pairAddress": address, "Error": f"Request error: {str(e)}"}]

    async def format_token_data(self):
        """
        Fetch information about specific tokens from the Dexscreener API.
        Return all pairs without filtering.

        Returns:
            str: JSON string containing data for each token address.
        """
        token_addresses = self.start()
        results = {}

        async with aiohttp.ClientSession() as session:
            tasks = [self.fetch_token_data(address, session) for address in token_addresses[:self.max_token]]
            responses = await asyncio.gather(*tasks, return_exceptions=True)

            for address, result in responses:
                results[address] = result

        return json.dumps({"data": results}, indent=2)

    async def connect(self):
        headers = self.get_headers()
        try:
            session = AsyncSession(headers=headers)
            ws = await session.ws_connect(self.url, timeout=5)  # 添加超时
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
        try:
            self.bot.send_message(self.channel_id, message, parse_mode='MarkdownV2', disable_web_page_preview=True)
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
                    print(token)
                elif "pump" in token:
                    token = re.findall(r".{0,40}pump", token)[0]
                else:
                    token = token[-44:]
                extracted_data.append(token)
            except Exception as e:
                print(f"There is an error in the token list: {e}")

        return extracted_data[:self.max_token]

    def token_getter(self, message):
        pass