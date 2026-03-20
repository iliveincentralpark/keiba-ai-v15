/**
 * app_v15.js
 * AI買い目ジェネレーター (V16: 本命/対抗/穴馬パネル + 4券種 + おすすめ順)
 */

let currentData = null;

const fmt = (v) => `¥${Number(v || 0).toLocaleString()}`;
function safeEl(id) { return document.getElementById(id); }

function formatProfileSummary(profile) {
    if (!profile) {
        return '履歴データ未読込。simulation画面からCSVを追加できます。';
    }
    const strategies = (profile.preferred_strategies || [])
        .map(item => `${item.bet_type} ${item.bet_method}`)
        .join(' / ');
    const pops = (profile.strong_pops || []).length > 0
        ? `${profile.strong_pops.join(',')}人気`
        : '人気帯は学習中';
    return `履歴 ${profile.total_records}件学習済み | 得意型: ${strategies || '集計中'} | 軸人気傾向: ${pops}`;
}

async function loadProfileStatus() {
    const el = safeEl('profile-status');
    if (!el) return;
    el.textContent = '履歴データを確認中...';
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.success) {
            el.textContent = formatProfileSummary(data.profile);
        } else {
            el.textContent = '履歴データの確認に失敗しました。';
        }
    } catch (e) {
        el.textContent = '履歴データの確認に失敗しました。';
    }
}

function showError(msg) {
    const c = safeEl('bet-cards-container');
    if (c) c.innerHTML = `<div style="padding:2rem;color:#f85149;text-align:center;border:1px solid #f85149;border-radius:12px;">⚠️ ${msg}</div>`;
}

/** ── ①本命・対抗・穴馬ピックアップパネル ── */
function renderHorseRoles(horse_roles) {
    if (!horse_roles) return '';

    const { honmei, taikou, ana } = horse_roles;

    const roleCard = (label, color, bgColor, emoji, horses) => {
        if (!horses || (Array.isArray(horses) ? horses.length === 0 : !horses)) return '';
        const list = Array.isArray(horses) ? horses : [horses];
        const items = list.map(h =>
            `<span style="background:${bgColor}; border:1px solid ${color}; color:#fff;
                          border-radius:8px; padding:5px 10px; font-size:0.78rem; font-weight:700; white-space:nowrap;">
                ${h.number}. ${h.name} <small style="opacity:0.75;">${h.popularity}人/${h.odds}倍</small>
            </span>`
        ).join('');
        return `
            <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:10px;">
                <span style="background:${color}; color:#000; border-radius:6px; padding:3px 8px;
                              font-size:0.72rem; font-weight:900; white-space:nowrap; flex-shrink:0;">
                    ${emoji} ${label}
                </span>
                <div style="display:flex; flex-wrap:wrap; gap:5px;">${items}</div>
            </div>`;
    };

    const anaSection = ana && ana.length > 0
        ? roleCard('穴馬', '#ff9800', 'rgba(255,152,0,0.15)', '🎲', ana)
        : '<div style="font-size:0.7rem;color:#555;margin-bottom:10px;">🎲 穴馬候補なし（荒れにくいレース）</div>';

    return `
        <div style="margin:0 1rem 1.2rem; padding:14px 16px; background:#0d1117;
                    border:1px solid #30363d; border-radius:14px;">
            <h3 style="font-size:0.82rem; color:#d4af37; margin:0 0 12px;
                        border-left:3px solid #d4af37; padding-left:8px;">
                🐎 AI馬評価ピックアップ
            </h3>
            ${roleCard('本命', '#d4af37', 'rgba(212,175,55,0.15)', '◎', honmei)}
            ${roleCard('対抗', '#58a6ff', 'rgba(88,166,255,0.12)', '○', taikou)}
            ${anaSection}
        </div>`;
}

/** ── ②買い目カード群のレンダリング ── */
function renderApp(data) {
    const container = safeEl('bet-cards-container');
    const template = safeEl('bet-card-template');
    const raceInfo = safeEl('race-info-container');

    if (!container || !template) return;
    container.innerHTML = '';

    const { scored, condition, bets, horse_roles } = data.predictions;
    if (!scored || scored.length === 0) return;

    if (raceInfo) {
        raceInfo.innerHTML = `
            <div style="font-size:1.2rem; font-weight:900; color:#fff;">${data.race_name}</div>
            <div style="font-size:0.65rem; color:#ffeb3b; margin-top:2px;">
                ${condition.isClearFavorite ? '⚡ 本命突出型' : '⚖️ 接戦型'} | 
                ${condition.isLowOdds ? '🔒 低配当' : '💰 配当あり'} |
                ${condition.hasUpsetCandidate ? '🎲 穴馬あり' : '🛡️ 堅め'}
            </div>
        `;
    }

    // 本命・対抗・穴馬パネルを先頭に挿入
    const rolesHTML = renderHorseRoles(horse_roles);
    if (rolesHTML) {
        const rolesDiv = document.createElement('div');
        rolesDiv.innerHTML = rolesHTML;
        container.appendChild(rolesDiv);
    }

    // おすすめ順ラベルのスタイルマップ
    const priorityColors = {
        '◎推奨':  { bg: '#d4af37', color: '#000' },
        '○安定':  { bg: '#3fb950', color: '#000' },
        '○穴狙い':{ bg: '#ff9800', color: '#000' },
        '○配当':  { bg: '#f05133', color: '#fff' },
        '△妙味':  { bg: '#58a6ff', color: '#000' },
        '△安定':  { bg: '#3fb950', color: '#000' },
        '△押さえ':{ bg: '#8b949e', color: '#000' },
        '△配当':  { bg: '#f05133', color: '#fff' },
        '☆配当':  { bg: '#9c27b0', color: '#fff' },
        '☆妙味':  { bg: '#58a6ff', color: '#000' },
        '☆押さえ':{ bg: '#8b949e', color: '#000' },
        '☆安定':  { bg: '#3fb950', color: '#000' },
    };

    let grand = 0;
    bets.forEach(bet => {
        const clone = template.content.cloneNode(true);
        const qs = (cls) => clone.querySelector(cls);

        // おすすめ順バッジ付きタイトル
        const plabel = bet.priority_label || '';
        const pStyle = priorityColors[plabel] || { bg: '#8b949e', color: '#000' };
        const priorityBadge = plabel
            ? `<span style="background:${pStyle.bg}; color:${pStyle.color}; font-size:0.65rem;
                            font-weight:900; padding:2px 7px; border-radius:5px; margin-right:6px;
                            vertical-align:middle;">${plabel}</span>`
            : '';

        qs('.badge').textContent = bet.icon;
        qs('.card-title').innerHTML = `${priorityBadge}${bet.type}（${bet.method}）`;
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
                    ${bet.jiku && bet.jiku.length > 0 ? `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="width:30px; font-size:0.65rem; color:#8b949e;">${bet.jiku.length === 2 ? '2軸' : '軸'}</span>
                        <div style="flex:1; display:flex; gap:5px; flex-wrap:wrap;">
                            ${bet.jiku.map(h => `<div class="horse-tag honmei" style="padding:6px 12px;"><b>${h.number}</b> ${h.name} <small style="opacity:0.7;">${h.popularity}人</small></div>`).join('')}
                        </div>
                    </div>` : ''}
                    <div style="display:flex; align-items:flex-start; gap:8px;">
                        <span style="width:30px; font-size:0.65rem; color:#8b949e; margin-top:5px;">相手</span>
                        <div style="flex:1; display:flex; flex-wrap:wrap; gap:4px;">
                            ${bet.aite.map(h => {
                                const isUpset = (h.upset_score || 0) > 0.5;
                                return `<span class="horse-tag" style="background:${isUpset ? 'rgba(255,152,0,0.15)' : '#21262d'};
                                    border-color:${isUpset ? '#ff9800' : '#444'}; font-size:0.8rem;">
                                    <b>${h.number}</b> ${h.name}${isUpset ? ' 🎲' : ''}
                                </span>`;
                            }).join('')}
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
        <h3 style="font-size:0.85rem; color:#d4af37; border-left:4px solid #d4af37; padding-left:8px; margin-bottom:10px;">📊 AIスコア詳細 (V16評価)</h3>
        <div style="border-radius:12px; overflow:hidden; background:#161b22; border:1px solid #333;">
            <table style="width:100%;font-size:0.72rem;border-collapse:collapse;">
                <thead style="background:#21262d;color:#8b949e;">
                    <tr>
                        <th style="padding:9px 10px; text-align:left;">馬名</th>
                        <th style="padding:9px 6px;">人/倍</th>
                        <th style="padding:9px 6px;">妙味</th>
                        <th style="padding:9px 6px;">実力</th>
                        <th style="padding:9px 6px;">DNA</th>
                        <th style="padding:9px 6px;">穴</th>
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
                            <td style="padding:9px 6px; text-align:center; color:${h.ability_score > 1.0 ? '#58a6ff' : '#fff'};">
                                ${h.ability_score.toFixed(2)}
                                <span style="font-size:0.58rem; color:#666; display:block;">
                                    ${h.ability_source === 'recent' ? '📊近走' : h.ability_source === 'time_index' ? '📈指数' : '❓不明'}
                                </span>
                            </td>
                            <td style="padding:9px 6px; text-align:center;">${h.jiku_bonus > 1.0 || h.db_bonus > 1.0 ? '🔥' : '-'}</td>
                            <td style="padding:9px 6px; text-align:center;">${(h.upset_score || 0) > 0.5 ? '🎲' : '-'}</td>
                            <td style="padding:9px 6px; text-align:center; font-weight:900; color:${i === 0 ? '#d4af37' : '#fff'};">${h.score.toFixed(1)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <p style="font-size:0.62rem; color:#8b949e; margin-top:8px; text-align:center;">
            🔥 = ユーザーDNA一致 ／ 🎲 = 穴馬候補（妙味高×低人気）
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
    const urlValue = urlEl.value.trim();
    const match = urlValue.match(/race_id=(\d{12})/) || urlValue.match(/race\/(\d{12})/) || urlValue.match(/(\d{12})/);
    if (!match) { showError("netkeibaのURLまたは12桁のレースIDを入力してください"); return; }

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
    loadProfileStatus();
    safeEl('fetch-odds-btn')?.addEventListener('click', fetchAnalysis);
    safeEl('user-budget')?.addEventListener('change', fetchAnalysis);
});

console.log("App V16 — 本命/対抗/穴馬 + 4券種 + おすすめ順 — Active.");
