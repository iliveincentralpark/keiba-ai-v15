/**
 * app_v15.js (V16 — 馬評価特化モード)
 * 買い目生成を廃止し、本命・対抗・穴馬の表示に特化
 */

let currentData = null;
function safeEl(id) { return document.getElementById(id); }

/** ── プロフィールステータス ── */
function formatProfileSummary(profile) {
    if (!profile) return '履歴データ未読込（simulation画面からCSVを追加できます）';
    const pops = (profile.strong_pops || []).length > 0
        ? `軸人気傾向: ${profile.strong_pops.join(',')}人気`
        : '人気帯は学習中';
    return `履歴 ${profile.total_records}件学習済み | ${pops}`;
}

async function loadProfileStatus() {
    const el = safeEl('profile-status');
    if (!el) return;
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        el.textContent = data.success ? formatProfileSummary(data.profile) : '';
    } catch { el.textContent = ''; }
}

/** ── エラー表示 ── */
function showError(msg) {
    const c = safeEl('results-container');
    if (c) c.innerHTML = `<div style="padding:2rem;color:#f85149;text-align:center;border:1px solid #f85149;border-radius:12px;margin:1rem 0;">⚠️ ${msg}</div>`;
}

/** ── スコアをバー表示するHTML ── */
function scoreBar(label, value, maxVal, color) {
    const pct = Math.min(100, (value / maxVal) * 100).toFixed(1);
    return `
        <div class="score-bar-row">
            <span class="score-bar-label">${label}</span>
            <div class="score-bar-track">
                <div class="score-bar-fill" style="width:${pct}%; background:${color};"></div>
            </div>
            <span class="score-bar-val">${typeof value === 'number' ? value.toFixed(2) : value}</span>
        </div>`;
}


/** ── 馬カード1枚のHTML ── */
function horseCard(h, role, rank) {
    const roleMap = {
        honmei: { label: '◎ 本命',  cls: 'honmei', emoji: '🥇' },
        taikou: { label: `○ 対抗 #${rank}`, cls: 'taikou', emoji: '🥈' },
        ana:    { label: '🎲 穴馬',  cls: 'ana',    emoji: '🎯' },
    };
    const r = roleMap[role];

    // スコアのmax値（全馬の中での最大を基準にしたいが近似値で対応）
    const scoreMax = 30;
    const valueMax = 2.5;
    const abilityMax = 1.5;

    const barColors = {
        honmei: { score: '#d4af37', value: '#3fb950', ability: '#58a6ff', upset: '#ff9800' },
        taikou: { score: '#58a6ff', value: '#3fb950', ability: '#58a6ff', upset: '#ff9800' },
        ana:    { score: '#ff9800', value: '#3fb950', ability: '#58a6ff', upset: '#ff9800' },
    };
    const bc = barColors[role];

    const abilitySourceBadge =
        h.ability_source === 'recent'     ? '<span style="font-size:0.6rem;color:#58a6ff;margin-left:5px;">📊近走</span>' :
        h.ability_source === 'time_index' ? '<span style="font-size:0.6rem;color:#8b949e;margin-left:5px;">📈指数</span>' :
        '<span style="font-size:0.6rem;color:#555;margin-left:5px;">❓不明</span>';

    const dnaBadge = (h.jiku_bonus > 1.0 || h.db_bonus > 1.0)
        ? '<span style="background:#3fb950;color:#000;font-size:0.58rem;font-weight:900;padding:2px 6px;border-radius:4px;margin-left:6px;">🔥DNA</span>'
        : '';

    // スコア内訳は削除（ai_commentに統合）
    const comment = h.ai_comment || '';

    return `
        <div class="role-card ${r.cls}">
            <div class="role-label ${r.cls}">${r.emoji} ${r.label}</div>
            <div class="horse-main-name">${h.number}. ${h.name}${dnaBadge}</div>
            <div class="horse-sub-info">
                <span>👤 ${h.popularity}人気</span>
                <span>💴 ${h.odds}倍</span>
                ${abilitySourceBadge}
            </div>
            ${scoreBar('総合', h.score, scoreMax, bc.score)}
            ${scoreBar('妙味', h.value, valueMax, bc.value)}
            ${scoreBar('実力', h.ability_score, abilityMax, bc.ability)}
            ${h.upset_score > 0 ? scoreBar('穴', h.upset_score, 5, bc.upset) : ''}
            ${comment ? `<div class="reason-box ${r.cls}">💡 ${comment}</div>` : ''}
        </div>`;
}

/** ── メインレンダリング ── */
function renderApp(data) {
    const container = safeEl('results-container');
    const raceInfo  = safeEl('race-info-container');
    if (!container) return;

    const { scored, condition, horse_roles } = data.predictions;
    if (!scored || scored.length === 0) {
        showError('馬データが取得できませんでした');
        return;
    }

    // レース情報バー
    if (raceInfo) {
        const condTags = [
            condition.isClearFavorite ? '⚡ 本命突出型' : '⚖️ 接戦型',
            condition.isLowOdds       ? '🔒 低配当'    : '💰 配当あり',
            condition.hasUpsetCandidate ? '🎲 穴馬あり' : '🛡️ 堅め',
        ].join(' | ');
        raceInfo.innerHTML = `
            <div style="font-size:1.1rem;font-weight:900;color:#fff;">${data.race_name}</div>
            <div style="font-size:0.62rem;color:#ffeb3b;margin-top:3px;">${condTags}</div>`;
    }

    let html = '';

    const { honmei, taikou, ana, dna_horses } = horse_roles || {};

    // ─── ① 馬名一覧サマリーカード（最上部）───
    html += `
        <div style="background:linear-gradient(135deg,#1c2128,#161b22);border:1px solid #d4af37;border-radius:16px;padding:14px 16px;margin-bottom:18px;">
            <div style="font-size:0.65rem;color:#d4af37;font-weight:900;letter-spacing:1px;margin-bottom:10px;">🏇 ピックアップ</div>
            <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                ${honmei ? `
                <tr>
                    <td style="padding:5px 0;white-space:nowrap;width:50px;">
                        <span style="background:#d4af37;color:#000;font-weight:900;font-size:0.7rem;padding:2px 7px;border-radius:4px;">◎ 本命</span>
                    </td>
                    <td style="padding:5px 8px;font-weight:900;color:#fff;">${honmei.number}. ${honmei.name}</td>
                    <td style="padding:5px 0;font-size:0.7rem;color:#8b949e;text-align:right;">${honmei.popularity}人気 ${honmei.odds}倍</td>
                </tr>` : ''}
                ${(taikou || []).map(h => `
                <tr>
                    <td style="padding:5px 0;white-space:nowrap;">
                        <span style="background:#58a6ff;color:#000;font-weight:900;font-size:0.7rem;padding:2px 7px;border-radius:4px;">○ 対抗</span>
                    </td>
                    <td style="padding:5px 8px;font-weight:700;color:#c9d1d9;">${h.number}. ${h.name}</td>
                    <td style="padding:5px 0;font-size:0.7rem;color:#8b949e;text-align:right;">${h.popularity}人気 ${h.odds}倍</td>
                </tr>`).join('')}
                ${(ana || []).map(h => `
                <tr>
                    <td style="padding:5px 0;white-space:nowrap;">
                        <span style="background:#ff9800;color:#000;font-weight:900;font-size:0.7rem;padding:2px 7px;border-radius:4px;">🎲 穴馬</span>
                    </td>
                    <td style="padding:5px 8px;font-weight:700;color:#c9d1d9;">${h.number}. ${h.name}</td>
                    <td style="padding:5px 0;font-size:0.7rem;color:#8b949e;text-align:right;">${h.popularity}人気 ${h.odds}倍</td>
                </tr>`).join('')}
                ${(dna_horses || []).map(h => `
                <tr>
                    <td style="padding:5px 0;white-space:nowrap;">
                        <span style="background:#3fb950;color:#000;font-weight:900;font-size:0.7rem;padding:2px 7px;border-radius:4px;">⭐ おすすめ</span>
                    </td>
                    <td style="padding:5px 8px;font-weight:700;color:#c9d1d9;">${h.number}. ${h.name}</td>
                    <td style="padding:5px 0;font-size:0.7rem;color:#8b949e;text-align:right;">${h.popularity}人気 ${h.odds}倍</td>
                </tr>`).join('')}
                ${!(ana && ana.length > 0) ? `
                <tr>
                    <td style="padding:5px 0;white-space:nowrap;">
                        <span style="background:#333;color:#666;font-weight:900;font-size:0.7rem;padding:2px 7px;border-radius:4px;">🎲 穴馬</span>
                    </td>
                    <td style="padding:5px 8px;font-size:0.72rem;color:#555;" colspan="2">なし（堅いレース）</td>
                </tr>` : ''}
            </table>
        </div>`;

    // ─── ② 各馬の詳細カード ───
    html += `<h2 style="font-size:0.78rem;color:#8b949e;letter-spacing:1px;margin:18px 0 12px;">▼ AI馬評価（詳細）</h2>`;

    if (honmei) {
        html += horseCard(honmei, 'honmei', 1);
    }
    if (taikou && taikou.length > 0) {
        taikou.forEach((h, i) => { html += horseCard(h, 'taikou', i + 1); });
    }
    if (ana && ana.length > 0) {
        ana.forEach(h => { html += horseCard(h, 'ana', 0); });
    } else {
        html += `<div style="text-align:center;color:#555;font-size:0.72rem;padding:10px 0 6px;">🛡️ 穴馬候補なし（比較的堅いレース）</div>`;
    }

    // ─── ② DNAマッチ馬セクション ───
    if (dna_horses && dna_horses.length > 0) {
        html += `<h2 style="font-size:0.78rem;color:#3fb950;letter-spacing:1px;margin:22px 0 10px;">▼ ⭐ あなたへのおすすめ</h2>
        <div style="background:rgba(63,185,80,0.07);border:1px solid rgba(63,185,80,0.3);border-radius:14px;padding:12px;margin-bottom:14px;">
            <p style="font-size:0.68rem;color:#8b949e;margin:0 0 10px;">過去の買い目履歴（的中率・回収率）と人気帯がマッチする馬です。</p>`;
        dna_horses.forEach(h => {
            const bd = h.score_breakdown || {};
            html += `
                <div style="display:flex;align-items:center;gap:10px;padding:8px;background:rgba(0,0,0,0.3);border-radius:10px;margin-bottom:8px;">
                    <span style="font-size:1.3rem;">🔥</span>
                    <div style="flex:1;">
                        <div style="font-weight:900;color:#fff;font-size:0.9rem;">${h.number}. ${h.name}</div>
                        <div style="font-size:0.68rem;color:#8b949e;">${h.popularity}人気 / ${h.odds}倍</div>
                        ${bd.dna ? `<div style="font-size:0.66rem;color:#3fb950;margin-top:3px;">${bd.dna}</div>` : ''}
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.6rem;color:#8b949e;">総合</div>
                        <div style="font-weight:900;color:#d4af37;">${h.score.toFixed(1)}</div>
                    </div>
                </div>`;
        });
        html += `</div>`;
    }

    // ─── ② 全馬スコアテーブル ───
    html += `
        <h2 style="font-size:0.78rem;color:#8b949e;letter-spacing:1px;margin:22px 0 10px;">▼ 全馬AIスコア</h2>
        <div style="border-radius:12px;overflow:hidden;background:#161b22;border:1px solid #333;margin-bottom:80px;">
            <table class="score-table">
                <thead>
                    <tr>
                        <th style="text-align:left;padding-left:10px;">馬名</th>
                        <th>人/倍</th>
                        <th>妙味</th>
                        <th>実力</th>
                        <th>穴</th>
                        <th>総合</th>
                    </tr>
                </thead>
                <tbody>
                    ${scored.map((h, i) => {
                        const isHonmei  = honmei  && h.number === honmei.number;
                        const isTaikou  = taikou  && taikou.some(t => t.number === h.number);
                        const isAna     = ana     && ana.some(a => a.number === h.number);
                        const roleMark  = isHonmei ? '◎' : isTaikou ? '○' : isAna ? '🎲' : '';
                        const nameColor = isHonmei ? '#d4af37' : isTaikou ? '#58a6ff' : isAna ? '#ff9800' : '#c9d1d9';
                        const srcBadge  = h.ability_source === 'recent' ? '📊' : h.ability_source === 'time_index' ? '📈' : '❓';
                        return `
                            <tr style="background:${i === 0 ? 'rgba(212,175,55,0.06)' : 'transparent'}">
                                <td style="color:${nameColor};font-weight:${i < 3 ? '900' : '400'};">
                                    ${roleMark} ${h.number} ${h.name}
                                </td>
                                <td style="color:#8b949e;">${h.popularity}/${h.odds}</td>
                                <td style="color:${h.value > 1.2 ? '#3fb950' : h.value < 0.8 ? '#f85149' : '#fff'};">${h.value.toFixed(2)}</td>
                                <td style="color:${h.ability_score > 1.0 ? '#58a6ff' : '#fff'};">
                                    ${h.ability_score.toFixed(2)}<span style="font-size:0.55rem;color:#555;"> ${srcBadge}</span>
                                </td>
                                <td>${(h.upset_score || 0) > 0.5 ? '🎲' : '-'}</td>
                                <td style="font-weight:900;color:${i === 0 ? '#d4af37' : '#fff'};">${h.score.toFixed(1)}</td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <p style="font-size:0.6rem;color:#555;text-align:center;margin-top:6px;padding-bottom:1rem;">
            📊=近走成績 📈=タイム指数 ❓=データ不明 ／ 🎲=穴馬候補 ／ 🔥=ユーザーDNA一致
        </p>`;

    container.innerHTML = html;
}

/** ── 解析実行 ── */
async function fetchAnalysis() {
    const urlEl = safeEl('netkeiba-url');
    if (!urlEl) return;
    const urlValue = urlEl.value.trim();
    const match = urlValue.match(/race_id=(\d{12})/) || urlValue.match(/race\/(\d{12})/) || urlValue.match(/(\d{12})/);
    if (!match) { showError('netkeibaのURLまたは12桁のレースIDを入力してください'); return; }

    const btn = safeEl('fetch-odds-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'AI分析中...⏳'; }

    const container = safeEl('results-container');
    if (container) container.innerHTML = `
        <div style="text-align:center;padding:4rem 1rem;color:#8b949e;">
            <div style="font-size:2.5rem;margin-bottom:12px;">🧠</div>
            <p style="font-size:0.9rem;">全馬の近走成績・妙味・実力を<br>AIが分析中...</p>
            <p style="font-size:0.7rem;color:#555;margin-top:8px;">（初回は20秒ほどかかる場合があります）</p>
        </div>`;

    try {
        const res = await fetch(`/api/predict?race_id=${match[1]}&budget=1000`);
        const data = await res.json();
        if (data.success) {
            currentData = data;
            renderApp(data);
        } else {
            showError('データ取得に失敗しました');
        }
    } catch (e) {
        showError(e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '解析スタート 🔍'; }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadProfileStatus();
    safeEl('fetch-odds-btn')?.addEventListener('click', fetchAnalysis);
});

console.log('App V16 — 馬評価特化モード — Active.');
