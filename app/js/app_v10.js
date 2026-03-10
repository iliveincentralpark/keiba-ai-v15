/**
 * app_v10.js
 * AI買い目ジェネレーター (V10: 重複排除・学習反映・キャッシュ徹底回避)
 */

let currentData = null;

function formatPrice(val) { return `¥${Number(val).toLocaleString()}`; }

function showErrorInUI(msg) {
    const container = document.getElementById('bet-cards-container');
    if (container) {
        container.innerHTML = `<div style="padding:2rem; color:#f85149; text-align:center; background:rgba(248,81,73,0.1); border-radius:16px;">⚠️ ${msg}</div>`;
    }
}

// --- AI予測ロジック (V10) ---
function buildAIPredictions(horses, raceInfo, profile) {
    if (!horses || horses.length === 0) return {};

    // 0. 重複の排除 (念のため)
    const seen = new Set();
    const uniqueHorses = horses.filter(h => {
        if (seen.has(h.number)) return false;
        seen.add(h.number);
        return true;
    });

    const scored = uniqueHorses.map(h => {
        const item = {
            number: Number(h.number),
            name: h.name,
            odds: Number(h.odds),
            popularity: Number(h.popularity),
            ability: h.ability || { max: 0, avg: 0, last: 0 }
        };

        // 1. 期待値 (Value Score)
        const baseLine = [0, 2.7, 4.8, 7.5, 11.0, 16.0, 24.0, 32.0, 48.0, 65.0];
        const expected = baseLine[item.popularity] || (item.popularity * 8);
        item.value_score = item.odds / expected;

        // 2. 実力スコア (能力指数の反映)
        const abilityVal = Math.max(item.ability.avg, item.ability.max * 0.7, item.ability.last * 0.9);
        item.ability_score = abilityVal > 0 ? (Math.pow(abilityVal / 92, 1.3)) : 0.88;

        // 3. ユーザー学習反映 (User Match)
        item.user_match_bonus = 0;
        if (profile && profile.strong_pops && profile.strong_pops.length > 0) {
            // 人気帯が profile.strong_pops に含まれていれば加点
            if (profile.strong_pops.map(Number).includes(item.popularity)) {
                item.user_match_bonus = 25; // 25%の大幅ボーナス
            }
        }

        // 4. 安定度 (人気と評価の相関)
        let stability = (12 / (item.popularity + 0.4));

        // 5. 1番人気ペナルティ (実力不足の過剰人気を厳罰化)
        if (item.popularity === 1) {
            if (item.odds < 2.0 && item.ability_score < 1.05) stability *= 0.35; // 期待値が非常に低い
            else if (item.odds < 3.0) stability *= 0.65;
        }

        // 総合スコア算出
        const variance = 0.92 + (Math.random() * 0.16);
        item.ai_score = stability * item.value_score * item.ability_score * (1 + item.user_match_bonus / 100) * variance;

        return item;
    });

    // スコア降順ソート
    scored.sort((a, b) => b.ai_score - a.ai_score);

    const honmei = scored[0];
    const taikou = scored[1] || scored[0];

    // 【重複排除ロジック】 相手候補から本命と対抗を物理的に削除
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
        <div style="font-size:0.75rem; color:#d4af37; font-weight:700; letter-spacing:1px;">AI ENGINE V10: DEEP LEARNED</div>
    `;

    const { honmei, taikou, aite, all_scored } = data.predictions;
    const userBudget = parseInt(document.getElementById('user-budget').value) || 10000;
    budgetTotalDisp.textContent = formatPrice(userBudget);

    // 買い目生成 (V10: 相手から本命/対抗を完全排除)
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

        const pScore = Math.min(99, Math.floor(honmei.ai_score * 5 + 40));
        clone.querySelector('.card-reasoning').innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span style="font-size:0.7rem; color:#8b949e;">AI期待度評価</span>
                <b style="color:#ffeb3b;">${pScore}%</b>
            </div>
            <p style="font-size:0.75rem; color:#ccc;">
                推定実力は<b>${honmei.ability_score.toFixed(2)}</b>。
                ${honmei.user_match_bonus > 0 ? '<span style="color:#d4af37; font-weight:bold;">あなたの得意パターンに合致。</span>' : '期待値と安定性のバランスから選定。'}
            </p>
        `;

        const detailsDiv = clone.querySelector('.bet-details');

        // 相手馬リストのユニーク化 (念押し)
        const uniqueAite = Array.from(new Set(p.aite.map(h => h.number))).map(n => p.aite.find(h => h.number === n));

        detailsDiv.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; align-items:center;">
                    <div style="width:35px; font-size:0.7rem; color:#8b949e; font-weight:900;">軸</div>
                    <div class="horse-tag honmei" style="flex:1; border:2px solid #d4af37; background:rgba(212,175,55,0.15); font-weight:900;">
                        <b>${p.jiku[0].number}</b> ${p.jiku[0].name}
                    </div>
                </div>
                ${uniqueAite.length > 0 ? `
                <div style="display:flex; align-items:flex-start;">
                    <div style="width:35px; font-size:0.7rem; color:#8b949e; font-weight:900; margin-top:5px;">相手</div>
                    <div style="flex:1; display:flex; flex-wrap:wrap; gap:5px;">
                        ${uniqueAite.map(h => `<span class="horse-tag" style="background:rgba(255,255,255,0.05); border:1px solid #333;"><b>${h.number}</b> ${h.name}</span>`).join('')}
                    </div>
                </div>` : ''}
            </div>
        `;

        const points = uniqueAite.length || 1;
        const perPoint = Math.floor((userBudget * p.ratio) / points / 100) * 100;
        const cTotal = perPoint * points;
        totalComputed += cTotal;

        clone.querySelector('.price-calc').textContent = `@${perPoint} × ${points}点`;
        clone.querySelector('.price-total').textContent = formatPrice(cTotal);

        clone.querySelector('.save-btn').addEventListener('click', (e) => saveBet(e.target, p, points, cTotal));
        container.appendChild(clone);
    });

    finalTotalDisp.textContent = formatPrice(totalComputed);

    // 詳細解析テーブル (V10)
    const tableSection = document.createElement('section');
    tableSection.style = "margin:1.5rem 1rem; padding-bottom:4rem;";
    tableSection.innerHTML = `
        <h3 style="font-size:0.95rem; color:#d4af37; margin-bottom:12px; border-left:4px solid #d4af37; padding-left:10px;">📊 AI解析詳細 (データ融合)</h3>
        <div style="border-radius:16px; overflow:hidden; background:#161b22; border:1px solid #30363d;">
            <table style="width:100%; font-size:0.75rem; text-align:left; border-collapse:collapse;">
                <thead style="background:#21262d; color:#8b949e; border-bottom:1px solid #333;">
                    <tr>
                        <th style="padding:12px;">馬名/人気</th>
                        <th style="padding:12px;">能力S</th>
                        <th style="padding:12px;">Match</th>
                        <th style="padding:12px;">AI総合</th>
                    </tr>
                </thead>
                <tbody>
                    ${all_scored.map(h => {
        const isHonmei = h.number === honmei.number;
        const matchText = h.user_match_bonus > 0 ? `<span style="color:#3fb950; font-weight:900;">+${h.user_match_bonus}%</span>` : `<span style="color:#8b949e;">-</span>`;
        return `
                        <tr style="border-bottom:1px solid #21262d; background:${isHonmei ? 'rgba(212,175,55,0.08)' : 'transparent'};">
                            <td style="padding:12px;">
                                <div style="font-weight:900; color:${isHonmei ? '#d4af37' : '#fff'}; font-size:0.85rem;">${h.number} ${h.name}</div>
                                <div style="font-size:0.65rem; color:#8b949e; margin-top:3px;">${h.popularity}人気 / ${h.odds}倍</div>
                            </td>
                            <td style="padding:12px; font-weight:bold; color:${h.ability_score > 1.1 ? '#3fb950' : '#fff'};">${h.ability_score.toFixed(2)}</td>
                            <td style="padding:12px; font-weight:bold;">${matchText}</td>
                            <td style="padding:12px; font-weight:900; font-size:0.95rem; color:${isHonmei ? '#d4af37' : '#fff'};">${h.ai_score.toFixed(1)}</td>
                        </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    container.appendChild(tableSection);
}

// --- 通信エンジン ---
async function saveBet(btn, p, points, amount) {
    btn.disabled = true;
    btn.textContent = '...';
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
        if (res.ok) {
            btn.textContent = '済 ✅';
            btn.style.color = '#3fb950';
        }
    } catch (e) { btn.textContent = 'Err'; btn.disabled = false; }
}

async function fetchAnalysis() {
    const url = document.getElementById('netkeiba-url').value.trim();
    if (!url) return;
    const match = url.match(/race_id=(\d{12})/) || url.match(/race\/(\d{12})/);
    if (!match) return showErrorInUI("netkeibaの出馬表URLを正しく入力してください");

    const btn = document.getElementById('fetch-odds-btn');
    btn.disabled = true;
    btn.textContent = 'DEEP解析中';

    document.getElementById('bet-cards-container').innerHTML = `
        <div style="text-align:center; padding:5rem; color:#8b949e;">
            <div style="width:40px; height:40px; border:4px solid #333; border-top-color:#d4af37; border-radius:50%; margin:0 auto 20px; animation:spin 1s linear infinite;"></div>
            <p>実力データとあなたの学習傾向を融合中...</p>
            <style>@keyframes spin {100%{transform:rotate(360deg);}}</style>
        </div>
    `;

    try {
        const [profRes, scrapRes] = await Promise.all([
            fetch('/api/user_profile'),
            fetch(`/api/scrape?race_id=${match[1]}`)
        ]);
        const profResult = await profRes.json();
        const prof = profResult.success ? profResult.profile : null;
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
        } else {
            throw new Error("データ取得に失敗しました");
        }
    } catch (e) { showErrorInUI(e.message); }
    finally { btn.disabled = false; btn.textContent = '解析'; }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fetch-odds-btn').addEventListener('click', fetchAnalysis);
    document.getElementById('user-budget').addEventListener('change', () => {
        if (currentData) renderApp(currentData);
    });
});
console.log("App V10 Engine Active.");
