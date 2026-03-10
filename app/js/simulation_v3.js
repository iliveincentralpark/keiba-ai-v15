/**
 * simulation.js
 * 回収率シミュレーター - CSVを読み込んでグラフ・統計を描画
 */

let charts = {};

// ---- CSV パーサー (シンプル実装) ----
function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        // カンマが馬名等に含まれていないため単純分割でOK
        const vals = line.split(',');
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
        return obj;
    });
}

// ---- 集計ユーティリティ ----
function groupBy(rows, keyFn) {
    const map = {};
    rows.forEach(row => {
        const key = keyFn(row);
        if (!map[key]) map[key] = { cost: 0, ret: 0, hits: 0, count: 0 };
        map[key].cost += parseInt(row['購入額'] || 0);
        map[key].ret += parseInt(row['払戻'] || 0);
        map[key].hits += parseInt(row['的中'] || 0);
        map[key].count += 1;
    });
    return map;
}

function roi(cost, ret) {
    return cost > 0 ? Math.round(ret / cost * 100) : 0;
}

// ---- Chart.js 共通オプション ----
const BAR_DEFAULTS = {
    plugins: { legend: { display: false } },
    scales: {
        x: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: {
            ticks: {
                color: 'rgba(255,255,255,0.7)', font: { size: 11 },
                callback: v => v + '%'
            },
            grid: { color: 'rgba(255,255,255,0.07)' }
        }
    },
    animation: { duration: 500 }
};

function colorForROI(v) {
    return v >= 100 ? 'rgba(76,175,80,0.75)' : 'rgba(244,67,54,0.65)';
}

function renderBarChart(id, labels, values, label = '回収率(%)') {
    const ctx = document.getElementById(id).getContext('2d');
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label,
                data: values,
                backgroundColor: values.map(colorForROI),
                borderRadius: 6,
            }]
        },
        options: {
            ...BAR_DEFAULTS,
            plugins: {
                ...BAR_DEFAULTS.plugins,
                tooltip: { callbacks: { label: ctx => `${ctx.parsed.y}%` } }
            }
        }
    });
}

function renderLineChart(id, labels, costData, retData) {
    const ctx = document.getElementById(id).getContext('2d');
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: '投資額', data: costData, borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,0.1)', tension: 0.3, fill: true },
                { label: '払戻合計', data: retData, borderColor: '#4caf50', backgroundColor: 'rgba(76,175,80,0.1)', tension: 0.3, fill: true },
            ]
        },
        options: {
            plugins: { legend: { labels: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } } } },
            scales: {
                x: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: {
                    ticks: {
                        color: 'rgba(255,255,255,0.7)', font: { size: 11 },
                        callback: v => `¥${v.toLocaleString()}`
                    },
                    grid: { color: 'rgba(255,255,255,0.07)' }
                }
            },
            animation: { duration: 500 }
        }
    });
}

// ---- データ処理メイン ----
function processData(rows) {
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('results-area').style.display = 'block';

    const totalCost = rows.reduce((s, r) => s + parseInt(r['購入額'] || 0), 0);
    const totalRet = rows.reduce((s, r) => s + parseInt(r['払戻'] || 0), 0);
    const totalHits = rows.reduce((s, r) => s + parseInt(r['的中'] || 0), 0);
    const totalROI = roi(totalCost, totalRet);
    const hitRate = rows.length > 0 ? Math.round(totalHits / rows.length * 100) : 0;

    // Summary cards
    const summaryGrid = document.getElementById('summary-grid');
    summaryGrid.innerHTML = `
        <div class="summary-card">
            <div class="label">総投資額</div>
            <div class="value gold">¥${totalCost.toLocaleString()}</div>
        </div>
        <div class="summary-card">
            <div class="label">総払戻額</div>
            <div class="value ${totalRet >= totalCost ? 'green' : 'red'}">¥${totalRet.toLocaleString()}</div>
        </div>
        <div class="summary-card">
            <div class="label">回収率</div>
            <div class="value ${totalROI >= 100 ? 'green' : 'red'}">${totalROI}%</div>
        </div>
        <div class="summary-card">
            <div class="label">的中率</div>
            <div class="value">${hitRate}%</div>
        </div>
        <div class="summary-card">
            <div class="label">総レコード数</div>
            <div class="value">${rows.length}件</div>
        </div>
        <div class="summary-card">
            <div class="label">的中回数</div>
            <div class="value green">${totalHits}回</div>
        </div>
    `;

    // 券種別
    const byType = groupBy(rows, r => r['券種'] || '不明');
    const typeKeys = Object.keys(byType);
    renderBarChart('chart-by-type', typeKeys, typeKeys.map(k => roi(byType[k].cost, byType[k].ret)));

    // 買い方別
    const byMethod = groupBy(rows, r => r['買い方'] || '不明');
    const methodKeys = Object.keys(byMethod);
    renderBarChart('chart-by-method', methodKeys, methodKeys.map(k => roi(byMethod[k].cost, byMethod[k].ret)));

    // 月別
    const byMonth = {};
    rows.forEach(r => {
        const d = r['開催日'] || '';
        const ym = d.slice(0, 7); // "YYYY/MM"
        if (!ym) return;
        if (!byMonth[ym]) byMonth[ym] = { cost: 0, ret: 0 };
        byMonth[ym].cost += parseInt(r['購入額'] || 0);
        byMonth[ym].ret += parseInt(r['払戻'] || 0);
    });
    const monthKeys = Object.keys(byMonth).sort();
    renderLineChart('chart-monthly', monthKeys,
        monthKeys.map(k => byMonth[k].cost),
        monthKeys.map(k => byMonth[k].ret)
    );

    // 券種別テーブル
    const tbody = document.querySelector('#table-by-type tbody');
    tbody.innerHTML = '';
    typeKeys.forEach(k => {
        const s = byType[k];
        const r = roi(s.cost, s.ret);
        const hitPct = Math.round(s.hits / s.count * 100);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${k}</td>
            <td>${s.count}</td>
            <td>¥${s.cost.toLocaleString()}</td>
            <td>¥${s.ret.toLocaleString()}</td>
            <td>${s.hits}</td>
            <td>${hitPct}%</td>
            <td><span class="badge-roi ${r >= 100 ? 'good' : 'bad'}">${r}%</span></td>
        `;
        tbody.appendChild(tr);
    });

    // 履歴テーブル
    const histBody = document.querySelector('#table-history tbody');
    histBody.innerHTML = '';
    [...rows].sort((a, b) => (b['開催日'] || '').localeCompare(a['開催日'] || '')).forEach(r => {
        const cost = parseInt(r['購入額'] || 0);
        const ret = parseInt(r['払戻'] || 0);
        const hit = parseInt(r['的中'] || 0);
        const r2 = roi(cost, ret);
        const tr = document.createElement('tr');
        if (hit > 0) tr.classList.add('hit-row');
        const raceName = r['レース名'] || '-';
        tr.innerHTML = `
            <td>${r['開催日'] || '-'}</td>
            <td>${r['競馬場'] || '-'}</td>
            <td>${r['券種'] || '-'}</td>
            <td>${r['買い方'] || '-'}</td>
            <td>¥${cost.toLocaleString()}</td>
            <td>${ret > 0 ? `<strong>¥${ret.toLocaleString()}</strong>` : '-'}</td>
            <td><span class="badge-roi ${r2 >= 100 ? 'good' : 'bad'}">${ret > 0 ? r2 + '%' : '--'}</span></td>
            <td style="font-size:0.78rem; opacity:0.8;">${raceName}</td>
        `;
        histBody.appendChild(tr);
    });
}

// ---- ファイル読み込み ----
function handleFile(file) {
    if (!file || !file.name.endsWith('.csv')) {
        alert('CSVファイルを選択してください');
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const rows = parseCSV(e.target.result);
            if (rows.length === 0) { alert('データが読み込めませんでした'); return; }
            processData(rows);
        } catch (err) {
            alert('CSVの読み込みに失敗しました: ' + err.message);
        }
    };
    reader.readAsText(file, 'UTF-8');
}

async function loadFromDatabase() {
    const btn = document.getElementById('load-db-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '読み込み中...';

    try {
        const res = await fetch('/api/bet_history');
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        const result = await res.json();

        if (result.success && result.history) {
            // DBのフィールド名をシミュレーターが期待する名称にマッピング
            const mappedRows = result.history.map(r => ({
                '購入額': r.amount,
                '払戻': r.refund,
                '的中': r.is_hit,
                '券種': r.bet_type,
                '買い方': r.bet_method,
                '開催日': r.race_date || r.created_at.split(' ')[0], // 日付がない場合は作成日を使用
                '競馬場': r.venue,
                'レース名': r.race_name
            }));

            if (mappedRows.length === 0) {
                alert('データベースに履歴がありません。買い目を保存してから再度お試しください。');
            } else {
                processData(mappedRows);
                document.getElementById('upload-area').style.display = 'none'; // 読み込み後はエリアを隠す
            }
        }
    } catch (e) {
        alert('データベースからの読み込みに失敗しました: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// ---- イベント登録 ----
function initSimulation() {
    const fileInput = document.getElementById('csv-file-input');
    const uploadArea = document.getElementById('upload-area');
    const loadDbBtn = document.getElementById('load-db-btn');

    if (fileInput) fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
    if (loadDbBtn) loadDbBtn.addEventListener('click', e => {
        e.stopPropagation(); // 親のクリックイベント（fileInput.click()）を止める
        loadFromDatabase();
    });

    if (uploadArea) {
        uploadArea.addEventListener('click', () => fileInput && fileInput.click());
        uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
        uploadArea.addEventListener('drop', e => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            handleFile(e.dataTransfer.files[0]);
        });
    }

    document.getElementById('empty-state').style.display = 'block';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSimulation);
} else {
    initSimulation();
}
