/**
 * app_v12.js
 * AI買い目ジェネレーター (V12: DNA CORE + Robust Error Handling)
 */

let currentData = null;

// --- 【DNA】ユーザーロジックの組み込み ---
// CSVを読み込まなくても、AIが最初からこのルールで動きます
const DNA = {
    strong_pops: [2, 3, 4, 5, 6], // 中穴〜上位を重視
    ability_weight: 2.0,         // 実力指数を通常の2倍重視する
    logic_name: "Expert DNA Activated"
};

function formatPrice(val) { return `¥${Number(val || 0).toLocaleString()}`; }

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
    else console.warn(`Element #${id} not found`);
}

function showErrorInUI(msg) {
    const container = document.getElementById('bet-cards-container');
    if (container) {
        container.innerHTML = `<div style="padding:2rem; color:#f85149; text-align:center; background:rgba(248,81,73,0.1); border-radius:16px;">⚠️ ${msg}</div>`;
    }
}

// --- AI予測エンジン (V12) ---
function buildAIPredictions(horses, dbProfile) {
    if (!horses || horses.length === 0) return { honmei: null, taikou: null, aite: [], all_scored: [] };

    const scored = horses.map(h => {
        const item = {
            number: Number(h.number),
            name: h.name || `馬#${h.number}`,
            odds: Number(h.odds) || 999,
            popularity: Number(h.popularity) || 99,
            ability: h.ability || { max: 0, avg: 0, last: 0 }
        };

        // 1. 妙味スコア
        const baseLine = [0, 2.7, 4.8, 7.5, 11.0, 16.0, 24.0, 32.0, 48.0, 65.0];
        const expected = baseLine[item.popularity] || (item.popularity * 8);
        item.value_score = item.odds / expected;

        // 2. 実力スコア (指数の重みをさらに強化)
        const abilityVal = Math.max(item.ability.avg, item.ability.max * 0.7, item.ability.last * 0.9);
        item.ability_score = abilityVal > 0 ? (Math.pow(abilityVal / 92, 1.4)) : 0.88;

        // 3. ユーザーDNA反映 (User Match)
        item.user_match_bonus = 0;
        const profile = (dbProfile && dbProfile.strong_pops && dbProfile.strong_pops.length > 0) ? dbProfile : DNA;
        if (profile.strong_pops.map(Number).includes(item.popularity)) {
            item.user_match_bonus = 35; // 35%ボーナス
        }

        // 4. 安定度
        let stability = (15 / (item.popularity + 0.3));
        if (item.popularity === 1 && item.odds < 2.5 && item.ability_score < 1.1) stability *= 0.3;

        // 5. 総合スコア (DNAウェイト適用)
        const variance = 0.95 + (Math.random() * 0.1);
        item.ai_score = stability * item.value_score * (item.ability_score * DNA.ability_weight) * (1 + item.user_match_bonus / 100) * variance;

        return item;
    });

    scored.sort((a, b) => b.ai_score - a.ai_score);

    const honmei = scored[0];
    const taikou = scored.find(h => h.number !== honmei.number) || honmei;
    const aite = scored.filter(h => h.number !== honmei.number && h.number !== taikou.number).slice(0, 5);

    return { honmei, taikou, aite, all_scored: scored };
}

// --- UI描画 ---
function renderApp(data) {
    const container = document.getElementById('bet-cards-container');
    const raceContainer = document.getElementById('race-info-container');
    const template = document.getElementById('bet-card-template');

    if (!container || !template) return;
    container.innerHTML = '';
    if (!data || !data.race_info) return;

    if (raceContainer) {
        raceContainer.innerHTML = `
            <h2 style="font-size:1.8rem; font-weight:900; color:#fff;">${data.race_info.name}</h2>
            <div style="font-size:0.75rem; color:#ffeb3b; font-weight:700; letter-spacing:1px;">🧬 AI DNA CORE V12: EXPERT MODE</div>
        `;
    }

    const { honmei, taikou, aite, all_scored } = data.predictions;
    if (!honmei) return;

    const budgetInput = document.getElementById('user-budget');
    const userBudget = budgetInput ? (parseInt(budgetInput.value) || 10000) : 10000;
    safeSetText('total-budget', formatPrice(userBudget));

    const patterns = [
        { type: "単勝", method: "1頭型", icon: "💎", jiku: [honmei], aite: [], ratio: 0.15 },
        { type: "馬連", method: "流し", icon: "🏇", jiku: [honmei], aite: [taikou, ...aite.slice(0, 3)], ratio: 0.45 },
        { type: "ワイド", method: "流し", icon: "🛡️", jiku: [honmei], aite: [taikou, ...aite.slice(0, 3)], ratio: 0.4 }
    ];

    let totalComputed = 0;

    patterns.forEach(p => {
        const clone = template.content.cloneNode(true);
        const badge = clone.querySelector('.badge');
        const title = clone.querySelector('.card-title');
        const reasoning = clone.querySelector('.card-reasoning');
        const details = clone.querySelector('.bet-details');
        const priceCalc = clone.querySelector('.price-calc');
        const priceTotal = clone.querySelector('.price-total');
        const saveBtn = clone.querySelector('.save-btn');

        if (badge) badge.textContent = p.icon;
        if (title) title.textContent = `${p.type} (${p.method})`;

        const pScore = Math.min(99, Math.floor(honmei.ai_score * 4 + 40));
        if (reasoning) {
            reasoning.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="font-size:0.7rem; color:#8b949e;">AI DNA合致率</span>
                    <b style="color:#ffeb3b;">${pScore}%</b>
                </div>
                <p style="font-size:0.75rem;">本命: ${honmei.name} (実力S: ${honmei.ability_score.toFixed(2)})</p>
                <p style="font-size:0.65rem; color:#8b949e;">※あなたの勝ちパターンと実力が融合した解析結果です。</p>
            `;
        }

        // 軸と相手の重複を確実に排除
        const cleanAite = p.aite.filter(h => h.number !== p.jiku[0].number);

        if (details) {
            details.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; align-items:center;">
                        <div style="width:35px; font-size:0.65rem; color:#8b949e;">軸</div>
                        <div class="horse-tag honmei" style="flex:1;"><b>${p.jiku[0].number}</b> ${p.jiku[0].name}</div>
                    </div>
                    ${cleanAite.length > 0 ? `
                    <div style="display:flex; align-items:flex-start;">
                        <div style="width:35px; font-size:0.65rem; color:#8b949e; margin-top:5px;">相手</div>
                        <div style="flex:1; display:flex; flex-wrap:wrap; gap:4px;">
                            ${cleanAite.map(h => `<span class="horse-tag" style="background:#21262d; border-color:#444;"><b>${h.number}</b> ${h.name}</span>`).join('')}
                        </div>
                    </div>` : ''}
                </div>
            `;
        }

        const points = cleanAite.length || 1;
        const perPoint = Math.floor((userBudget * p.ratio) / points / 100) * 100;
        const cTotal = perPoint * points;
        totalComputed += cTotal;

        if (priceCalc) priceCalc.textContent = `@${perPoint} × ${points}点`;
        if (priceTotal) priceTotal.textContent = formatPrice(cTotal);

        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => saveBet(e.target, p, points, cTotal));
        }

        container.appendChild(clone);
    });

    safeSetText('final-total', formatPrice(totalComputed));

    // 詳細テーブル描画
    const tableDiv = document.createElement('div');
    tableDiv.style = "margin:1.5rem 1rem; padding-bottom:5rem;";
    tableDiv.innerHTML = `
        <h3 style="font-size:0.9rem; color:#d4af37; margin-bottom:12px; border-left:4px solid #d4af37; padding-left:10px;">📊 AI解析詳細 (DNA内蔵)</h3>
        <div style="border-radius:12px; overflow:hidden; background:#161b22; border:1px solid #333;">
            <table style="width:100%; font-size:0.75rem; text-align:left; border-collapse:collapse;">
                <thead style="background:#21262d; color:#8b949e;">
                    <tr>
                        <th style="padding:10px;">馬名</th>
                        <th style="padding:10px;">実力S</th>
                        <th style="padding:10px;">Match</th>
                        <th style="padding:10px;">AI点</th>
                    </tr>
                </thead>
                <tbody>
                    ${all_scored.map(h => `
                        <tr style="border-bottom:1px solid #21262d; background:${h.number === honmei.number ? 'rgba(212,175,55,0.08)' : 'transparent'};">
                            <td style="padding:10px;"><b>${h.number} ${h.name}</b><br><small>${h.popularity}人/${h.odds}倍</small></td>
                            <td style="padding:10px; font-weight:bold; color:${h.ability_score > 1.05 ? '#3fb950' : '#fff'};">${h.ability_score.toFixed(2)}</td>
                            <td style="padding:10px; text-align:center;">${h.user_match_bonus > 0 ? '🔥' : '-'}</td>
                            <td style="padding:10px; font-weight:900; color:${h.number === honmei.number ? '#d4af37' : '#fff'};">${h.ai_score.toFixed(1)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    container.appendChild(tableDiv);
}

// --- 通信 ---
async function saveBet(btn, p, points, amount) {
    if (!btn || !currentData) return;
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
            btn.textContent = '済';
            btn.style.background = '#3fb950';
        }
    } catch (e) { btn.disabled = false; btn.textContent = 'Err'; }
}

async function fetchAnalysis() {
    const urlEl = document.getElementById('netkeiba-url');
    if (!urlEl) return;
    const url = urlEl.value.trim();
    const match = url.match(/race_id=(\d{12})/) || url.match(/race\/(\d{12})/);
    if (!match) return;

    const btn = document.getElementById('fetch-odds-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '解析開始';
    }

    try {
        const [profRes, scrapRes] = await Promise.all([
            fetch('/api/user_profile').catch(() => ({ json: () => ({ success: false }) })),
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
                predictions: buildAIPredictions(hArray, prof),
                all_horses: hArray
            };
            renderApp(currentData);
        }
    } catch (e) { showErrorInUI(e.message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '解析'; } }
}

document.addEventListener('DOMContentLoaded', () => {
    const fetchBtn = document.getElementById('fetch-odds-btn');
    if (fetchBtn) fetchBtn.addEventListener('click', fetchAnalysis);

    const budgetInput = document.getElementById('user-budget');
    if (budgetInput) budgetInput.addEventListener('change', () => {
        if (currentData) renderApp(currentData);
    });
});
console.log("App V12 DNA-CORE Engine Active.");
