import requests
from bs4 import BeautifulSoup

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
}

def test(horse_id):
    url = f"https://db.netkeiba.com/horse/{horse_id}/"
    res = requests.get(url, headers=HEADERS, timeout=8)
    res.encoding = 'EUC-JP'
    print(f"Status: {res.status_code}")
    soup = BeautifulSoup(res.text, 'html.parser')
    table = soup.select_one('table.db_h_race_results')
    if not table:
        print("Table not found")
        return
    rows = table.select('tr')
    print(f"Total rows: {len(rows)}")
    if len(rows) > 1:
        tds = rows[1].find_all('td')
        print(f"Total columns in first row: {len(tds)}")
        for i, td in enumerate(tds):
            print(f"Col {i}: {td.get_text(strip=True)}")

# Use standard horse id for testing like Equinox (2019105258)
test("2019105258")
