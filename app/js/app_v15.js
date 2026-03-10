/**
 * app_v15.js
 * AI買い目ジェネレーター (V15: AGENT MANAGER)
 *
 * V15の設計方針:
 * - ロジックをバックエンドの Agent Manager に完全移行
 * - フロントエンドは表示と通信に専念
 */

let currentData = null;

const fmt = (v) => `¥${Number(v || 0).toLocaleString()}`;
function safeEl(id) { return document.getElementById(id); }

function showError(msg) {
    const c = safeEl('bet-cards-container');
    if (c) c.innerHTML = `<div style="padding:2rem;color:#f85149;text-align:center;border:1px solid #f85149;border-radius:12px;">⚠️ ${msg}</div>`;
}

function renderApp(data) {
    const container = safeEl('bet-cards-container');
    const template = safeEl('bet-card-template');
    const raceInfo = safeEl('race-info-container');

    if (!container || !template) return;
    container.innerHTML = '';

    const { scored, condition, bets } = data.predictions;
    if (!scored || scored.length === 0) return;

    if (raceInfo) {
        raceInfo.innerHTML = `
            <div style="font-size:1.2rem; font-weight:900; color:#fff;">${data.race_name}</div>
            <div style="font-size:0.65rem; color:#ffeb3b; margin-top:2px;">
                ${condition.isClearFavorite ? '⚡ 本命突出型' : '⚖️ 接戦型'} | 
                ${condition.isLowOdds ? '🔒 低配当' : '💰 配当あり'}
            </div>
        `;
    }

    let grand = 0;
    bets.forEach(bet => {
        const clone = template.content.cloneNode(true);
        const qs = (cls) => clone.querySelector(cls);

        qs('.badge').textContent = bet.icon;
        qs('.card-title').textContent = `${bet.type}（${bet.method}）`;
        qs('.card-reasoning').innerHTML = `<p style="font-size:0.72rem; color:#ccc; margin:0; line-height:1.6;">💡 ${bet.reason}</p>`;

        let detailHTML = '';
        if (bet.isBOX) {
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
    const budget = parseInt(safeEl('user-budget')?.value) || 10000;
    const tb = safeEl('total-budget');
    if (tb) tb.textContent = fmt(budget);

    // スコア詳細テーブル
    const tbl = document.createElement('div');
    tbl.style = "margin:1.5rem 1rem; padding-bottom:6rem;";
    tbl.innerHTML = `
        <h3 style="font-size:0.85rem; color:#d4af37; border-left:4px solid #d4af37; padding-left:8px; margin-bottom:10px;">📊 AIスコア詳細 (Agent評価)</h3>
        <div style="border-radius:12px; overflow:hidden; background:#161b22; border:1px solid #333;">
            <table style="width:100%;font-size:0.72rem;border-collapse:collapse;">
                <thead style="background:#21262d;color:#8b949e;">
                    <tr>
                        <th style="padding:9px 10px; text-align:left;">馬名</th>
                        <th style="padding:9px 6px;">人/倍</th>
                        <th style="padding:9px 6px;">妙味</th>
                        <th style="padding:9px 6px;">実力</th>
                        <th style="padding:9px 6px;">DNA</th>
                        <th style="padding:9px 6px;">総合</th>
                    </tr>
                </thead>
                <tbody>
                    ${scored.map((h, i) => `
                        <tr style="border-bottom:1px solid #21262d; background:${i === 0 ? 'rgba(212,175,55,0.08)' : 'transparent'}">
                            <td style="padding:9px 10px; font-weight:${i < 3 ? '900' : '400'}; color:${i === 0 ? '#d4af37' : i < 3 ? '#fff' : '#c9d1d9'};">${h.number} ${h.name}</td>
                            <td style="padding:9px 6px; text-align:center; color:#8b949e;">${h.popularity}/${h.odds}</td>
                            <td style="padding:9px 6px; text-align:center; color:${h.value > 1.2 ? '#3fb950' : h.value < 0.8 ? '#f85149' : '#fff'};">${h.value.toFixed(2)}</td>
                            <td style="padding:9px 6px; text-align:center; color:${h.ability_score > 1.0 ? '#58a6ff' : '#fff'};">${h.ability_score.toFixed(2)}</td>
                            <td style="padding:9px 6px; text-align:center;">${h.jiku_bonus > 1.0 || h.db_bonus > 1.0 ? '🔥' : '-'}</td>
                            <td style="padding:9px 6px; text-align:center; font-weight:900; color:${i === 0 ? '#d4af37' : '#fff'};">${h.score.toFixed(1)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <p style="font-size:0.62rem; color:#8b949e; margin-top:8px; text-align:center;">
            🔥 = ユーザーマッチ (過去の的中履歴+戦術DNAからの合致)
        </p>
    `;
    container.appendChild(tbl);
}

async function saveBet(btn, bet) {
    if (!currentData || !btn) return;
    btn.disabled = true; btn.textContent = '...';
    try {
        const res = await fetch('/api/save_bet', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                race_id: currentData.race_id,
                race_name: currentData.race_name,
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

    const budget = parseInt(safeEl('user-budget')?.value) || 10000;
    const btn = safeEl('fetch-odds-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Agentが思考中...'; }

    const container = safeEl('bet-cards-container');
    if (container) container.innerHTML = `<div style="text-align:center; padding:4rem; color:#8b949e;"><div style="font-size:2rem; margin-bottom:10px;">🧠</div><p>Agent Managerが全馬を分析中...<br>最適な戦略を構築しています</p></div>`;

    try {
        const res = await fetch(`/api/predict?race_id=${match[1]}&budget=${budget}`);
        const data = await res.json();
        if (data.success) {
            currentData = data;
            renderApp(data);
        } else {
            showError("データ取得に失敗しました");
        }
    } catch (e) { showError(e.message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '解析'; } }
}

document.addEventListener('DOMContentLoaded', () => {
    safeEl('fetch-odds-btn')?.addEventListener('click', fetchAnalysis);
    safeEl('user-budget')?.addEventListener('change', fetchAnalysis); // 予算変更で再計算(バックエンド呼び出し)
});

console.log("App V15 — Agent Manager System — Active.");
