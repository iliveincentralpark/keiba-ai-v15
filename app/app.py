import os
import json
import requests
import re
import traceback
from flask import Flask, jsonify, request
from flask_cors import CORS
from scraper import get_netkeiba_odds

app = Flask(__name__)
CORS(app)

@app.route('/api/scrape', methods=['GET'])
def scrape_odds():
    url = request.args.get('url')
    print(f"\n--- API Request: {url} ---")
    if not url:
        return jsonify({"error": "URL is required"}), 400
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        race_id = None
        # race_id 抽出
        id_match = re.search(r'race_id=(\d+)', url)
        if id_match:
            race_id = id_match.group(1)

        # 特集ページ対応
        if "special/index.html" in url:
            print("INFO: Handling special page...")
            res_sp = requests.get(url, headers=headers, timeout=5)
            res_sp.encoding = 'EUC-JP'
            match = re.search(r'race_id=(\d+)', res_sp.text)
            if match:
                race_id = match.group(1)
                url = f"https://race.netkeiba.com/race/shutuba.html?race_id={race_id}"
                print(f"INFO: Converted to {url}")

        # 出馬表取得
        response = requests.get(url, headers=headers, timeout=10)
        response.encoding = 'EUC-JP'
        if response.status_code != 200:
            return jsonify({"error": f"Netkeiba returned status {response.status_code}"}), 500
            
        # 解析 (race_id を確実に渡す)
        data = get_netkeiba_odds(response.text, race_id=race_id)
        
        print(f"INFO: Found {len(data.get('horses', []))} horses. Status: {'OK' if data['horses'] else 'EMPTY'}")

        try:
            os.makedirs('data', exist_ok=True)
            with open('data/live_data.json', 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print("INFO: Saved data to data/live_data.json")
        except Exception as e:
            print(f"WARN: Could not save live_data.json: {e}")

        return jsonify({
            "success": True,
            "data": data,
            "debug": {
                "race_id": race_id,
                "url_used": url,
                "logs": data.get("debug_logs", [])
            }
        })
    except Exception as e:
        err = traceback.format_exc()
        print(f"EXCEPTION: {err}")
        return jsonify({"error": str(e), "traceback": err}), 500

if __name__ == '__main__':
    print("Flask Server running on http://127.0.0.1:5050")
    app.run(debug=False, port=5050, host='127.0.0.1', threaded=True)
