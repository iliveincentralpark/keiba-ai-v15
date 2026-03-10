/**
 * app_v3.js
 * AI買い目ジェネレーターロジック (V3: 期待値・妙味重視)
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

// --- AI予測ロジック (V3) ---
function buildAIPredictions(sorted, raceInfo) {
    if (!sorted || sorted.length === 0) return {};
    const make = (h) => ({
        number: Number(h.number),
        name: h.name,
        odds: Number(h.odds),
        popularity: Number(h.popularity)
    });

    // AIスコアリング: 人気とオッズのバランスから「妙味」を算出
    // 単純な1番人気ではなく、期待値が高い馬を軸にする
    const candidates = sorted.slice(0, 10).map(h => {
        const item = make(h);
        // 基準オッズ（人気の期待値に応じた想定オッズ）
        const baseLine = [0, 2.0, 4.0, 6.0, 9.0, 13.0, 18.0, 25.0, 35.0, 50.0];
        const expected = baseLine[item.popularity] || (item.popularity * 6);

        // 期待値スコア: 想定よりオッズが高ければプラス評価
        item.value_score = Math.pow(item.odds / expected, 1.3);

        // 思考バイアス: 人気上位ほど安定度は高いが、オッズが安すぎると評価を下げる
        let stability = (12 / (item.popularity + 0.5));
        if (item.popularity === 1 && item.odds < 1.8) stability *= 0.4; // 1番人気が過剰評価なら大幅マイナス

        // 微小なランダム変動（毎回異なる角度からシミュレーションを行うことを模倣）
        const variance = 0.7 + (Math.random() * 0.6);

        item.ai_score = stability * item.value_score * variance;
        return item;
    });

    // スコア順にソート（安定感と妙味のバランスが良い順）
    candidates.sort((a, b) => b.ai_score - a.ai_score);

    const honmei = candidates[0];
    const taikou = candidates[1] || null;

    // 相手: 選定馬以外の上位人気/期待値馬
    let remaining = sorted.map(h => make(h)).filter(h => h.number !== honmei.number && (!taikou || h.number !== taikou.number));
    const aite = remaining.slice(0, 4);

    // [穴馬選定 AIロジック] - オッズに著しい歪みがある中穴を抽出
    const anaCandidates = sorted.slice(5, 12).map(h => {
        const item = make(h);
        const idx = sorted.findIndex(sh => sh.number == h.number);
        const prev = sorted[idx - 1] || { odds: 1 };
        item.gap_ratio = item.odds / Number(prev.odds);
        return item;
    });

    const finalAna = anaCandidates
        .filter(h => h.gap_ratio > 1.3 || h.odds > (h.popularity * 10))
        .sort((a, b) => b.gap_ratio - a.gap_ratio)
        .slice(0, 2);

    logToUI(`V3 AI Selected Honmei: ${honmei.name} (#${honmei.number}, ${honmei.popularity}人気)`);

    return { honmei, taikou, aite, ana: finalAna };
}

// --- DB連動 ---
async function saveBetToDatabase(btn, betType, betMethod, points, amount, jiku, aite) {
    if (!currentData || !currentData.race_info) return;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '保存中...';

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
            btn.textContent = '保存完了 ✅';
            btn.style.background = 'rgba(76,175,80,0.3)';
        } else {
            throw new Error('Save failed');
        }
    } catch (e) {
        btn.textContent = '保存失敗 ❌';
        console.error(e);
    }
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
        <h2 style="font-size:1.5rem; margin-bottom:0.1rem;">${data.race_info.name || '---'}</h2>
        <p style="font-size:0.8rem; opacity:0.6;">Race ID: ${data.race_info.id || '---'}</p>
    `;

    const { honmei, taikou, aite, ana } = data.predictions;
    if (!honmei) return;

    const userBudget = parseInt(document.getElementById('user-budget').value) || 10000;
    budgetTotalDisp.textContent = formatPrice(userBudget);

    // 買い目パターン生成
    const patterns = [
        { type: "単勝", method: "1頭流し", icon: "💎", jiku: [honmei], aite: [], ratio: 0.2 },
        { type: "馬連", method: "軸1頭流し", icon: "🏇", jiku: [honmei], aite: [taikou, ...aite].filter(x => x), ratio: 0.4 },
        { type: "ワイド", method: "軸1頭流し", icon: "🛡️", jiku: [honmei], aite: [taikou, ...ana].filter(x => x), ratio: 0.4 }
    ];

    let totalComputed = 0;

    patterns.forEach(p => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.bet-card');

        clone.querySelector('.badge').textContent = p.icon;
        clone.querySelector('.card-title').textContent = `${p.type} (${p.method})`;

        const reasoning = `AIスコア: ${p.jiku[0].name} は期待値 ${p.jiku[0].value_score.toFixed(2)} で軸に最適です。`;
        clone.querySelector('.card-reasoning').textContent = reasoning;

        const detailsDiv = clone.querySelector('.bet-details');
        detailsDiv.innerHTML = `
            <div class="bet-row">
                <span class="bet-label">軸</span>
                <div class="bet-horses"><span class="horse-tag honmei">${p.jiku[0].number} ${p.jiku[0].name} (${p.jiku[0].popularity}人気)</span></div>
            </div>
            ${p.aite.length > 0 ? `
            <div class="bet-row">
                <span class="bet-label">相手</span>
                <div class="bet-horses">
                    ${p.aite.map(h => `<span class="horse-tag">${h.number}</span>`).join('')}
                </div>
            </div>` : ''}
        `;

        const points = p.aite.length || 1;
        const amountPerPoint = Math.floor((userBudget * p.ratio) / points / 100) * 100;
        const cardTotal = amountPerPoint * points;
        totalComputed += cardTotal;

        clone.querySelector('.price-calc').textContent = `@${amountPerPoint} × ${points}点`;
        clone.querySelector('.price-total').textContent = formatPrice(cardTotal);

        // 保存ボタン
        const saveBtn = clone.querySelector('.save-btn');
        saveBtn.addEventListener('click', () => {
            saveBetToDatabase(saveBtn, p.type, p.method, points, cardTotal, p.jiku, p.aite);
        });

        container.appendChild(clone);
    });

    finalTotalDisp.textContent = formatPrice(totalComputed);
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
        showErrorInUI("不正なIDです");
        return;
    }

    const btn = document.getElementById('fetch-odds-btn');
    btn.disabled = true;
    btn.textContent = 'AI取得中...';

    try {
        const res = await fetch(`/api/scrape?race_id=${raceId}`);
        if (!res.ok) throw new Error("HTTP Error");
        const result = await res.json();

        if (result.success) {
            const horsesArray = Object.keys(result.horses).map(num => ({
                number: num,
                name: result.horses[num].name,
                odds: result.horses[num].odds,
                popularity: result.horses[num].popularity
            }));

            // 人気順位でソート
            const sorted = [...horsesArray].sort((a, b) => (Number(a.popularity) || 99) - (Number(b.popularity) || 99));

            currentData = {
                race_info: { id: result.race_id, name: result.race_name },
                predictions: buildAIPredictions(sorted, { name: result.race_name }),
                all_horses: horsesArray
            };
            renderApp(currentData);
        }
    } catch (e) {
        showErrorInUI("取得エラー: " + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '最新オッズ取得';
    }
}

// --- 初期化 ---
function initApp() {
    document.getElementById('fetch-odds-btn').addEventListener('click', fetchLiveOdds);
    document.getElementById('user-budget').addEventListener('change', () => {
        if (currentData) renderApp(currentData);
    });
}

document.addEventListener('DOMContentLoaded', initApp);
console.log("App V3 Strategy Loaded.");
