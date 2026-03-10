/**
 * app_v3.js
 * AI買い目ジェネレーターロジック (V4: 人気・UIを完全修正)
 */

let currentData = null;

// --- ユーティリティ ---
function logToUI(msg) { console.log(`[AI-LOG] ${msg}`); }

function formatPrice(val) {
    return `¥${Number(val).toLocaleString()}`;
}

function showErrorInUI(msg) {
    const container = document.getElementById('bet-cards-container');
    if (container) {
        container.innerHTML = `<div style="padding:1rem; border:1px solid #f85149; background:rgba(248,81,73,0.1); border-radius:8px; color:#f85149; text-align:center;">${msg}</div>`;
    }
}

// --- AI予測ロジック (V4) ---
function buildAIPredictions(sorted, raceInfo) {
    if (!sorted || sorted.length === 0) return {};
    const make = (h) => ({
        number: Number(h.number),
        name: h.name,
        odds: Number(h.odds),
        popularity: Number(h.popularity)
    });

    const horses = sorted.map(h => make(h));

    // AIスコアリング: 人気とオッズのバランス
    const scored = horses.slice(0, 10).map(h => {
        // 想定オッズ（統計的な基準値）
        const baseLine = [0, 2.5, 4.5, 7.0, 10.0, 15.0, 22.0, 30.0, 45.0, 60.0];
        const expected = baseLine[h.popularity] || (h.popularity * 7);

        // 妙味指数: 想定より高ければ加点
        const valueScore = Math.pow(h.odds / expected, 1.2);

        // 期待値スコア = (的中期待度 / 人気) * 妙味
        // 1番人気の信頼度が高い場合はボーナス、低すぎるオッズ（1.5以下）は減点
        let logicWeight = (15 / (h.popularity + 0.5));
        if (h.popularity === 1 && h.odds < 1.9) logicWeight *= 0.6;

        // ランダムシミュレーション要素
        const variance = 0.82 + (Math.random() * 0.36);

        h.ai_score = logicWeight * valueScore * variance;
        h.value_score = valueScore;
        return h;
    });

    // スコア順にソート（妙味と確率のバランスが良い順）
    scored.sort((a, b) => b.ai_score - a.ai_score);

    const honmei = scored[0];
    const taikou = scored[1] || horses[1];

    // 相手: 選定以外の上位馬と中穴候補
    const used = [honmei.number, taikou.number];
    const aiteCandidates = horses.filter(h => !used.includes(h.number));
    const aite = aiteCandidates.slice(0, 4);

    // 穴馬: オッズが跳ねている穴を探す
    const anaResult = horses.slice(6, 15).filter(h => {
        const idx = horses.findIndex(sh => sh.number == h.number);
        const prev = horses[idx - 1] || { odds: 1 };
        return (h.odds / prev.odds > 1.35) || (h.odds > h.popularity * 12);
    }).sort((a, b) => b.odds - a.odds).slice(0, 2);

    return { honmei, taikou, aite, ana: anaResult };
}

// --- UIレンダリング ---
function renderApp(data) {
    const container = document.getElementById('bet-cards-container');
    const raceContainer = document.getElementById('race-info-container');
    const budgetTotalDisp = document.getElementById('total-budget');
    const finalTotalDisp = document.getElementById('final-total');
    const template = document.getElementById('bet-card-template');

    container.innerHTML = '';
    if (!data || !data.race_info) return;

    // レース情報
    raceContainer.innerHTML = `
        <h2 style="font-size:1.6rem; color:#fff; font-weight:900;">${data.race_info.name || '読み込み中...'}</h2>
        <div style="font-size:0.85rem; color:#d4af37; font-weight:700;">LIVE DATA ANALYZED</div>
    `;

    const { honmei, taikou, aite, ana } = data.predictions;
    if (!honmei) return;

    const userBudget = parseInt(document.getElementById('user-budget').value) || 10000;
    budgetTotalDisp.textContent = formatPrice(userBudget);

    // パターン構築
    const patterns = [
        { type: "単勝", method: "1頭流し", icon: "💎", jiku: [honmei], aite: [], ratio: 0.25 },
        { type: "馬連", method: "1頭流し", icon: "🏇", jiku: [honmei], aite: [taikou, ...aite].filter(x => x), ratio: 0.4 },
        { type: "ワイド", method: "1頭流し", icon: "🛡️", jiku: [honmei], aite: [taikou, ...ana].filter(x => x), ratio: 0.35 }
    ];

    let totalComputed = 0;

    patterns.forEach(p => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.bet-card');

        clone.querySelector('.badge').textContent = p.icon;
        clone.querySelector('.card-title').textContent = `${p.type} (${p.method})`;

        const reasoning = `AI解析: ${p.jiku[0].name} は妙味期待値 ${p.jiku[0].value_score.toFixed(2)} で現在最も勝負圏内です。`;
        clone.querySelector('.card-reasoning').textContent = reasoning;

        const detailsDiv = clone.querySelector('.bet-details');
        detailsDiv.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:0.5rem;">
                <div style="display:flex; align-items:center;">
                    <span style="width:40px; color:#8b949e; font-size:0.8rem;">軸</span>
                    <span class="horse-tag honmei">${p.jiku[0].number} ${p.jiku[0].name} <small style="font-size:0.7rem; opacity:0.8;">(${p.jiku[0].popularity}人気/オッズ${p.jiku[0].odds})</small></span>
                </div>
                ${p.aite.length > 0 ? `
                <div style="display:flex; align-items:flex-start;">
                    <span style="width:40px; color:#8b949e; font-size:0.8rem; margin-top:5px;">相手</span>
                    <div style="flex:1; display:flex; flex-wrap:wrap; gap:5px;">
                        ${p.aite.map(h => `<span class="horse-tag" style="font-size:0.85rem; padding:2px 8px;">${h.number} ${h.name}</span>`).join('')}
                    </div>
                </div>` : ''}
            </div>
        `;

        const points = p.aite.length || 1;
        const amountPerPoint = Math.floor((userBudget * p.ratio) / points / 100) * 100;
        const cardTotal = amountPerPoint * points;
        totalComputed += cardTotal;

        clone.querySelector('.price-calc').textContent = `@${amountPerPoint} × ${points}点`;
        clone.querySelector('.price-total').textContent = formatPrice(cardTotal);

        const saveBtn = clone.querySelector('.save-btn');
        saveBtn.addEventListener('click', () => {
            saveBetToDatabase(saveBtn, p.type, p.method, points, cardTotal, p.jiku, p.aite);
        });

        container.appendChild(clone);
    });

    finalTotalDisp.textContent = formatPrice(totalComputed);

    // 馬名リストを表示 (再追加)
    const listSection = document.createElement('section');
    listSection.style = "padding:1rem; margin-bottom:2rem;";
    listSection.innerHTML = `
        <h3 style="font-size:0.9rem; color:#8b949e; margin-bottom:1rem; border-bottom:1px solid #333; padding-bottom:5px;">▼ 出走馬データ一覧</h3>
        <div style="display:flex; flex-direction:column; gap:8px;">
            ${(data.all_horses || []).sort((a, b) => a.number - b.number).map(h => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <b style="color:#d4af37; min-width:20px; text-align:center;">${h.number}</b>
                        <span style="font-weight:700;">${h.name}</span>
                    </div>
                    <div style="text-align:right; font-size:0.85rem;">
                        <span style="color:#8b949e;">${h.popularity}人気</span>
                        <b style="margin-left:8px; color:#f0f6fc;">${h.odds}</b>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    container.appendChild(listSection);
}

// --- DB連動 ---
async function saveBetToDatabase(btn, betType, betMethod, points, amount, jiku, aite) {
    if (!currentData || !currentData.race_info) return;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '...';

    const payload = {
        race_id: currentData.race_info.id,
        race_name: currentData.race_info.name,
        bet_type: betType,
        bet_method: betMethod,
        points: points,
        amount: amount,
        jiku_horses: jiku.map(h => h.number).join(','),
        aite_horses: aite.map(h => h.number).join(','),
        jiku_names: jiku.map(h => h.name).join(','),
        jiku_pops: jiku.map(h => h.popularity).join(','),
        jiku_odds: jiku.map(h => h.odds).join(','),
        aite_names: aite.map(h => h.name).join(','),
        aite_pops: aite.map(h => h.popularity).join(','),
        aite_odds: aite.map(h => h.odds).join(',')
    };

    try {
        const res = await fetch('/api/save_bet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            btn.textContent = '済 ✅';
            btn.style.borderColor = '#3fb950';
            btn.style.color = '#3fb950';
        } else {
            throw new Error('Err');
        }
    } catch (e) {
        btn.textContent = '❌';
        console.error(e);
    }
}

// --- オッズ取得 ---
async function fetchLiveOdds() {
    const urlInput = document.getElementById('netkeiba-url').value.trim();
    if (!urlInput) return;

    let raceId = urlInput;
    const match = urlInput.match(/race_id=(\d{12})/);
    if (match) raceId = match[1];
    else {
        const dbMatch = urlInput.match(/race\/(\d{12})/);
        if (dbMatch) raceId = dbMatch[1];
    }

    if (!/^\d{12}$/.test(raceId)) {
        showErrorInUI("12桁のレースIDを入力してください");
        return;
    }

    const btn = document.getElementById('fetch-odds-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'AI取得中...';

    // UIクリア
    document.getElementById('bet-cards-container').innerHTML = '<div style="text-align:center; padding:3rem; opacity:0.7;">🔍 最新オッズを取得しAIがシミュレーションしています...</div>';

    try {
        const res = await fetch(`/api/scrape?race_id=${raceId}`);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Server Error");
        }
        const result = await res.json();

        if (result.success) {
            const horsesArray = Object.keys(result.horses).map(num => ({
                number: num,
                name: result.horses[num].name,
                odds: result.horses[num].odds,
                popularity: result.horses[num].popularity
            }));

            const sorted = [...horsesArray].sort((a, b) => (Number(a.popularity) || 100) - (Number(b.popularity) || 100));

            currentData = {
                race_info: { id: result.race_id, name: result.race_name },
                predictions: buildAIPredictions(sorted, { name: result.race_name }),
                all_horses: horsesArray
            };
            renderApp(currentData);
        }
    } catch (e) {
        showErrorInUI("エラー: " + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// --- 初期化 ---
function initApp() {
    const fetchBtn = document.getElementById('fetch-odds-btn');
    if (fetchBtn) fetchBtn.addEventListener('click', fetchLiveOdds);

    document.getElementById('user-budget').addEventListener('change', () => {
        if (currentData) renderApp(currentData);
    });

    // PWAキャッシュクリア通知
    if (window.location.search.includes('v=')) {
        console.log("Forcing load of V4 scripts.");
    }
}

document.addEventListener('DOMContentLoaded', initApp);
