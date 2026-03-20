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

/** ── 馬評価の理由文を生成（自然な日本語） ── */
function buildReason(h, role) {
    const parts = [];

    if (role === 'honmei') {
        // 本命理由：総合スコア + 各軸の強みを説明
        parts.push(`全馬中で最も高い総合スコア（${h.score.toFixed(1)}点）を獲得。`);

        if (h.value > 1.3) {
            parts.push(`オッズが期待値より高く、妙味スコア ${h.value.toFixed(2)} と回収面でも優位。`);
        } else if (h.value > 1.0) {
            parts.push(`オッズはほぼ適性水準で、過評価されていない。`);
        } else {
            parts.push(`オッズは低め（人気馬）だが、安定性で総合トップに。`);
        }

        if (h.ability_source === 'recent' && h.ability_score > 0.95) {
            parts.push(`近走成績から実力を確認済み（実力スコア ${h.ability_score.toFixed(2)}）。`);
        } else if (h.ability_source === 'time_index' && h.ability_score > 0.95) {
            parts.push(`タイム指数も高水準（${h.ability_score.toFixed(2)}）で裏付けあり。`);
        } else if (h.ability_score <= 0.8) {
            parts.push(`実力データは限られるが、妙味と安定性で補っている。`);
        }

        if (h.jiku_bonus > 1.0 || h.db_bonus > 1.0) {
            parts.push(`過去の的中履歴と軸人気帯が一致（🔥DNAボーナス）。`);
        }

    } else if (role === 'taikou') {
        // 対抗理由：本命に次ぐ根拠を説明
        parts.push(`総合スコア ${h.score.toFixed(1)} 点で本命に次ぐ評価。`);

        if (h.value > 1.1) {
            parts.push(`妙味スコア ${h.value.toFixed(2)} と、オッズに対して期待値が上乗せされている。`);
        }

        if (h.ability_source === 'recent') {
            if (h.ability_score > 1.0) {
                parts.push(`近走成績が良好で実力スコアが高水準（${h.ability_score.toFixed(2)}）。`);
            } else {
                parts.push(`近走成績を反映して評価（実力スコア ${h.ability_score.toFixed(2)}）。`);
            }
        } else if (h.ability_source === 'time_index') {
            parts.push(`タイム指数ベースで実力を評価（スコア ${h.ability_score.toFixed(2)}）。`);
        }

        if (h.jiku_bonus > 1.0 || h.db_bonus > 1.0) {
            parts.push(`過去履歴と軸戦略がマッチ（🔥DNA一致）。`);
        }

        parts.push(`本命との組み合わせ馬として注目。`);

    } else {
        // 穴馬理由：なぜ低人気なのに選ばれたかを説明
        parts.push(`${h.popularity}番人気（単勝 ${h.odds}倍）と市場では低評価だが、AIスコアが高い穴馬候補。`);

        if (h.ability_source === 'recent' && h.ability_score > 0.85) {
            parts.push(`近走の着順・上がりタイムから実力が裏付けられている（実力スコア ${h.ability_score.toFixed(2)}）。`);
        } else if (h.ability_source === 'time_index' && h.ability_score > 0.85) {
            parts.push(`タイム指数から実力が確認できる（スコア ${h.ability_score.toFixed(2)}）。`);
        }

        if (h.value > 1.0) {
            parts.push(`オッズが期待値を上回っており（妙味 ${h.value.toFixed(2)}）、馬券的な妙味が大きい。`);
        }

        if (h.upset_score > 1.5) {
            parts.push(`穴馬スコア ${h.upset_score.toFixed(2)} と、人気薄×実力の組み合わせが特に際立つ。`);
        } else if (h.upset_score > 0.5) {
            parts.push(`穴馬スコア ${h.upset_score.toFixed(2)}。一発逆転の可能性がある。`);
        }
    }

    return parts.join(' ') || 'AIが総合的に高評価。';
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
            <div class="reason-box ${r.cls}">💡 ${buildReason(h, role)}</div>
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

    // ─── ① 本命・対抗・穴馬カード ───
    html += `<h2 style="font-size:0.78rem;color:#8b949e;letter-spacing:1px;margin:18px 0 12px;">▼ AI馬評価</h2>`;

    const { honmei, taikou, ana } = horse_roles || {};

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
