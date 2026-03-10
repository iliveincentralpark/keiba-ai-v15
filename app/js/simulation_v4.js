/**
 * simulation_v4.js
 * CSV学習機能付きシミュレーター (V4)
 */

let charts = {};
let currentRows = [];

function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const vals = line.split(',');
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
        return obj;
    });
}

async function importToAI() {
    if (currentRows.length === 0) return alert("まずはCSVを読み込んでください");

    const btn = document.getElementById('import-ai-btn');
    btn.disabled = true;
    btn.textContent = '学習中...';

    // CSV形式をAPI形式に変換
    const payload = currentRows.map(r => ({
        race_id: "000000000000", // 履歴用
        race_name: r['レース名'] || 'CSV Record',
        bet_type: r['券種'] || '不明',
        bet_method: r['買い方'] || '不明',
        points: 0,
        amount: parseInt(r['購入額'] || 0),
        refund: parseInt(r['払戻'] || 0),
        is_hit: parseInt(r['的中'] || 0),
        jiku_pops: r['人気'] || "0", // 軸の人気を想定
        jiku_names: r['馬名'] || ""
    }));

    try {
        const res = await fetch('/api/import_csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            alert(`学習完了！ ${result.count}件のデータをAIが記憶しました。`);
        }
    } catch (e) { alert("エラーが発生しました"); }
    finally { btn.disabled = false; btn.textContent = 'AIに学習させる'; }
}

function processData(rows) {
    currentRows = rows;
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('results-area').style.display = 'block';

    // インポートボタンを表示
    if (!document.getElementById('import-ai-btn')) {
        const btn = document.createElement('button');
        btn.id = 'import-ai-btn';
        btn.innerHTML = '🔥 このデータをAIに学習させる';
        btn.style = "width:100%; padding:15px; margin-top:20px; background:#d4af37; color:#000; border:none; border-radius:12px; font-weight:900; cursor:pointer;";
        btn.onclick = importToAI;
        document.getElementById('summary-grid').after(btn);
    }

    // 既存の統計処理(簡略)
    const cost = rows.reduce((s, r) => s + parseInt(r['購入額'] || 0), 0);
    const ret = rows.reduce((s, r) => s + parseInt(r['払戻'] || 0), 0);
    document.getElementById('summary-grid').innerHTML = `
        <div class="summary-card"><div class="label">総投資</div><div class="value">¥${cost.toLocaleString()}</div></div>
        <div class="summary-card"><div class="label">回収率</div><div class="value">${cost > 0 ? Math.round(ret / cost * 100) : 0}%</div></div>
    `;
}

function handleFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
        const rows = parseCSV(e.target.result);
        processData(rows);
    };
    reader.readAsText(file, 'UTF-8');
}

document.addEventListener('DOMContentLoaded', () => {
    const area = document.getElementById('upload-area');
    const input = document.getElementById('csv-file-input');
    if (area) area.onclick = () => input.click();
    if (input) input.onchange = e => handleFile(e.target.files[0]);
});
