/**
 * app_v9.js
 * AI買い目ジェネレーター (V9: 重複修正 + 学習データ連携)
 */

let currentData = null;

// --- ユーティリティ ---
function formatPrice(val) { return `¥${Number(val).toLocaleString()}`; }

function showErrorInUI(msg) {
    const container = document.getElementById('bet-cards-container');
    if (container) {
        container.innerHTML = `<div style="padding:2rem; color:#f85149; text-align:center;">⚠️ ${msg}</div>`;
    }
}

// --- AI予測ロジック (V9) ---
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

        // 期待値
        const baseLine = [0, 2.8, 5.0, 8.0, 12.0, 18.0, 25.0, 35.0, 50.0, 70.0];
        const expected = baseLine[item.popularity] || (item.popularity * 8);
        item.value_score = item.odds / expected;

        // 実力スコア (指数の重みを強化)
        // タイム指数100以上を強力な加点対象とする
        const abilityVal = Math.max(item.ability.avg, item.ability.max * 0.8, item.ability.last);
        item.ability_score = abilityVal > 0 ? (Math.pow(abilityVal / 90, 1.2)) : 0.85;

        // ユーザー学習反映
        item.user_match_bonus = 0;
        if (profile && profile.strong_pops && profile.strong_pops.includes(item.popularity)) {
            item.user_match_bonus = 20; // 20%ボーナス
        }

        // 安定度
        let stability = (12 / (item.popularity + 0.4));
        if (item.popularity === 1 && item.odds < 2.0 && item.ability_score < 1.1) stability *= 0.4;

        // 総合
        const variance = 0.9 + (Math.random() * 0.2);
        item.ai_score = stability * item.value_score * item.ability_score * (1 + item.user_match_bonus / 100) * variance;

        return item;
    });

    scored.sort((a, b) => b.ai_score - a.ai_score);

    const honmei = scored[0];
    const taikou = scored[1] || scored[0];

    // 相手: 本命と対抗を除外し、スコア順かつ人気薄も含める
    const remaining = scored.filter(h => h.number !== honmei.number && h.number !== taikou.number);
    const aite = remaining.slice(0, 5);

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

    raceContainer.innerHTML = `
        <h2 style="font-size:1.8rem; font-weight:900; color:#fff;">${data.race_info.name}</h2>
        <div style="font-size:0.75rem; color:#d4af37; font-weight:700;">PRO AI OPTIMIZED V9</div>
    `;

    const { honmei, taikou, aite, all_scored } = data.predictions;

    const userBudget = parseInt(document.getElementById('user-budget').value) || 10000;
    budgetTotalDisp.textContent = formatPrice(userBudget);

    // 買い目生成 (重複修正 V9)
    const patterns = [
        { type: "単勝", method: "1頭流し", icon: "💎", jiku: [honmei], aite: [], ratio: 0.15 },
        { type: "馬連", method: "軸1頭流し", icon: "🏇", jiku: [honmei], aite: [taikou, ...aite.slice(0, 3)], ratio: 0.45 },
        { type: "ワイド", method: "軸1頭流し", icon: "🛡️", jiku: [honmei], aite: [taikou, ...aite.slice(0, 3)], ratio: 0.4 }
    ];

    let totalComputed = 0;

    patterns.forEach(p => {
        const clone = template.content.cloneNode(true);
        clone.querySelector('.badge').textContent = p.icon;
        clone.querySelector('.card-title').textContent = `${p.type} (${p.method})`;

        const pScore = Math.min(99, Math.floor(honmei.ai_score * 5 + 35));
        clone.querySelector('.card-reasoning').innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span style="font-size:0.7rem; color:#8b949e;">AI自信度</span>
                <b style="color:#ffeb3b;">${pScore}%</b>
            </div>
            <p style="font-size:0.75rem;">軸: ${honmei.name} (実力S: ${honmei.ability_score.toFixed(2)})</p>
        `;

        const detailsDiv = clone.querySelector('.bet-details');
        detailsDiv.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; align-items:center;">
                    <div style="width:35px; font-size:0.7rem; color:#8b949e;">軸</div>
                    <div class="horse-tag honmei" style="flex:1;"><b>${p.jiku[0].number}</b> ${p.jiku[0].name}</div>
                </div>
                ${p.aite.length > 0 ? `
                <div style="display:flex; align-items:flex-start;">
                    <div style="width:35px; font-size:0.7rem; color:#8b949e; margin-top:5px;">相手</div>
                    <div style="flex:1; display:flex; flex-wrap:wrap; gap:4px;">
                        ${p.aite.map(h => `<span class="horse-tag"><b>${h.number}</b> ${h.name}</span>`).join('')}
                    </div>
                </div>` : ''}
            </div>
        `;

        const points = p.aite.length || 1;
        const perPoint = Math.floor((userBudget * p.ratio) / points / 100) * 100;
        const cTotal = perPoint * points;
        totalComputed += cTotal;

        clone.querySelector('.price-calc').textContent = `@${perPoint} × ${points}点`;
        clone.querySelector('.price-total').textContent = formatPrice(cTotal);

        clone.querySelector('.save-btn').addEventListener('click', (e) => saveBet(e.target, p, points, cTotal));
        container.appendChild(clone);
    });

    finalTotalDisp.textContent = formatPrice(totalComputed);

    // 詳細テーブル
    const tableSection = document.createElement('section');
    tableSection.style = "margin:1rem; padding-bottom:3rem;";
    tableSection.innerHTML = `
        <h3 style="font-size:0.9rem; color:#d4af37; margin-bottom:10px;">📊 総合解析スコア表</h3>
        <div style="border-radius:12px; overflow:hidden; background:#161b22; border:1px solid #333;">
            <table style="width:100%; font-size:0.74rem; text-align:left; border-collapse:collapse;">
                <thead style="background:#21262d; color:#8b949e;">
                    <tr>
                        <th style="padding:10px;">馬番/馬名</th>
                        <th style="padding:10px;">実力度</th>
                        <th style="padding:10px;">Match</th>
                        <th style="padding:10px;">AI総合</th>
                    </tr>
                </thead>
                <tbody>
                    ${all_scored.map(h => `
                        <tr style="border-bottom:1px solid #21262d;">
                            <td style="padding:10px;"><b>${h.number}</b> ${h.name} <br><small>${h.popularity}人気</small></td>
                            <td style="padding:10px;">${h.ability_score.toFixed(2)}</td>
                            <td style="padding:10px; color:#3fb950; font-weight:900;">${h.user_match_bonus > 0 ? '+' + h.user_match_bonus + '%' : '-'}</td>
                            <td style="padding:10px; font-weight:900; color:${h.number === honmei.number ? '#d4af37' : '#fff'};">${h.ai_score.toFixed(1)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    container.appendChild(tableSection);
}

// --- 通信 ---
async function saveBet(btn, p, points, amount) {
    btn.disabled = true;
    try {
        const res = await fetch('/api/save_bet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                race_id: currentData.race_info.id,
                race_name: currentData.race_info.name,
                bet_type: p.type, bet_method: p.method, points, amount,
                jiku_horses: p.jiku.map(h => h.number).join(','),
                aite_horses: p.aite.map(h => h.number).join(','),
                jiku_names: p.jiku.map(h => h.name).join(','),
                aite_names: p.aite.map(h => h.name).join(','),
                jiku_pops: p.jiku.map(h => h.popularity).join(','),
                aite_pops: p.aite.map(h => h.popularity).join(','),
                jiku_odds: p.jiku.map(h => h.odds).join(','),
                aite_odds: p.aite.map(h => h.odds).join(',')
            })
        });
        if (res.ok) btn.textContent = '済';
    } catch (e) { }
}

async function fetchAnalysis() {
    const url = document.getElementById('netkeiba-url').value;
    const match = url.match(/race_id=(\d{12})/) || url.match(/race\/(\d{12})/);
    if (!match) return showErrorInUI("URLが不正です");

    const btn = document.getElementById('fetch-odds-btn');
    btn.disabled = true;
    btn.textContent = '解析中';

    try {
        const [profRes, scrapRes] = await Promise.all([
            fetch('/api/user_profile'),
            fetch(`/api/scrape?race_id=${match[1]}`)
        ]);
        const prof = (await profRes.json()).profile;
        const scrap = await scrapRes.json();

        if (scrap.success) {
            const hArray = Object.keys(scrap.horses).map(num => ({
                number: num,
                ...scrap.horses[num]
            }));
            currentData = {
                race_info: { id: scrap.race_id, name: scrap.race_name },
                predictions: buildAIPredictions(hArray, {}, prof),
                all_horses: hArray
            };
            renderApp(currentData);
        }
    } catch (e) { showErrorInUI(e.message); }
    finally { btn.disabled = false; btn.textContent = '解析'; }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fetch-odds-btn').addEventListener('click', fetchAnalysis);
});
