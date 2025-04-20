from flask import Flask, request, render_template, jsonify
import json
import os
from api.dex import *  # Ensure DexBot is correctly imported

app = Flask(__name__, template_folder='../templates')

@app.route('/', methods=['GET'])
def root():
    return render_template("index.html")

@app.route('/dex', methods=['GET'])
def dex():
    try:
        text = """wss://io.dexscreener.com/dex/screener/v5/pairs/h24/1?rankBy[key]=trendingScoreH6&rankBy[order]=desc"""
        # Retrieve the filter string from the query parameter
        generated_text = request.args.get('generated_text', '')
        if generated_text:
            text += generated_text
        print(text)

        # Initialize DexBot with environment variables
        new_bot = DexBot(
            api_key=os.environ.get("API"),
            url=text,
            channel_id=os.environ.get("CHANNEL_ID", "Channel ID")
        )
        mes = new_bot.format_token_data()

        # Format the response JSON nicely for display
        mes_json = json.dumps(json.loads(mes), indent=4)

        return render_template("dex.html", mes=mes_json)
            
    except Exception as e:
        print(e)
        return f'''
            <body style="background-color:black; color:red; font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                <h2>Error occurred</h2>
                <p>{str(e)}</p>
                <p>Unable to send message.</p>
            </body>
        '''

@app.route('/dex/json', methods=['GET'])
def dex_json():
    try:
        text = """wss://io.dexscreener.com/dex/screener/v5/pairs/h24/1?rankBy[key]=trendingScoreH6&rankBy[order]=desc"""
        # Retrieve the filter string from the query parameter
        generated_text = request.args.get('generated_text', '')
        if generated_text:
            text += generated_text
        print(text)

        # Initialize DexBot with environment variables
        new_bot = DexBot(
            api_key=os.environ.get("API"),
            url=text,
            channel_id=os.environ.get("CHANNEL_ID", "Channel ID")
        )
        mes = new_bot.format_token_data()

        # Parse the JSON string and return as JSON response
        mes_json = json.loads(mes)
        return jsonify(mes_json)

    except Exception as e:
        print(e)
        # Return error as JSON
        return jsonify({
            "error": str(e),
            "message": "Unable to process request"
        }), 500

if __name__ == '__main__':
    app.run(debug=True)