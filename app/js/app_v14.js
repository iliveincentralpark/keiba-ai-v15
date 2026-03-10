/**
 * app_v14.js
 * AI買い目ジェネレーター (V14: INTELLIGENT STRATEGY)
 *
 * V14の設計方針:
 * - 各買い目の軸・相手・券種をAIが独立して思考する
 * - 全部同じ軸・相手にならないよう、戦略に多様性を持たせる
 * - CSVから学んだ券種(3連複・馬連・馬単・ワイド・3連単)を状況で使い分ける
 * - 相手馬も券種ごとに異なる組み合わせを提案
 */

let currentData = null;

// ============================================================
// ユーティリティ
// ============================================================
const fmt = (v) => `¥${Number(v || 0).toLocaleString()}`;

function safeEl(id) { return document.getElementById(id); }

function showError(msg) {
    const c = safeEl('bet-cards-container');
    if (c) c.innerHTML = `<div style="padding:2rem;color:#f85149;text-align:center;border:1px solid #f85149;border-radius:12px;">⚠️ ${msg}</div>`;
}

// ============================================================
// ステップ1: 全頭スコアリング (V14版)
// ============================================================
function scoreAllHorses(horses) {
    const scored = horses.map(h => {
        const item = {
            number: Number(h.number),
            name: h.name || `馬#${h.number}`,
            odds: parseFloat(h.odds) || 99,
            popularity: parseInt(h.popularity) || 99,
            ability: h.ability || { max: 0, avg: 0, last: 0 }
        };

        // 1. 妙味 (Value)
        const base = [0, 2.7, 4.8, 7.5, 11, 16, 24, 32, 48, 65];
        const exp = base[item.popularity] || item.popularity * 8;
        item.value = item.odds / exp;

        // 2. 実力 (タイム指数ベース)
        const av = Math.max(item.ability.avg, item.ability.max * 0.7, item.ability.last * 0.9);
        item.ability_score = av > 0 ? Math.pow(av / 92, 1.5) : 0.88;

        // 3. 安定度
        item.stability = 15 / (item.popularity + 0.3);

        // 4. 1番人気が過剰な場合ペナルティ
        if (item.popularity === 1 && item.odds < 2.5) item.stability *= 0.35;

        // 5. 最終スコア
        const r = 0.9 + Math.random() * 0.2;
        item.score = item.stability * item.value * item.ability_score * 2.0 * r;

        return item;
    });

    return scored.sort((a, b) => b.score - a.score);
}

// ============================================================
// ステップ2: AIが状況を分析して戦略を決定
// ============================================================
function analyzeRaceCondition(scored) {
    const top3 = scored.slice(0, 3);
    const scoreGap = (scored[0].score - scored[1].score) / scored[0].score; // トップとの差
    const topOdds = scored[0].odds;
    const topPop = scored[0].popularity;

    // 条件判定
    const isClearFavorite = scoreGap > 0.15; // 1頭が突出
    const isLowOdds = topOdds < 3.0;          // 本命が低配当
    const isMediumField = scored.length >= 10; // 出走頭数

    return { isClearFavorite, isLowOdds, isMediumField, scoreGap, topOdds, topPop };
}

// ============================================================
// ステップ3: 戦略に基づいて多様な買い目を生成
// ============================================================
function buildStrategicBets(scored, condition, budget) {
    const bets = [];
    const [s0, s1, s2, s3, s4, s5] = scored; // スコア順の馬

    // ---- 戦略1: メイン本命軸 (3連複 1頭軸) ----
    // 軸: AIスコア1位
    // 相手: スコア2〜6位の中から「妙味が高い」順5頭
    {
        const jiku = s0;
        const aiPool = scored.filter(h => h.number !== jiku.number);
        // 妙味でソートして相手を決める (純粋なスコアと少し違う視点)
        const aite = aiPool.sort((a, b) => b.value - a.value).slice(0, 5);
        bets.push({
            type: "3連複", method: "1頭軸 (本命流し)", icon: "🎯",
            reason: `${jiku.name}を軸に妙味上位5頭に流す。実力指数と期待値のバランスが最も高い組み合わせ。`,
            jiku: [jiku], aite, ratio: 0.40
        });
    }

    // ---- 戦略2: 2番手軸で穴を狙う (馬連) ----
    // 軸: スコア2位 or 妙味が最も高い馬 (1位とは別の視点)
    {
        // 妙味ランキングで1位を選ぶ（スコアトップと異なる馬になることが多い）
        const valueRanked = [...scored].sort((a, b) => b.value - a.value);
        const jiku = valueRanked[0].number === s0.number ? valueRanked[1] : valueRanked[0];
        const aite = scored.filter(h => h.number !== jiku.number)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
        bets.push({
            type: "馬連", method: "1頭軸 (妙味軸)", icon: "🏇",
            reason: `妙味指数${jiku.value.toFixed(2)}の${jiku.name}(${jiku.popularity}人気)を軸に据え、安定上位5頭に流す。過去実績でも馬連は高回収率。`,
            jiku: [jiku], aite, ratio: 0.30
        });
    }

    // ---- 戦略3: 状況に応じた柔軟な券種 ----
    if (condition.isClearFavorite && !condition.isLowOdds) {
        // 本命が明確 かつ オッズがつく → 馬単で一発狙い
        const jiku = s0;
        const aite = scored.filter(h => h.number !== jiku.number).slice(0, 5);
        bets.push({
            type: "馬単", method: "1頭軸 (本命食い)", icon: "⚡",
            reason: `AIスコア差${(condition.scoreGap * 100).toFixed(0)}%で${jiku.name}が頭で安定。馬単で2着に${aite.length}頭流し。配当アップを狙う強気戦略。`,
            jiku: [jiku], aite, ratio: 0.30
        });
    } else if (condition.isLowOdds) {
        // 本命が低配当 → 1番人気を相手に使ってワイドBOX
        const boxHorses = scored.slice(1, 5); // 2〜5位でBOX
        bets.push({
            type: "ワイド", method: "BOX (番狂わせ)", icon: "🛡️",
            reason: `${s0.name}が低オッズ(${s0.odds}倍)で妙味が薄い。2〜5番手でBOXを組み、本命除外で高配当を狙う穴戦略。`,
            jiku: [], aite: boxHorses, isBOX: true, ratio: 0.30
        });
    } else {
        // 接戦 → 3連複2頭軸で絞り込み
        const jiku2 = [s0, s1];
        const aite = scored.filter(h => h.number !== s0.number && h.number !== s1.number).slice(0, 4);
        bets.push({
            type: "3連複", method: "2頭軸 (絞り込み)", icon: "🎰",
            reason: `上位2頭 ${s0.name}+${s1.name} の2頭軸。スコア差が小さいため両方を軸に固定して点数を絞る効率戦略。`,
            jiku: jiku2, aite, ratio: 0.30
        });
    }

    // 予算配分と点数計算
    return bets.map(bet => {
        const pts = bet.isBOX
            ? (bet.aite.length * (bet.aite.length - 1)) / 2  // BOXの点数
            : Math.max(bet.aite.length, 1);
        const per = Math.max(100, Math.floor((budget * bet.ratio) / pts / 100) * 100);
        const total = per * pts;
        return { ...bet, points: pts, perPoint: per, total };
    });
}

// ============================================================
// ステップ4: UI描画
// ============================================================
function renderApp(data) {
    const container = safeEl('bet-cards-container');
    const template = safeEl('bet-card-template');
    const raceInfo = safeEl('race-info-container');

    if (!container || !template) return;
    container.innerHTML = '';

    const { scored, condition, bets: stratBets } = data.predictions;
    if (!scored || scored.length === 0) return;

    if (raceInfo) {
        raceInfo.innerHTML = `
            <div style="font-size:1.2rem; font-weight:900; color:#fff;">${data.race_info.name}</div>
            <div style="font-size:0.65rem; color:#ffeb3b; margin-top:2px;">
                ${condition.isClearFavorite ? '⚡ 本命突出型' : '⚖️ 接戦型'} | 
                ${condition.isLowOdds ? '🔒 低配当' : '💰 配当あり'}
            </div>
        `;
    }

    const budget = parseInt(safeEl('user-budget')?.value) || 10000;
    const bets = buildStrategicBets(scored, condition, budget);
    let grand = 0;

    bets.forEach(bet => {
        const clone = template.content.cloneNode(true);
        const qs = (cls) => clone.querySelector(cls);

        qs('.badge').textContent = bet.icon;
        qs('.card-title').textContent = `${bet.type}（${bet.method}）`;
        qs('.card-reasoning').innerHTML = `<p style="font-size:0.72rem; color:#ccc; margin:0; line-height:1.6;">💡 ${bet.reason}</p>`;

        // 買い目の表示
        let detailHTML = '';
        if (bet.isBOX) {
            // BOX買い
            detailHTML = `
                <div style="font-size:0.7rem; color:#8b949e; margin-bottom:5px;">BOX選択馬</div>
                <div style="display:flex; flex-wrap:wrap; gap:5px;">
                    ${bet.aite.map(h => `
                        <span class="horse-tag" style="background:#21262d; border-color:#444;">
                            <b>${h.number}</b> ${h.name} <small>(${h.popularity}人)</small>
                        </span>`).join('')}
                </div>`;
        } else {
            detailHTML = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="width:30px; font-size:0.65rem; color:#8b949e;">${bet.jiku.length === 2 ? '2軸' : '軸'}</span>
                        <div style="flex:1; display:flex; gap:5px; flex-wrap:wrap;">
                            ${bet.jiku.map(h => `<div class="horse-tag honmei" style="padding:6px 12px;"><b>${h.number}</b> ${h.name} <small style="opacity:0.7;">${h.popularity}人</small></div>`).join('')}
                        </div>
                    </div>
                    <div style="display:flex; align-items:flex-start; gap:8px;">
                        <span style="width:30px; font-size:0.65rem; color:#8b949e; margin-top:5px;">相手</span>
                        <div style="flex:1; display:flex; flex-wrap:wrap; gap:4px;">
                            ${bet.aite.map(h => `<span class="horse-tag" style="background:#21262d; border-color:#444; font-size:0.8rem;"><b>${h.number}</b> ${h.name}</span>`).join('')}
                        </div>
                    </div>
                </div>`;
        }
        qs('.bet-details').innerHTML = detailHTML;
        qs('.price-calc').textContent = `@${bet.perPoint.toLocaleString()} × ${bet.points}点`;
        qs('.price-total').textContent = fmt(bet.total);
        qs('.save-btn').addEventListener('click', e => saveBet(e.target, bet));
        grand += bet.total;
        container.appendChild(clone);
    });

    const ft = safeEl('final-total');
    if (ft) ft.textContent = fmt(grand);
    const tb = safeEl('total-budget');
    if (tb) tb.textContent = fmt(budget);

    // スコア詳細テーブル
    const tbl = document.createElement('div');
    tbl.style = "margin:1.5rem 1rem; padding-bottom:6rem;";
    tbl.innerHTML = `
        <h3 style="font-size:0.85rem; color:#d4af37; border-left:4px solid #d4af37; padding-left:8px; margin-bottom:10px;">
            📊 AIスコア詳細 (全頭)
        </h3>
        <div style="border-radius:12px; overflow:hidden; background:#161b22; border:1px solid #333;">
            <table style="width:100%;font-size:0.72rem;border-collapse:collapse;">
                <thead style="background:#21262d;color:#8b949e;">
                    <tr>
                        <th style="padding:9px 10px; text-align:left;">馬名</th>
                        <th style="padding:9px 6px;">人/倍</th>
                        <th style="padding:9px 6px;">妙味</th>
                        <th style="padding:9px 6px;">実力</th>
                        <th style="padding:9px 6px;">総合</th>
                    </tr>
                </thead>
                <tbody>
                    ${scored.map((h, i) => `
                        <tr style="border-bottom:1px solid #21262d; background:${i === 0 ? 'rgba(212,175,55,0.08)' : 'transparent'}">
                            <td style="padding:9px 10px; font-weight:${i < 3 ? '900' : '400'}; color:${i === 0 ? '#d4af37' : i < 3 ? '#fff' : '#c9d1d9'};">
                                ${h.number} ${h.name}
                            </td>
                            <td style="padding:9px 6px; text-align:center; color:#8b949e;">${h.popularity}/${h.odds}</td>
                            <td style="padding:9px 6px; text-align:center; color:${h.value > 1.2 ? '#3fb950' : h.value < 0.8 ? '#f85149' : '#fff'};">${h.value.toFixed(2)}</td>
                            <td style="padding:9px 6px; text-align:center; color:${h.ability_score > 1.0 ? '#58a6ff' : '#fff'};">${h.ability_score.toFixed(2)}</td>
                            <td style="padding:9px 6px; text-align:center; font-weight:900; color:${i === 0 ? '#d4af37' : '#fff'};">${h.score.toFixed(1)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <p style="font-size:0.62rem; color:#8b949e; margin-top:8px; text-align:center;">
            妙味: オッズ÷期待配当 (1.0超 = 過小評価の穴馬) | 実力: タイム指数ベース
        </p>
    `;
    container.appendChild(tbl);
}

// ============================================================
// 通信
// ============================================================
async function saveBet(btn, bet) {
    if (!currentData || !btn) return;
    btn.disabled = true; btn.textContent = '...';
    try {
        const res = await fetch('/api/save_bet', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                race_id: currentData.race_info.id,
                race_name: currentData.race_info.name,
                bet_type: bet.type, bet_method: bet.method,
                points: bet.points, amount: bet.total,
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
    const urlEl = safeEl('netkeiba-url');
    if (!urlEl) return;
    const match = urlEl.value.trim().match(/race_id=(\d{12})/) || urlEl.value.trim().match(/race\/(\d{12})/);
    if (!match) { showError("netkeibaのURLを入力してください"); return; }

    const btn = safeEl('fetch-odds-btn');
    if (btn) { btn.disabled = true; btn.textContent = '解析中...'; }

    const container = safeEl('bet-cards-container');
    if (container) container.innerHTML = `
        <div style="text-align:center; padding:4rem; color:#8b949e;">
            <div style="font-size:2rem; margin-bottom:10px;">🧠</div>
            <p>AIが全馬のオッズ・実力・妙味を分析中...<br>最適な戦略を構築しています</p>
        </div>
    `;

    try {
        const [profRes, scrapRes] = await Promise.all([
            fetch('/api/user_profile').catch(() => null),
            fetch(`/api/scrape?race_id=${match[1]}`)
        ]);
        const prof = profRes ? (await profRes.json()).profile : null;
        const scrap = await scrapRes.json();

        if (scrap.success) {
            const horses = Object.keys(scrap.horses).map(num => ({ number: num, ...scrap.horses[num] }));
            const scored = scoreAllHorses(horses);
            const condition = analyzeRaceCondition(scored);

            currentData = {
                race_info: { id: scrap.race_id, name: scrap.race_name },
                predictions: { scored, condition, bets: [] },
                all_horses: horses
            };
            renderApp(currentData);
        } else {
            showError("データ取得に失敗しました");
        }
    } catch (e) { showError(e.message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '解析'; } }
}

document.addEventListener('DOMContentLoaded', () => {
    safeEl('fetch-odds-btn')?.addEventListener('click', fetchAnalysis);
    safeEl('user-budget')?.addEventListener('change', () => { if (currentData) renderApp(currentData); });
});

console.log("App V14 — Intelligent Strategy Engine — Active.");
