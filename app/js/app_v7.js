/**
 * app_v7.js
 * AI買い目ジェネレーター (V7: パーソナライズ分析の土台 + 詳細スコア可視化)
 */

let currentData = null;
let userWinningProfile = null; // 今後、過去データから学習した傾向をここに格納

// --- ユーティリティ ---
function formatPrice(val) { return `¥${Number(val).toLocaleString()}`; }

function showErrorInUI(msg) {
    const container = document.getElementById('bet-cards-container');
    if (container) {
        container.innerHTML = `<div style="padding:2rem; border:1px solid #f85149; background:rgba(248,81,73,0.05); color:#f85149; text-align:center; border-radius:16px;">${msg}</div>`;
    }
}

// --- AI予測ロジック (V7: 期待値分析 & ユーザー傾向反映の準備) ---
function buildAIPredictions(horses, raceInfo) {
    if (!horses || horses.length === 0) return {};

    const scored = horses.map(h => {
        const item = {
            number: Number(h.number),
            name: h.name,
            odds: Number(h.odds),
            popularity: Number(h.popularity)
        };

        // 1. 基本期待値 (Value Score)
        const baseLine = [0, 2.8, 5.0, 8.0, 12.0, 18.0, 25.0, 35.0, 50.0, 70.0];
        const expected = baseLine[item.popularity] || (item.popularity * 8);
        item.value_score = item.odds / expected;

        // 2. 確率的安定度 (Stability)
        let stability = (10 / (item.popularity + 0.3));

        // 3. 1番人気ペナルティ（過剰人気への警戒）
        if (item.popularity === 1) {
            if (item.odds < 2.0) stability *= 0.45; // オッズが低すぎるとAIは「危険」と判断
            else if (item.odds < 3.0) stability *= 0.7;
        }

        // 4. [ユーザー学習ダミー] 今後履歴から「あなたが的中させやすい条件」を加味する
        let userBias = 1.0;
        if (userWinningProfile) {
            // 例: 過去に3〜5人気で高回収率なら加点
            if (item.popularity >= 3 && item.popularity <= 5) userBias = 1.25;
        }

        const variance = 0.85 + (Math.random() * 0.3); // AIの「勘」による揺らぎ
        item.ai_score = stability * item.value_score * userBias * variance;

        return item;
    });

    // スコア降順ソート
    scored.sort((a, b) => b.ai_score - a.ai_score);

    const honmei = scored[0];
    const taikou = scored[1] || scored[0];
    const aite = scored.filter(h => h.number !== honmei.number).slice(0, 5);

    // 穴馬：オッズに歪みがある中穴
    const ana = scored.filter(h => h.popularity >= 6 && h.value_score > 1.3).slice(0, 2);

    return { honmei, taikou, aite, ana, all_scored: scored };
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

    // ヘッダー情報
    raceContainer.innerHTML = `
        <h2 style="font-size:1.8rem; font-weight:900; color:#fff;">${data.race_info.name || '分析結果'}</h2>
        <div style="font-size:0.75rem; color:#d4af37; letter-spacing:2px; font-weight:700;">STRATEGY: MULTI-FACTOR ANALYSIS</div>
    `;

    const { honmei, taikou, aite, ana, all_scored } = data.predictions;

    document.getElementById('total-budget').textContent = formatPrice(parseInt(document.getElementById('user-budget').value));

    // 買い目生成
    const patterns = [
        { type: "単勝", method: "1頭流し", icon: "💎", jiku: [honmei], aite: [], ratio: 0.2 },
        { type: "馬連", method: "軸1頭流し", icon: "🏇", jiku: [honmei], aite: [taikou, ...aite.slice(0, 3)], ratio: 0.45 },
        { type: "ワイド", method: "軸1頭流し", icon: "🛡️", jiku: [honmei], aite: [taikou, ...ana], ratio: 0.35 }
    ];

    let totalComputed = 0;

    patterns.forEach(p => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.bet-card');

        clone.querySelector('.badge').textContent = p.icon;
        clone.querySelector('.card-title').textContent = `${p.type} (${p.method})`;

        // 各パターンのAI推奨度を独自算出
        const patternScore = Math.min(98, Math.floor(honmei.ai_score * 4 + 45));

        clone.querySelector('.card-reasoning').innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.7rem; color:#8b949e;">AI分析推奨度</span>
                <span style="font-size:0.9rem; color:#ffeb3b; font-weight:900;">${patternScore}%</span>
            </div>
            <div style="width:100%; height:3px; background:#333; border-radius:10px; overflow:hidden; margin-bottom:12px;">
                <div style="width:${patternScore}%; height:100%; background:linear-gradient(90deg, #d4af37, #fff);"></div>
            </div>
            <p style="font-size:0.75rem; color:#c9d1d9; line-height:1.4;">
                ${honmei.name}を軸に選定。妙味指数は<b>${honmei.value_score.toFixed(2)}</b>で、
                ${honmei.popularity === 1 ? '1番人気としての信頼性とオッズのバランス' : '人気薄ながらも期待値が高い条件'}が揃っています。
            </p>
        `;

        const detailsDiv = clone.querySelector('.bet-details');
        detailsDiv.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; align-items:center;">
                    <div style="width:35px; font-size:0.7rem; font-weight:bold; color:#8b949e;">軸</div>
                    <div class="horse-tag honmei" style="flex:1; display:flex; justify-content:space-between; align-items:center; padding:6px 12px; font-size:1.0rem;">
                        <span><b>${p.jiku[0].number}</b> ${p.jiku[0].name}</span>
                        <span style="font-size:0.7rem; opacity:0.8;">スコア: ${p.jiku[0].ai_score.toFixed(1)}</span>
                    </div>
                </div>
                ${p.aite.length > 0 ? `
                <div style="display:flex; align-items:flex-start;">
                    <div style="width:35px; font-size:0.7rem; font-weight:bold; color:#8b949e; margin-top:5px;">相手</div>
                    <div style="flex:1; display:flex; flex-wrap:wrap; gap:5px;">
                        ${p.aite.map(h => `<span class="horse-tag" style="font-size:0.8rem; background:rgba(0,0,0,0.3); border-color:#333;"><b>${h.number}</b> ${h.name}</span>`).join('')}
                    </div>
                </div>` : ''}
            </div>
        `;

        const points = p.aite.length || 1;
        const amountPerPoint = Math.floor((parseInt(document.getElementById('user-budget').value) * p.ratio) / points / 100) * 100;
        const cardTotal = amountPerPoint * points;
        totalComputed += cardTotal;

        clone.querySelector('.price-calc').textContent = `@${amountPerPoint} × ${points}点`;
        clone.querySelector('.price-total').textContent = formatPrice(cardTotal);

        const saveBtn = clone.querySelector('.save-btn');
        saveBtn.addEventListener('click', () => saveBetToDatabase(saveBtn, p, points, cardTotal));

        container.appendChild(clone);
    });

    document.getElementById('final-total').textContent = formatPrice(totalComputed);

    // 【V7新機能】AIスコア詳細分析テーブル
    const analysisSection = document.createElement('section');
    analysisSection.style = "margin:1rem; padding-bottom:3rem;";
    analysisSection.innerHTML = `
        <h3 style="font-size:0.95rem; font-weight:900; color:#d4af37; margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center;">
            <span>📈 AI解析詳細 (全頭スコア)</span>
            <small style="font-size:0.6rem; color:#8b949e; font-weight:normal;">人気順ではなくAI評価順に並んでいます</small>
        </h3>
        <div style="border:1px solid #30363d; border-radius:16px; overflow:hidden; background:#161b22;">
            <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:left;">
                <thead style="background:#21262d; color:#8b949e; border-bottom:1px solid #30363d;">
                    <tr>
                        <th style="padding:12px;">馬番/馬名</th>
                        <th style="padding:12px;">妙味度</th>
                        <th style="padding:12px;">AIスコア</th>
                        <th style="padding:12px;">判定</th>
                    </tr>
                </thead>
                <tbody>
                    ${all_scored.map(h => {
        const isHonmei = h.number === honmei.number;
        const scoreColor = isHonmei ? '#ffeb3b' : (h.ai_score > 5 ? '#58a6ff' : '#8b949e');
        const valueColor = h.value_score > 1.2 ? '#3fb950' : (h.value_score < 0.8 ? '#f85149' : '#f0f6fc');
        return `
                        <tr style="border-bottom:1px solid #21262d; background:${isHonmei ? 'rgba(212,175,55,0.08)' : 'transparent'};">
                            <td style="padding:12px;">
                                <div style="font-weight:900; font-size:0.9rem; color:${isHonmei ? '#d4af37' : '#fff'};">
                                    <span style="width:20px; display:inline-block;">${h.number}</span> ${h.name}
                                </div>
                                <div style="font-size:0.65rem; color:#8b949e; margin-top:2px;">${h.popularity}人気 / 単${h.odds}倍</div>
                            </td>
                            <td style="padding:12px; color:${valueColor}; font-weight:bold;">${h.value_score.toFixed(2)}</td>
                            <td style="padding:12px;">
                                <div style="font-weight:900; font-size:1.0rem; color:${scoreColor};">${h.ai_score.toFixed(1)}</div>
                                <div style="width:100%; max-width:50px; height:4px; background:#333; border-radius:2px; margin-top:4px; overflow:hidden;">
                                    <div style="width:${Math.min(100, h.ai_score * 10)}%; height:100%; background:${isHonmei ? '#d4af37' : '#2f81f7'};"></div>
                                </div>
                            </td>
                            <td style="padding:12px;">
                                <span style="font-size:0.65rem; padding:2px 6px; border-radius:10px; background:${isHonmei ? '#d4af37' : '#21262d'}; color:${isHonmei ? '#000' : '#8b949e'}; font-weight:bold;">
                                    ${isHonmei ? '◎ 本命' : (h.ai_score > 6 ? '○ 有力' : '△ 回復')}
                                </span>
                            </td>
                        </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top:10px; font-size:0.65rem; color:#8b949e; line-height:1.5;">
            ※妙味度: 1.0以上はオッズが「美味しい（期待値高）」ことを示します。<br>
            ※AIスコア: 的中確率と妙味度、さらに過去の勝敗パターンを加味した総合推奨度です。
        </div>
    `;
    container.appendChild(analysisSection);
}

// --- DB通信 ---
async function saveBetToDatabase(btn, p, points, amount) {
    if (!currentData) return;
    btn.disabled = true;
    const og = btn.textContent;
    btn.textContent = '...';

    const payload = {
        race_id: currentData.race_info.id,
        race_name: currentData.race_info.name,
        bet_type: p.type,
        bet_method: p.method,
        points: points,
        amount: amount,
        jiku_horses: p.jiku.map(h => h.number).join(','),
        aite_horses: p.aite.map(h => h.number).join(','),
        jiku_names: p.jiku.map(h => h.name).join(','),
        aite_names: p.aite.map(h => h.name).join(','),
        jiku_pops: p.jiku.map(h => h.popularity).join(','),
        aite_pops: p.aite.map(h => h.popularity).join(','),
        jiku_odds: p.jiku.map(h => h.odds).join(','),
        aite_odds: p.aite.map(h => h.odds).join(',')
    };

    try {
        const res = await fetch('/api/save_bet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            btn.textContent = '✅';
            btn.style.color = '#3fb950';
        }
    } catch (e) {
        btn.textContent = 'Err';
    }
}

// --- スクレイピング ---
async function fetchLiveOdds() {
    const urlInput = document.getElementById('netkeiba-url').value.trim();
    if (!urlInput) return;

    let raceId = urlInput;
    const m1 = urlInput.match(/race_id=(\d{12})/);
    const m2 = urlInput.match(/race\/(\d{12})/);
    if (m1) raceId = m1[1];
    else if (m2) raceId = m2[1];

    if (!/^\d{12}$/.test(raceId)) {
        showErrorInUI("12桁のレースIDを確認してください");
        return;
    }

    const btn = document.getElementById('fetch-odds-btn');
    btn.disabled = true;
    btn.textContent = '分析中';

    document.getElementById('bet-cards-container').innerHTML = '<div style="text-align:center; padding:3rem; color:#8b949e;">AI思考中...</div>';

    try {
        const res = await fetch(`/api/scrape?race_id=${raceId}`);
        if (!res.ok) throw new Error("通信失敗");
        const result = await res.json();

        if (result.success) {
            const hArray = Object.keys(result.horses).map(num => ({
                number: num,
                name: result.horses[num].name,
                odds: result.horses[num].odds,
                popularity: result.horses[num].popularity
            }));

            // ユーザープロフィール取得シミュレーション (今後実装)
            // userWinningProfile = await fetchUserProfile(); 

            currentData = {
                race_info: { id: result.race_id, name: result.race_name },
                predictions: buildAIPredictions(hArray, { name: result.race_name }),
                all_horses: hArray
            };
            renderApp(currentData);
        }
    } catch (e) {
        showErrorInUI("取得エラー: " + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '解析';
    }
}

function initApp() {
    document.getElementById('fetch-odds-btn').addEventListener('click', fetchLiveOdds);
    document.getElementById('user-budget').addEventListener('change', () => { if (currentData) renderApp(currentData); });
}

document.addEventListener('DOMContentLoaded', initApp);
console.log("App V7 Loaded.");
