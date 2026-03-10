/**
 * app_v11.js
 * AI買い目ジェネレーター (V11: DNA - ロジック内蔵 & 重複完全排除)
 */

let currentData = null;

// --- 【組み込みロジック】ユーザーの勝ちパターン DNA ---
// これにより、CSVを読み込まなくてもAIがこの傾向を最初から持ちます
const USER_DNA = {
    strong_pops: [2, 3, 4, 5, 6], // あなたが得意な「中穴〜上位」の範囲
    strong_types: ["ワイド", "馬連"],
    ability_weight: 1.8, // 実力（指数）をどれだけ重視するか (1.0が標準)
    logic_name: "Expert Logic (Hardcoded)"
};

function formatPrice(val) { return `¥${Number(val).toLocaleString()}`; }

function showErrorInUI(msg) {
    const container = document.getElementById('bet-cards-container');
    if (container) {
        container.innerHTML = `<div style="padding:2rem; color:#f85149; text-align:center;">⚠️ ${msg}</div>`;
    }
}

// --- AI予測エンジン (V11) ---
function buildAIPredictions(horses, raceInfo, dbProfile) {
    if (!horses || horses.length === 0) return {};

    // 1. 各馬のスコアリング
    const scored = horses.map(h => {
        const item = {
            number: Number(h.number),
            name: h.name,
            odds: Number(h.odds),
            popularity: Number(h.popularity),
            ability: h.ability || { max: 0, avg: 0, last: 0 }
        };

        // A. 期待値 (妙味)
        const baseLine = [0, 2.7, 4.8, 7.5, 11.0, 16.0, 24.0, 32.0, 48.0, 65.0];
        const expected = baseLine[item.popularity] || (item.popularity * 8.5);
        item.value_score = item.odds / expected;

        // B. 実力補正 (V11: 重みを1.8倍に強化)
        // 指数95以上を優秀、100以上を鉄板級と判定
        const abilityVal = Math.max(item.ability.avg, item.ability.max * 0.7, item.ability.last * 0.95);
        item.ability_score = abilityVal > 0 ? (Math.pow(abilityVal / 90, 1.5)) : 0.85;

        // C. ユーザーDNAボーナス (組み込みロジックの反映)
        item.user_match_bonus = 0;
        // DBにデータがあればそれ、なければハードコードしたDNAを使う
        const profile = dbProfile && dbProfile.strong_pops && dbProfile.strong_pops.length > 0 ? dbProfile : USER_DNA;

        if (profile.strong_pops.map(Number).includes(item.popularity)) {
            item.user_match_bonus = 30; // 30%の加点
        }

        // D. 安定性
        let stability = (15 / (item.popularity + 0.3));

        // E. 1番人気ペナルティ (実力・オッズが見合わない場合)
        if (item.popularity === 1) {
            if (item.odds < 2.2 && item.ability_score < 1.1) stability *= 0.3;
            else if (item.odds < 3.0) stability *= 0.6;
        }

        // 最終算出
        const variance = 0.9 + (Math.random() * 0.2);
        item.ai_score = stability * item.value_score * (item.ability_score * USER_DNA.ability_weight) * (1 + item.user_match_bonus / 100) * variance;

        return item;
    });

    // スコア降順
    scored.sort((a, b) => b.ai_score - a.ai_score);

    // --- 【重要】重複排除ロジック ---
    const honmei = scored[0];

    // 対抗は「本命と同じ馬番ではない」スコア2位
    let taikou = scored.find(h => h.number !== honmei.number);
    if (!taikou) taikou = honmei; // 1頭しかいない場合

    // 相手は「本命でも対抗でもない」馬たち
    const aite = scored.filter(h => h.number !== honmei.number && h.number !== taikou.number).slice(0, 5);

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
        <div style="font-size:0.75rem; color:#d4af37; font-weight:700; letter-spacing:1px;">AI DNA CORE V11: INTEGRATED LOGIC</div>
    `;

    const { honmei, taikou, aite } = data.predictions;
    const userBudget = parseInt(document.getElementById('user-budget').value) || 10000;
    budgetTotalDisp.textContent = formatPrice(userBudget);

    // 買い目生成 (V11: 物理的排除を確実に行う)
    const patterns = [
        { type: "単勝", method: "1頭流し", icon: "💎", jiku: [honmei], aite: [], ratio: 0.15 },
        {
            type: "馬連", method: "軸1頭流し", icon: "🏇",
            jiku: [honmei],
            // 相手リスト: [対抗, 相手1, 相手2, 相手3]
            aite: [taikou, ...aite.slice(0, 3)].filter(h => h.number !== honmei.number),
            ratio: 0.45
        },
        {
            type: "ワイド", method: "軸1頭流し", icon: "🛡️",
            jiku: [honmei],
            aite: [taikou, ...aite.slice(0, 3)].filter(h => h.number !== honmei.number),
            ratio: 0.4
        }
    ];

    let totalComputed = 0;

    patterns.forEach(p => {
        const clone = template.content.cloneNode(true);
        clone.querySelector('.badge').textContent = p.icon;
        clone.querySelector('.card-title').textContent = `${p.type} (${p.method})`;

        const pScore = Math.min(99, Math.floor(honmei.ai_score * 4 + 45));
        clone.querySelector('.card-reasoning').innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span style="font-size:0.7rem; color:#8b949e;">AI分析DNA合致率</span>
                <b style="color:#ffeb3b;">${pScore}%</b>
            </div>
            <p style="font-size:0.75rem;">
                本命 <b>${honmei.name}</b> は実力指数も高く、${honmei.user_match_bonus > 0 ? 'あらかじめ組み込まれた「成功法則」に基づき、自信を持って推奨します。' : '中穴としての妙味が非常に強い条件です。'}
            </p>
        `;

        const detailsDiv = clone.querySelector('.bet-details');

        // --- 相手リスト表示時の「最後ダメ押し」排除 ---
        // 相手リストから本命馬を完全に除外する
        const cleanAite = p.aite.filter(h => h.number !== honmei.number);

        detailsDiv.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; align-items:center;">
                    <div style="width:35px; font-size:0.7rem; color:#8b949e; font-weight:900;">軸</div>
                    <div class="horse-tag honmei" style="flex:1;"><b>${p.jiku[0].number}</b> ${p.jiku[0].name}</div>
                </div>
                ${cleanAite.length > 0 ? `
                <div style="display:flex; align-items:flex-start;">
                    <div style="width:35px; font-size:0.7rem; color:#8b949e; font-weight:900; margin-top:5px;">相手</div>
                    <div style="flex:1; display:flex; flex-wrap:wrap; gap:5px;">
                        ${cleanAite.map(h => `<span class="horse-tag" style="background:rgba(255,255,255,0.05);"><b>${h.number}</b> ${h.name}</span>`).join('')}
                    </div>
                </div>` : ''}
            </div>
        `;

        const points = cleanAite.length || 1;
        const perPoint = Math.floor((userBudget * p.ratio) / points / 100) * 100;
        const cTotal = perPoint * points;
        totalComputed += cTotal;

        clone.querySelector('.price-calc').textContent = `@${perPoint} × ${points}点`;
        clone.querySelector('.price-total').textContent = formatPrice(cTotal);

        clone.querySelector('.save-btn').addEventListener('click', (e) => saveBet(e.target, p, points, cTotal));
        container.appendChild(clone);
    });

    document.getElementById('final-total').textContent = formatPrice(totalComputed);

    // 詳細テーブル
    renderTable(data.predictions.all_scored, honmei);
}

function renderTable(all_scored, honmei) {
    const tableSection = document.createElement('section');
    tableSection.style = "margin:1rem; padding-bottom:5rem;";
    tableSection.innerHTML = `
        <h3 style="font-size:0.9rem; color:#d4af37; margin-bottom:12px; border-left:4px solid #d4af37; padding-left:10px;">📊 AI解析詳細 (DNA内蔵)</h3>
        <div style="border-radius:16px; overflow:hidden; background:#161b22; border:1px solid #30363d;">
            <table style="width:100%; font-size:0.75rem; text-align:left; border-collapse:collapse;">
                <thead style="background:#21262d; color:#8b949e;">
                    <tr>
                        <th style="padding:12px;">馬名</th>
                        <th style="padding:12px;">能力S</th>
                        <th style="padding:12px;">DNA合致</th>
                        <th style="padding:12px;">AI総合</th>
                    </tr>
                </thead>
                <tbody>
                    ${all_scored.map(h => `
                        <tr style="border-bottom:1px solid #21262d; background:${h.number === honmei.number ? 'rgba(212,175,55,0.08)' : 'transparent'};">
                            <td style="padding:12px;"><b>${h.number} ${h.name}</b><br><small>${h.popularity}人気 / ${h.odds}倍</small></td>
                            <td style="padding:12px; font-weight:bold; color:${h.ability_score > 1.1 ? '#3fb950' : '#fff'};">${h.ability_score.toFixed(2)}</td>
                            <td style="padding:12px; font-weight:bold; text-align:center;">${h.user_match_bonus > 0 ? '🔥' : '-'}</td>
                            <td style="padding:12px; font-weight:900; color:${h.number === honmei.number ? '#d4af37' : '#fff'};">${h.ai_score.toFixed(1)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    document.getElementById('bet-cards-container').appendChild(tableSection);
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
        if (res.ok) btn.textContent = '保存済';
    } catch (e) { }
}

async function fetchAnalysis() {
    const url = document.getElementById('netkeiba-url').value.trim();
    const match = url.match(/race_id=(\d{12})/) || url.match(/race\/(\d{12})/);
    if (!match) return;

    const btn = document.getElementById('fetch-odds-btn');
    btn.disabled = true;
    btn.textContent = '解析開始';

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
console.log("App V11 DNA Active.");
