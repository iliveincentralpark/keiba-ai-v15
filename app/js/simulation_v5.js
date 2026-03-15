/**
 * simulation_v5.js
 * CSV学習機能付きシミュレーター (V5: AI連携強化)
 */

let currentRows = [];

function parseCSV(text) {
    const rows = [];
    let current = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];

        if (ch === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === ',' && !inQuotes) {
            current.push(cell.trim());
            cell = '';
            continue;
        }

        if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (ch === '\r' && next === '\n') i += 1;
            current.push(cell.trim());
            if (current.some(value => value !== '')) rows.push(current);
            current = [];
            cell = '';
            continue;
        }

        cell += ch;
    }

    if (cell || current.length) {
        current.push(cell.trim());
        if (current.some(value => value !== '')) rows.push(current);
    }

    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map(values => {
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = (values[index] || '').trim();
        });
        return obj;
    });
}

/**
 * 読み込んだCSVデータを一括でバックエンドのDBに送信してAIに覚えさせる
 */
async function importToAI() {
    if (currentRows.length === 0) return alert("まずはCSVを読み込んでください");

    const btn = document.getElementById('import-ai-btn');
    btn.disabled = true;
    btn.textContent = '思考回路に書き込み中... 🧠';

    // CSVのカラム名を現在のAPIの期待する形式にマッピング
    const payload = currentRows.map((r, index) => {
        const points = parseInt(r['点数'] || 0, 10) || 1;
        return {
            race_id: r['race_id'] || `csv_import_${Date.now()}_${index}`,
            race_date: r['開催日'] || '',
            venue: r['競馬場'] || '',
            distance: r['距離'] || '',
            race_name: r['レース名'] || 'CSVインポート履歴',
            bet_type: r['券種'] || '不明',
            bet_method: r['買い方'] || '不明',
            points,
            amount: parseInt(r['購入額'] || 0, 10) || 0,
            refund: parseInt(r['払戻'] || 0, 10) || 0,
            is_hit: (parseInt(r['的中'] || 0, 10) === 1 || parseInt(r['払戻'] || 0, 10) > 0) ? 1 : 0,
            jiku_horses: r['軸馬番'] || '',
            aite_horses: r['相手馬番'] || '',
            jiku_names: r['軸馬名'] || r['馬名'] || '',
            aite_names: r['相手馬名'] || '',
            jiku_pops: r['軸人気'] || r['人気'] || '',
            aite_pops: r['相手人気'] || '',
            jiku_odds: r['軸オッズ'] || '',
            aite_odds: r['相手オッズ'] || ''
        };
    });

    try {
        const res = await fetch('/api/import_csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            alert(`✅ 学習完了！ ${result.count}件のデータをAIが記憶しました。解析画面に戻ると、人気帯・券種・買い方の傾向が予想に反映されます。`);
            btn.textContent = '学習完了 ✅';
            btn.style.background = '#3fb950';
        } else {
            throw new Error(result.detail || "学習に失敗しました");
        }
    } catch (e) {
        alert("エラー: " + e.message);
        btn.disabled = false;
        btn.textContent = '再試行';
    }
}

function processData(rows) {
    currentRows = rows;
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('results-area').style.display = 'block';

    // サマリー計算
    const cost = rows.reduce((s, r) => s + parseInt(r['購入額'] || 0), 0);
    const ret = rows.reduce((s, r) => s + parseInt(r['払戻'] || 0), 0);
    const hitCount = rows.filter(r => (parseInt(r['的中'] || 0) === 1 || parseInt(r['払戻'] || 0) > 0)).length;

    document.getElementById('summary-grid').innerHTML = `
        <div class="summary-card"><div class="label">的中数</div><div class="value">${hitCount}件</div></div>
        <div class="summary-card"><div class="label">総投資</div><div class="value">¥${cost.toLocaleString()}</div></div>
        <div class="summary-card"><div class="label">総払戻</div><div class="value">¥${ret.toLocaleString()}</div></div>
        <div class="summary-card" style="border:1px solid #d4af37;"><div class="label">回収率</div><div class="value">${cost > 0 ? Math.round(ret / cost * 100) : 0}%</div></div>
    `;

    // AI学習ボタンの設置
    if (!document.getElementById('import-ai-btn')) {
        const btnContainer = document.createElement('div');
        btnContainer.style = "padding:20px; text-align:center;";

        const btn = document.createElement('button');
        btn.id = 'import-ai-btn';
        btn.innerHTML = '🔥 AIにこの「勝ちパターン」を学習させる';
        btn.style = "width:100%; max-width:400px; padding:18px; background:linear-gradient(135deg, #d4af37, #f0c040); color:#000; border:none; border-radius:50px; font-weight:900; font-size:1rem; box-shadow:0 10px 20px rgba(0,0,0,0.3); cursor:pointer; transition:transform 0.2s;";
        btn.onmousedown = () => btn.style.transform = "scale(0.95)";
        btn.onmouseup = () => btn.style.transform = "scale(1)";
        btn.onclick = importToAI;

        btnContainer.appendChild(btn);

        const info = document.createElement('p');
        info.innerHTML = "※このボタンを押すと、AIが過去の人気帯・券種・買い方の傾向を分析し、次回の予想に反映させます。";
        info.style = "font-size:0.7rem; color:#8b949e; margin-top:10px;";
        btnContainer.appendChild(info);

        document.getElementById('results-area').after(btnContainer);
    }
}

function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const rows = parseCSV(e.target.result);
        if (rows.length > 0) processData(rows);
    };
    reader.readAsText(file, 'UTF-8');
}

document.addEventListener('DOMContentLoaded', () => {
    const area = document.getElementById('upload-area');
    const input = document.getElementById('csv-file-input');
    if (area) area.onclick = () => input.click();
    if (input) input.onchange = e => handleFile(e.target.files[0]);
});
