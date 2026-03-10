/**
 * app_v5.js
 * AI買い目ジェネレーターロジック (V6: スコア可視化・アルゴリズム透明化)
 */

let currentData = null;

// --- ユーティリティ ---
function logToUI(msg) { console.log(`[V6-AI] ${msg}`); }

function formatPrice(val) {
    return `¥${Number(val).toLocaleString()}`;
}

function showErrorInUI(msg) {
    const container = document.getElementById('bet-cards-container');
    if (container) {
        container.innerHTML = `
            <div style="padding:1.5rem; border:1px solid #f85149; background:rgba(248,81,73,0.1); border-radius:12px; color:#f85149; text-align:center;">
                <h3>⚠️ Error</h3>
                <p>${msg}</p>
            </div>`;
    }
}

// --- AI予測ロジック (V6: 妙味重視型スコアリング) ---
function buildAIPredictions(horses, raceInfo) {
    if (!horses || horses.length === 0) return {};

    // 1. 各馬の期待値とAIスコアを計算
    const scored = horses.map(h => {
        const item = {
            number: Number(h.number),
            name: h.name,
            odds: Number(h.odds),
            popularity: Number(h.popularity)
        };

        // 【基準オッズ設定】 人気に応じた「これくらいが妥当」というオッズ
        const baseLine = [0, 2.5, 4.5, 7.0, 10.0, 15.0, 22.0, 30.0, 45.0, 65.0];
        const expected = baseLine[item.popularity] || (item.popularity * 8);

        // 【妙味スコア (Value)】 基準よりどれだけオッズが高いか (1.0が基準)
        // 1.5を超えると「非常に美味しい」、0.7以下は「過剰人気」
        item.value_score = item.odds / expected;

        // 【安定度スコア (Stability)】 
        // 以前は (20/pop) でしたが、1番人気が強すぎたため、(10/pop) + 5 程度に緩和
        // これにより、人気薄でも妙味があれば逆転しやすくなります
        let stability = (8 / (item.popularity + 0.2)) + 2.0;

        // 【過剰人気ペナルティ】 1〜2番人気でオッズが低すぎる場合は評価を厳しく
        if (item.popularity === 1 && item.odds < 2.0) stability *= 0.5;
        if (item.popularity === 2 && item.odds < 3.5) stability *= 0.8;

        // 【最終AI総合スコア】 安定度 × 妙味 × ランダム揺らぎ
        const variance = 0.9 + (Math.random() * 0.2); // 0.9〜1.1の僅かな揺らぎ
        item.ai_score = stability * item.value_score * variance;

        return item;
    });

    // 2. スコア順にソート (現状、スコアの一番高い馬を本命にする)
    scored.sort((a, b) => b.ai_score - a.ai_score);

    const honmei = scored[0];
    const taikou = scored[1] || scored[0]; // 2番手

    logToUI(`AI Analysis Complete. Top Score: ${honmei.name} (${honmei.ai_score.toFixed(2)})`);

    // 相手: 本命以外の上位スコア馬
    const aite = scored.filter(h => h.number !== honmei.number).slice(0, 5);

    // 穴馬: 妙味スコア(value_score)が特に高い馬
    const anaResult = scored
        .filter(h => h.popularity >= 6)
        .sort((a, b) => b.value_score - a.value_score)
        .slice(0, 2);

    return { honmei, taikou, aite, ana: anaResult, all_scored: scored };
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
        <h2 style="font-size:1.7rem; color:#fff; font-weight:900; margin-bottom:5px;">${data.race_info.name || '---'}</h2>
        <div style="display:flex; justify-content:center; gap:10px;">
            <span style="font-size:0.75rem; color:#8b949e;">ID: ${data.race_info.id}</span>
            <span style="font-size:0.75rem; color:#d4af37; font-weight:700;">AI SCORE ENGINE V6</span>
        </div>
    `;

    const { honmei, taikou, aite, ana, all_scored } = data.predictions;
    if (!honmei) return;

    const userBudget = parseInt(document.getElementById('user-budget').value) || 10000;
    budgetTotalDisp.textContent = formatPrice(userBudget);

    // 買い目生成
    const patterns = [
        { type: "単勝", method: "1頭流し", icon: "💎", jiku: [honmei], aite: [], ratio: 0.2 },
        { type: "馬連", method: "1頭流し", icon: "🏇", jiku: [honmei], aite: [taikou, ...aite.slice(0, 3)].filter(x => x && x.number !== honmei.number), ratio: 0.45 },
        { type: "ワイド", method: "1頭流し", icon: "🛡️", jiku: [honmei], aite: [taikou, ...ana].filter(x => x && x.number !== honmei.number), ratio: 0.35 }
    ];

    let totalComputed = 0;

    patterns.forEach(p => {
        const clone = template.content.cloneNode(true);

        clone.querySelector('.badge').textContent = p.icon;
        clone.querySelector('.card-title').textContent = `${p.type} (${p.method})`;

        // 可視化：買い目ごとの独自推しスコアを計算 (軸のスコアをベースに調整)
        const betConfidence = Math.min(95, Math.floor(p.jiku[0].ai_score * 5 + 40));

        clone.querySelector('.card-reasoning').innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>AI推奨度</span>
                <b style="color:#ffeb3b;">${betConfidence}%</b>
            </div>
            <div style="width:100%; height:4px; background:#333; border-radius:2px; margin-bottom:10px; overflow:hidden;">
                <div style="width:${betConfidence}%; height:100%; background:linear-gradient(90deg, #d4af37, #fff);"></div>
            </div>
            <p style="font-size:0.75rem; color:#8b949e;">${honmei.name}は妙味指数${honmei.value_score.toFixed(2)}。人気に対するポテンシャルが高く、本レースの最適軸と判定しました。</p>
        `;

        const detailsDiv = clone.querySelector('.bet-details');
        detailsDiv.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; align-items:center;">
                    <span style="width:50px; color:#8b949e; font-size:0.75rem; font-weight:bold;">軸</span>
                    <span class="horse-tag honmei" style="flex:1;">
                        <b>${p.jiku[0].number}</b> ${p.jiku[0].name} 
                        <span style="font-size:0.7rem; opacity:0.8; margin-left:5px;">(Score: ${p.jiku[0].ai_score.toFixed(1)})</span>
                    </span>
                </div>
                ${p.aite.length > 0 ? `
                <div style="display:flex; align-items:flex-start;">
                    <span style="width:50px; color:#8b949e; font-size:0.75rem; font-weight:bold; margin-top:5px;">相手</span>
                    <div style="flex:1; display:flex; flex-wrap:wrap; gap:4px;">
                        ${p.aite.map(h => `
                            <span class="horse-tag" style="border:1px solid #333; font-size:0.8rem;">
                                <b>${h.number}</b> ${h.name}
                            </span>
                        `).join('')}
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

    // 【スコア可視化テーブル】 全馬のAI評価を表示
    const listSection = document.createElement('section');
    listSection.style = "padding:1rem; margin-top:1.5rem;";
    listSection.innerHTML = `
        <h3 style="font-size:0.85rem; color:#d4af37; margin-bottom:1rem; border-left:4px solid #d4af37; padding-left:10px; display:flex; justify-content:space-between;">
            <span>AI分析詳細スコア表</span>
            <small style="color:#8b949e; font-weight:normal;">(Score順)</small>
        </h3>
        <div style="border-radius:12px; overflow:hidden; border:1px solid #333; background:#161b22;">
            <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:left;">
                <thead style="background:#21262d; color:#8b949e;">
                    <tr>
                        <th style="padding:10px;">馬番/馬名</th>
                        <th style="padding:10px;">人気</th>
                        <th style="padding:10px;">妙味度</th>
                        <th style="padding:10px;">AIスコア</th>
                    </tr>
                </thead>
                <tbody>
                    ${all_scored.map(h => {
        const isHonmei = h.number === honmei.number;
        const myomiColor = h.value_score > 1.2 ? '#3fb950' : (h.value_score < 0.8 ? '#f85149' : '#fff');
        return `
                        <tr style="border-bottom:1px solid #21262d; background:${isHonmei ? 'rgba(212,175,55,0.05)' : 'transparent'};">
                            <td style="padding:10px;">
                                <b style="color:#d4af37; margin-right:5px;">${h.number}</b> 
                                <span style="font-weight:700;">${h.name}</span>
                            </td>
                            <td style="padding:10px; color:#8b949e;">${h.popularity}人気</td>
                            <td style="padding:10px; color:${myomiColor}; font-weight:bold;">${h.value_score.toFixed(2)}</td>
                            <td style="padding:10px;">
                                <div style="font-weight:900; color:${isHonmei ? '#d4af37' : '#f0f6fc'};">${h.ai_score.toFixed(1)}</div>
                                <div style="width:40px; height:3px; background:#333; border-radius:2px; margin-top:2px;">
                                    <div style="width:${Math.min(100, h.ai_score * 8)}%; height:100%; background:${isHonmei ? '#d4af37' : '#2f81f7'};"></div>
                                </div>
                            </td>
                        </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
        <p style="font-size:0.7rem; color:#8b949e; margin-top:10px;">※妙味度: 1.0以上なら人気に対してオッズが高く「美味しい」馬であることを示します。</p>
    `;
    container.appendChild(listSection);
}

// --- DB連動 ---
async function saveBetToDatabase(btn, betType, betMethod, points, amount, jiku, aite) {
    if (!currentData || !currentData.race_info) return;

    btn.disabled = true;
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
            btn.style.color = '#3fb950';
        }
    } catch (e) {
        btn.textContent = 'Error';
    }
}

// --- メイン取得 ---
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
        showErrorInUI("12桁の正しいレースIDを入力してください");
        return;
    }

    const btn = document.getElementById('fetch-odds-btn');
    btn.disabled = true;
    btn.textContent = '分析中...';

    const container = document.getElementById('bet-cards-container');
    container.innerHTML = '<div style="text-align:center; padding:4rem; color:#8b949e;">AIスコア計算中...</div>';

    try {
        const res = await fetch(`/api/scrape?race_id=${raceId}`);
        if (!res.ok) throw new Error("HTTP Fail");
        const result = await res.json();

        if (result.success) {
            const horsesArray = Object.keys(result.horses).map(num => ({
                number: num,
                name: result.horses[num].name,
                odds: result.horses[num].odds,
                popularity: result.horses[num].popularity
            }));

            currentData = {
                race_info: { id: result.race_id, name: result.race_name },
                predictions: buildAIPredictions(horsesArray, { name: result.race_name }),
                all_horses: horsesArray
            };
            renderApp(currentData);
        }
    } catch (e) {
        showErrorInUI("Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '解析';
    }
}

function initApp() {
    document.getElementById('fetch-odds-btn').addEventListener('click', fetchLiveOdds);
    document.getElementById('user-budget').addEventListener('change', () => {
        if (currentData) renderApp(currentData);
    });
}

document.addEventListener('DOMContentLoaded', initApp);
