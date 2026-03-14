import requests
from bs4 import BeautifulSoup

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
}

race_id = "202606020611"
url = f"https://race.netkeiba.com/race/shutuba.html?race_id={race_id}"
res = requests.get(url, headers=HEADERS, timeout=10)
res.encoding = 'EUC-JP'
soup = BeautifulSoup(res.text, 'html.parser')
rows = soup.select('tr.HorseList')

if rows:
    row = rows[0]
    print("--- FIRST ROW HTML ---")
    print(row.prettify()[:1000])
    print("--- HORSE NAME ---")
    name_elem = row.select_one('.HorseName a') or row.select_one('.HorseName')
    print(name_elem.get_text(strip=True) if name_elem else "Not found")
else:
    print("No rows found")
