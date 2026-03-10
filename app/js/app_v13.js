/**
 * app_v13.js
 * AI買い目ジェネレーター (V13: REAL USER DNA - CSVから正確に学習)
 *
 * CSVデータ (馬券投票履歴_enriched.csv) の分析結果:
 *  - 券種: 3連複 多用 (8件), 馬単 (3件), 3連単 (3件), 馬連 (2件), ワイド (1件)
 *    → 単勝は0件。3連複が主力。
 *  - 買い方: 1頭軸流し, 2頭軸流し, フォーメーション, BOX
 *  - 軸の人気: 1〜5人気が多い (5以上は1件のみ)
 *    → 必ずしも1番人気が軸ではなく、自分の本命を設定する
 *  - 相手の枚数: 4〜6頭 (手広く流す)
 *  - 購入点数: 5〜15点
 *  - 的中実績: 3連複で20,850円払戻の大穴あり, 馬連で3,030円, ワイドで4,450円
 */

let currentData = null;

// ====================================================
// USER DNA: CSVデータを分析して組み込んだルール
// ====================================================
const DNA = {
    // あなたが実際に使う券種と配分 (CSVより。単勝は使わない)
    bet_types: [
        { type: "3連複", method: "1頭軸流し", icon: "🎯", ratio: 0.45 },
        { type: "馬連", method: "1頭軸流し", icon: "🏇", ratio: 0.30 },
        { type: "馬単", method: "1頭軸流し", icon: "⚡", ratio: 0.25 },
    ],
    // 相手の枚数 (CSVより: 4〜6頭が多い)
    aite_count: 5,
    // 軸の人気帯 (CSVより: 1〜5人気が大半)
    strong_jiku_pops: [1, 2, 3, 4, 5],
    // 実力指数の重み (人気だけでなく実力を見る)
    ability_weight: 2.2,
};


function formatPrice(val) { return `¥${Number(val || 0).toLocaleString()}`; }

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function showErrorInUI(msg) {
    const c = document.getElementById('bet-cards-container');
    if (c) c.innerHTML = `<div style="padding:2rem; color:#f85149; text-align:center; border:1px solid #f85149; border-radius:16px;">⚠️ ${msg}</div>`;
}

// ====================================================
// AI予測エンジン (V13)
// ====================================================
function buildAIPredictions(horses, dbProfile) {
    if (!horses || horses.length === 0) return { scored: [], honmei: null };

    const scored = horses.map(h => {
        const item = {
            number: Number(h.number),
            name: h.name || `馬#${h.number}`,
            odds: parseFloat(h.odds) || 99,
            popularity: parseInt(h.popularity) || 99,
            ability: h.ability || { max: 0, avg: 0, last: 0 }
        };

        // A. 妙味スコア (オッズ ÷ 期待配当)
        const baseLine = [0, 2.7, 4.8, 7.5, 11.0, 16.0, 24.0, 32.0, 48.0, 65.0];
        const expected = baseLine[item.popularity] || (item.popularity * 8);
        item.value_score = item.odds / expected;

        // B. 実力スコア (タイム指数ベース)
        const av = Math.max(item.ability.avg, item.ability.max * 0.7, item.ability.last * 0.9);
        item.ability_score = av > 0 ? Math.pow(av / 92, 1.5) : 0.88;

        // C. 軸としての適性 (CSVが示す「あなたの好む人気帯」)
        item.jiku_bonus = DNA.strong_jiku_pops.includes(item.popularity) ? 1.3 : 1.0;

        // D. DBプロファイルから追加ボーナス
        item.db_bonus = 1.0;
        if (dbProfile && dbProfile.strong_pops) {
            if (dbProfile.strong_pops.map(Number).includes(item.popularity)) item.db_bonus = 1.2;
        }

        // E. 1番人気が短すぎる場合ペナルティ
        let stability = 15 / (item.popularity + 0.3);
        if (item.popularity === 1 && item.odds < 2.5) stability *= 0.4;

        // 総合スコア
        const variance = 0.93 + Math.random() * 0.14;
        item.ai_score = stability
            * item.value_score
            * (item.ability_score * DNA.ability_weight)
            * item.jiku_bonus
            * item.db_bonus
            * variance;

        return item;
    });

    scored.sort((a, b) => b.ai_score - a.ai_score);

    // 本命: スコア1位
    const honmei = scored[0];

    // 相手候補: 本命を除いてスコア順に最大6頭
    const aite_pool = scored.filter(h => h.number !== honmei.number);

    return { scored, honmei, aite_pool };
}

// ====================================================
// 買い目生成 (V13 - CSVのロジックに従う)
// ====================================================
function generateBets(honmei, aite_pool, userBudget) {
    const bets = [];

    DNA.bet_types.forEach(bt => {
        // 券種別に相手の枚数を調整
        let aiteCount = DNA.aite_count;
        if (bt.type === "3連複") aiteCount = 5; // 3連複は1頭軸で5頭
        if (bt.type === "馬連") aiteCount = 5; // 馬連は1頭軸で5頭
        if (bt.type === "馬単") aiteCount = 5; // 馬単は1頭軸で5頭

        // 相手リスト: 本命を除いた上位n頭 (重複なし)
        const aite = aite_pool.slice(0, aiteCount);

        const points = aite.length || 1;
        const perPoint = Math.floor((userBudget * bt.ratio) / points / 100) * 100 || 100;
        const total = perPoint * points;

        bets.push({
            type: bt.type,
            method: bt.method,
            icon: bt.icon,
            jiku: [honmei],
            aite: aite,
            points,
            perPoint,
            total,
        });
    });

    return bets;
}

// ====================================================
// UI描画
// ====================================================
function renderApp(data) {
    const container = document.getElementById('bet-cards-container');
    const raceContainer = document.getElementById('race-info-container');
    const template = document.getElementById('bet-card-template');

    if (!container || !template) return;
    container.innerHTML = '';

    const { scored, honmei, aite_pool } = data.predictions;
    if (!honmei) return;

    if (raceContainer) {
        raceContainer.innerHTML = `
            <h2 style="font-size:1.5rem; font-weight:900; color:#fff;">${data.race_info.name}</h2>
            <div style="font-size:0.7rem; color:#ffeb3b; font-weight:700; letter-spacing:1px;">🧬 DNA V13 | 3連複・馬連・馬単 実績ベース</div>
        `;
    }

    const userBudget = parseInt(document.getElementById('user-budget')?.value) || 10000;
    safeSetText('total-budget', formatPrice(userBudget));

    const bets = generateBets(honmei, aite_pool, userBudget);
    let grandTotal = 0;

    bets.forEach(bet => {
        const clone = template.content.cloneNode(true);
        const el = (cls) => clone.querySelector(cls);

        el('.badge').textContent = bet.icon;
        el('.card-title').textContent = `${bet.type} (${bet.method})`;

        const jikuMatch = honmei.jiku_bonus > 1.0;
        el('.card-reasoning').innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.7rem; color:#8b949e;">あなたの過去実績に基づいた推奨</span>
                <span style="color:${jikuMatch ? '#ffeb3b' : '#fff'}; font-weight:900; font-size:0.85rem;">${jikuMatch ? '🔥 DNA合致' : '◎ 推奨'}</span>
            </div>
            <p style="font-size:0.7rem; color:#ccc;">
                軸: <b>${honmei.name}</b> (${honmei.popularity}人気 / ${honmei.odds}倍)<br>
                実力指数スコア: ${honmei.ability_score.toFixed(2)}
            </p>
        `;

        el('.bet-details').innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="width:30px; font-size:0.7rem; color:#8b949e;">軸</span>
                    <div class="horse-tag honmei" style="flex:1; padding:8px 12px;">
                        <b>${honmei.number}</b> ${honmei.name}
                        <small style="font-size:0.6rem; opacity:0.7; margin-left:5px;">${honmei.popularity}人</small>
                    </div>
                </div>
                <div style="display:flex; align-items:flex-start; gap:8px;">
                    <span style="width:30px; font-size:0.7rem; color:#8b949e; padding-top:5px;">相手</span>
                    <div style="flex:1; display:flex; flex-wrap:wrap; gap:4px;">
                        ${bet.aite.map(h =>
            `<span class="horse-tag" style="padding:5px 10px; background:#21262d; border-color:#444; font-size:0.8rem;">
                                <b>${h.number}</b> ${h.name}
                            </span>`
        ).join('')}
                    </div>
                </div>
            </div>
        `;

        el('.price-calc').textContent = `@${bet.perPoint.toLocaleString()} × ${bet.points}点`;
        el('.price-total').textContent = formatPrice(bet.total);

        el('.save-btn').addEventListener('click', (e) => saveBet(e.target, bet));
        grandTotal += bet.total;
        container.appendChild(clone);
    });

    safeSetText('final-total', formatPrice(grandTotal));

    // 詳細テーブル
    const tableDiv = document.createElement('div');
    tableDiv.style = "margin:1.5rem 1rem; padding-bottom:6rem;";
    tableDiv.innerHTML = `
        <h3 style="font-size:0.9rem; color:#d4af37; margin-bottom:12px; border-left:4px solid #d4af37; padding-left:10px;">
            📊 AI解析 (実力+あなたのDNA)
        </h3>
        <div style="border-radius:12px; overflow:hidden; background:#161b22; border:1px solid #333;">
            <table style="width:100%; font-size:0.75rem; border-collapse:collapse;">
                <thead style="background:#21262d; color:#8b949e;">
                    <tr>
                        <th style="padding:10px;">馬名</th>
                        <th style="padding:10px;">人気</th>
                        <th style="padding:10px;">実力S</th>
                        <th style="padding:10px;">DNA</th>
                        <th style="padding:10px;">AI点</th>
                    </tr>
                </thead>
                <tbody>
                    ${scored.map((h, i) => `
                        <tr style="border-bottom:1px solid #21262d; background:${h.number === honmei.number ? 'rgba(212,175,55,0.1)' : 'transparent'};">
                            <td style="padding:10px; font-weight:bold; color:${h.number === honmei.number ? '#d4af37' : '#fff'};">
                                ${h.number} ${h.name}
                            </td>
                            <td style="padding:10px; text-align:center;">${h.popularity}</td>
                            <td style="padding:10px; color:${h.ability_score > 1.0 ? '#3fb950' : '#fff'};">${h.ability_score.toFixed(2)}</td>
                            <td style="padding:10px; text-align:center;">${h.jiku_bonus > 1.0 ? '🔥' : '-'}</td>
                            <td style="padding:10px; font-weight:900; color:${h.number === honmei.number ? '#d4af37' : '#fff'};">${h.ai_score.toFixed(1)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <p style="font-size:0.65rem; color:#8b949e; margin-top:10px; text-align:center;">
            🔥 = あなたのCSV実績で的中率の高い人気帯 (1〜5人気)
        </p>
    `;
    container.appendChild(tableDiv);
}

// ====================================================
// 通信
// ====================================================
async function saveBet(btn, bet) {
    if (!currentData || !btn) return;
    btn.disabled = true;
    btn.textContent = '...';
    try {
        const res = await fetch('/api/save_bet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                race_id: currentData.race_info.id,
                race_name: currentData.race_info.name,
                bet_type: bet.type,
                bet_method: bet.method,
                points: bet.points,
                amount: bet.total,
                jiku_horses: bet.jiku.map(h => h.number).join(','),
                aite_horses: bet.aite.map(h => h.number).join(','),
                jiku_names: bet.jiku.map(h => h.name).join(','),
                aite_names: bet.aite.map(h => h.name).join(','),
                jiku_pops: bet.jiku.map(h => h.popularity).join(','),
                aite_pops: bet.aite.map(h => h.popularity).join(','),
                jiku_odds: bet.jiku.map(h => h.odds).join(','),
                aite_odds: bet.aite.map(h => h.odds).join(','),
            })
        });
        if (res.ok) { btn.textContent = '済'; btn.style.background = '#3fb950'; }
    } catch (e) { btn.disabled = false; btn.textContent = 'Err'; }
}

async function fetchAnalysis() {
    const urlEl = document.getElementById('netkeiba-url');
    if (!urlEl) return;
    const url = urlEl.value.trim();
    const match = url.match(/race_id=(\d{12})/) || url.match(/race\/(\d{12})/);
    if (!match) { showErrorInUI("netkeibaのURLを入力してください"); return; }

    const btn = document.getElementById('fetch-odds-btn');
    if (btn) { btn.disabled = true; btn.textContent = '解析中'; }

    try {
        const [profRes, scrapRes] = await Promise.all([
            fetch('/api/user_profile').catch(() => null),
            fetch(`/api/scrape?race_id=${match[1]}`)
        ]);

        const prof = profRes ? (await profRes.json()).profile : null;
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
        } else {
            showErrorInUI("データ取得失敗");
        }
    } catch (e) {
        showErrorInUI(e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '解析'; }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fetch-odds-btn')?.addEventListener('click', fetchAnalysis);
    document.getElementById('user-budget')?.addEventListener('change', () => {
        if (currentData) renderApp(currentData);
    });
});

console.log("App V13 — Real DNA from CSV — Active.");
