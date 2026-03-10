/**
 * app_v8.js
 * AI買い目ジェネレーター (V8: 馬の実力分析 + ユーザー傾向学習)
 */

let currentData = null;
let userWinningProfile = null; // 履歴から学習したユーザーの得意パターン

// --- ユーティリティ ---
function formatPrice(val) { return `¥${Number(val).toLocaleString()}`; }

function showErrorInUI(msg) {
    const container = document.getElementById('bet-cards-container');
    if (container) {
        container.innerHTML = `<div style="padding:2rem; color:#f85149; text-align:center;">⚠️ ${msg}</div>`;
    }
}

// --- AI予測ロジック (V8: 能力指数 & ユーザー傾向反映) ---
function buildAIPredictions(horses, raceInfo, profile) {
    if (!horses || horses.length === 0) return {};

    const scored = horses.map(h => {
        const item = {
            number: Number(h.number),
            name: h.name,
            odds: Number(h.odds),
            popularity: Number(h.popularity),
            ability: h.ability || { max: 0, avg: 0, last: 0 }
        };

        // 1. 基本期待値 (Value Score)
        const baseLine = [0, 2.8, 5.0, 8.0, 12.0, 18.0, 25.0, 35.0, 50.0, 70.0];
        const expected = baseLine[item.popularity] || (item.popularity * 8);
        item.value_score = item.odds / expected;

        // 2. 実力スコア (Ability Score) - V8新機能
        // タイム指数の「平均」と「直近」を重視。100を基準(1.0)とする
        const abilityBase = (item.ability.avg * 0.6 + item.ability.last * 0.4);
        item.ability_score = abilityBase > 0 ? (abilityBase / 95) : 0.9; // 指数がない馬は一律0.9 (未勝利・初出走考慮)

        // 3. ユーザー的中傾向スコア (User Match) - V8新機能
        item.user_match_score = 1.0;
        if (profile && profile.strong_pops) {
            if (profile.strong_pops.includes(item.popularity)) {
                item.user_match_score = 1.25; // 得意な人気帯の馬には+25%のボーナス
            }
        }

        // 4. 安定度 (人気と実力の相関)
        let stability = (10 / (item.popularity + 0.5));
        // 実力スコアが高い馬は安定度を補正
        if (item.ability_score > 1.05) stability *= 1.15;

        // 5. 1番人気ペナルティ（実力が伴わない過剰人気を回避）
        if (item.popularity === 1) {
            if (item.odds < 2.0 && item.ability_score < 1.0) stability *= 0.4; // 人気だけど指数が低いなら大幅減点
            else if (item.odds < 3.0) stability *= 0.7;
        }

        // 最終スコア算出
        const variance = 0.9 + (Math.random() * 0.2);
        item.ai_score = stability * item.value_score * item.ability_score * item.user_match_score * variance;

        return item;
    });

    // スコア降順ソート
    scored.sort((a, b) => b.ai_score - a.ai_score);

    const honmei = scored[0];
    const taikou = scored[1] || scored[0];
    const aite = scored.filter(h => h.number !== honmei.number).slice(0, 5);

    return { honmei, taikou, aite, all_scored: scored };
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
        <h2 style="font-size:1.8rem; font-weight:900; color:#fff;">${data.race_info.name || '分析完了'}</h2>
        <div style="font-size:0.75rem; color:#d4af37; letter-spacing:2px; font-weight:700;">STRATEGY: PERFORMANCE & USER LOGIC V8</div>
    `;

    const { honmei, taikou, aite, all_scored } = data.predictions;

    document.getElementById('total-budget').textContent = formatPrice(parseInt(document.getElementById('user-budget').value));

    // 買い目生成
    const patterns = [
        { type: "単勝", method: "1頭流し", icon: "💎", jiku: [honmei], aite: [], ratio: 0.2 },
        { type: "馬連", method: "軸1頭流し", icon: "🏇", jiku: [honmei], aite: [taikou, ...aite.slice(0, 3)], ratio: 0.45 },
        { type: "ワイド", method: "軸1頭流し", icon: "🛡️", jiku: [honmei], aite: [taikou, ...aite.slice(0, 3)], ratio: 0.35 }
    ];

    let totalComputed = 0;

    patterns.forEach(p => {
        const clone = template.content.cloneNode(true);

        clone.querySelector('.badge').textContent = p.icon;
        clone.querySelector('.card-title').textContent = `${p.type} (${p.method})`;

        const patternScore = Math.min(99, Math.floor(honmei.ai_score * 4.5 + 40));

        clone.querySelector('.card-reasoning').innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.7rem; color:#8b949e;">AI分析推奨度</span>
                <span style="font-size:0.9rem; color:${patternScore > 85 ? '#ffeb3b' : '#fff'}; font-weight:900;">${patternScore}%</span>
            </div>
            <div style="width:100%; height:3px; background:#333; border-radius:10px; overflow:hidden; margin-bottom:12px;">
                <div style="width:${patternScore}%; height:100%; background:linear-gradient(90deg, #d4af37, #fff);"></div>
            </div>
            <p style="font-size:0.75rem; color:#c9d1d9; line-height:1.4;">
                【AI根拠】軸馬<b>${honmei.name}</b>は実力指数${honmei.ability.avg > 0 ? honmei.ability.avg : 'データ参照中'}。
                ${honmei.user_match_score > 1.0 ? 'あなたの得意な人気帯と一致しており、過去の成功パターンに合致しています。' : 'オッズと実力のバランスが最も高い勝ちパターンです。'}
            </p>
        `;

        const detailsDiv = clone.querySelector('.bet-details');
        detailsDiv.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; align-items:center;">
                    <div style="width:35px; font-size:0.7rem; font-weight:bold; color:#8b949e;">軸</div>
                    <div class="horse-tag honmei" style="flex:1; display:flex; justify-content:space-between; align-items:center;">
                        <span><b>${p.jiku[0].number}</b> ${p.jiku[0].name}</span>
                        <span style="font-size:0.6rem; opacity:0.8;">能力S: ${p.jiku[0].ability_score.toFixed(2)}</span>
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

    // 【V8】AIスコア詳細分析テーブル
    const analysisSection = document.createElement('section');
    analysisSection.style = "margin:1rem; padding-bottom:3rem;";
    analysisSection.innerHTML = `
        <h3 style="font-size:0.95rem; font-weight:900; color:#d4af37; margin-bottom:1rem; border-left:4px solid #d4af37; padding-left:10px;">📊 AI解析詳細 (実力×傾向)</h3>
        <div style="border-radius:16px; overflow:hidden; background:#161b22; border:1px solid #30363d;">
            <table style="width:100%; border-collapse:collapse; font-size:0.75rem; text-align:left;">
                <thead style="background:#21262d; color:#8b949e;">
                    <tr>
                        <th style="padding:10px;">馬番/馬名</th>
                        <th style="padding:10px;">実力度</th>
                        <th style="padding:10px;">ユーザーMatch</th>
                        <th style="padding:10px;">AI総合</th>
                    </tr>
                </thead>
                <tbody>
                    ${all_scored.map(h => {
        const isHonmei = h.number === honmei.number;
        const matchIcon = h.user_match_score > 1.0 ? '🔥' : '-';
        return `
                        <tr style="border-bottom:1px solid #21262d; background:${isHonmei ? 'rgba(212,175,55,0.08)' : 'transparent'};">
                            <td style="padding:10px;">
                                <div style="font-weight:900; color:${isHonmei ? '#d4af37' : '#fff'};">${h.number} ${h.name}</div>
                                <div style="font-size:0.6rem; color:#8b949e;">${h.popularity}人気 / ${h.odds}倍</div>
                            </td>
                            <td style="padding:10px; font-weight:bold; color:${h.ability_score > 1.0 ? '#3fb950' : '#fff'};">${h.ability_score.toFixed(2)}</td>
                            <td style="padding:10px; text-align:center;">${matchIcon}</td>
                            <td style="padding:10px; font-weight:900; color:${isHonmei ? '#d4af37' : '#fff'};">${h.ai_score.toFixed(1)}</td>
                        </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
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
            btn.textContent = '済 ✅';
        }
    } catch (e) {
        btn.textContent = 'Err';
    }
}

// --- メイン取得プロセス ---
async function fetchAnalysis() {
    const urlInput = document.getElementById('netkeiba-url').value.trim();
    if (!urlInput) return;

    let raceId = urlInput;
    const m1 = urlInput.match(/race_id=(\d{12})/);
    const m2 = urlInput.match(/race\/(\d{12})/);
    if (m1) raceId = m1[1]; else if (m2) raceId = m2[1];

    if (!/^\d{12}$/.test(raceId)) {
        showErrorInUI("12桁のJRAレースIDを入力してください");
        return;
    }

    const btn = document.getElementById('fetch-odds-btn');
    btn.disabled = true;
    btn.textContent = '能力解析中';

    document.getElementById('bet-cards-container').innerHTML = `
        <div style="text-align:center; padding:4rem; color:#8b949e;">
            <p>全出走馬の実力をデータベースから照合中...<br><small>過去5走の指数とあなたの傾向を分析しています</small></p>
        </div>
    `;

    try {
        // 1. ユーザー傾向の取得
        const profRes = await fetch('/api/user_profile');
        const profData = await profRes.json();
        const profile = profData.success ? profData.profile : null;

        // 2. レースデータの取得 (能力指数含む)
        const res = await fetch(`/api/scrape?race_id=${raceId}`);
        if (!res.ok) throw new Error("API通信失敗");
        const result = await res.json();

        if (result.success) {
            const hArray = Object.keys(result.horses).map(num => ({
                number: num,
                name: result.horses[num].name,
                odds: result.horses[num].odds,
                popularity: result.horses[num].popularity,
                ability: result.horses[num].ability
            }));

            currentData = {
                race_info: { id: result.race_id, name: result.race_name },
                predictions: buildAIPredictions(hArray, { name: result.race_name }, profile),
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
    document.getElementById('fetch-odds-btn').addEventListener('click', fetchAnalysis);
    document.getElementById('user-budget').addEventListener('change', () => { if (currentData) renderApp(currentData); });
}

document.addEventListener('DOMContentLoaded', initApp);
console.log("App V8 Loaded (Ability + User Profile).");
