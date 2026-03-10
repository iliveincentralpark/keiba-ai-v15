/**
 * app_v5.js
 * AI買い目ジェネレーターロジック (V5: ロジック刷新・データ精度向上)
 */

let currentData = null;

// --- ユーティリティ ---
function logToUI(msg) { console.log(`[V5-AI] ${msg}`); }

function formatPrice(val) {
    return `¥${Number(val).toLocaleString()}`;
}

function showErrorInUI(msg) {
    const container = document.getElementById('bet-cards-container');
    if (container) {
        container.innerHTML = `
            <div style="padding:1.5rem; border:1px solid #f85149; background:rgba(248,81,73,0.1); border-radius:12px; color:#f85149; text-align:center;">
                <h3>⚠️ Error</h3>
                <p>${msg}</p>
            </div>`;
    }
}

// --- AI予測ロジック (V5: スコアリング & 揺らぎエンジン) ---
function buildAIPredictions(horses, raceInfo) {
    if (!horses || horses.length === 0) return {};

    // 1. スコア計算
    const scored = horses.map(h => {
        const item = {
            number: Number(h.number),
            name: h.name,
            odds: Number(h.odds),
            popularity: Number(h.popularity)
        };

        // 人気別基準オッズ
        const baseLine = [0, 2.8, 5.0, 8.0, 12.0, 18.0, 25.0, 35.0, 50.0, 70.0];
        const expected = baseLine[item.popularity] || (item.popularity * 8);

        // 妙味指数 (期待値)
        const valueScore = Math.pow(item.odds / expected, 1.15);

        // 人気安定度 (1人気は高いが、オッズが低いと評価が下がる)
        let stability = (20 / (item.popularity + 1.0));
        if (item.popularity === 1 && item.odds < 2.0) stability *= 0.5; // ガチガチの人気馬はAIスコアを抑制
        if (item.popularity === 2 && item.odds < 3.5) stability *= 0.7;

        // AI総合スコア + 思考の揺らぎ (0.8 ~ 1.2)
        const variance = 0.8 + (Math.random() * 0.4);
        item.ai_score = stability * valueScore * variance;
        item.value_score = valueScore;

        return item;
    });

    // 2. スコア順にソート
    scored.sort((a, b) => b.ai_score - a.ai_score);

    // [V5 特徴] 上位3頭の中でスコアが近い場合は「本命」を入れ替える可能性がある
    let honmeiCandidate = scored[0];
    if (scored[1] && scored[1].ai_score > scored[0].ai_score * 0.9) {
        // 2番手との差が10%以内なら、30%の確率で2番手を本命に昇格（AIの「勘」を再現）
        if (Math.random() < 0.3) {
            logToUI(`AI Simulation: Switching main bet to ${scored[1].name} due to high value score.`);
            honmeiCandidate = scored[1];
        }
    }

    const honmei = honmeiCandidate;
    const taikou = scored.find(h => h.number !== honmei.number);

    // 相手: 選定外の上位馬
    const remaining = scored.filter(h => h.number !== honmei.number && h.number !== taikou.number);
    const aite = remaining.slice(0, 4);

    // 穴馬: オッズ断層のある馬
    const horsesByPop = [...horses].sort((a, b) => a.popularity - b.popularity);
    const anaResult = horsesByPop.slice(5, 12).filter(h => {
        const idx = horsesByPop.findIndex(sh => sh.number == h.number);
        const prev = horsesByPop[idx - 1] || { odds: 1 };
        return (Number(h.odds) / Number(prev.odds) > 1.3) || (Number(h.odds) > Number(h.popularity) * 10);
    }).slice(0, 2).map(h => scored.find(sh => sh.number == h.number));

    return { honmei, taikou, aite, ana: anaResult };
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

    // レース情報
    raceContainer.innerHTML = `
        <h2 style="font-size:1.7rem; color:#fff; font-weight:900; margin-bottom:5px;">${data.race_info.name || '---'}</h2>
        <div style="display:flex; justify-content:center; gap:10px;">
            <span style="font-size:0.75rem; color:#8b949e;">ID: ${data.race_info.id}</span>
            <span style="font-size:0.75rem; color:#d4af37; font-weight:700;">PRO ANALYZED V5</span>
        </div>
    `;

    const { honmei, taikou, aite, ana } = data.predictions;
    if (!honmei) return;

    const userBudget = parseInt(document.getElementById('user-budget').value) || 10000;
    budgetTotalDisp.textContent = formatPrice(userBudget);

    const patterns = [
        { type: "単勝", method: "1頭流し", icon: "💎", jiku: [honmei], aite: [], ratio: 0.2 },
        { type: "馬連", method: "1頭流し", icon: "🏇", jiku: [honmei], aite: [taikou, ...aite].filter(x => x), ratio: 0.45 },
        { type: "ワイド", method: "1頭流し", icon: "🛡️", jiku: [honmei], aite: [taikou, ...ana].filter(x => x), ratio: 0.35 }
    ];

    let totalComputed = 0;

    patterns.forEach(p => {
        const clone = template.content.cloneNode(true);

        clone.querySelector('.badge').textContent = p.icon;
        clone.querySelector('.card-title').textContent = `${p.type} (${p.method})`;

        const reasoning = `AIスコア: ${p.jiku[0].name} は【${p.jiku[0].ai_score.toFixed(1)}】。妙味・安定度のバランスが最高です。`;
        clone.querySelector('.card-reasoning').textContent = reasoning;

        const detailsDiv = clone.querySelector('.bet-details');
        detailsDiv.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; align-items:center;">
                    <span style="width:50px; color:#8b949e; font-size:0.75rem; font-weight:bold;">軸(◎)</span>
                    <span class="horse-tag honmei" style="flex:1;">
                        <b>${p.jiku[0].number}</b> ${p.jiku[0].name} 
                        <span style="font-size:0.7rem; opacity:0.8; margin-left:5px;">(${p.jiku[0].popularity}人気/オッズ${p.jiku[0].odds})</span>
                    </span>
                </div>
                ${p.aite.length > 0 ? `
                <div style="display:flex; align-items:flex-start;">
                    <span style="width:50px; color:#8b949e; font-size:0.75rem; font-weight:bold; margin-top:5px;">相手</span>
                    <div style="flex:1; display:flex; flex-wrap:wrap; gap:4px;">
                        ${p.aite.map(h => `
                            <span class="horse-tag" style="border:1px solid #333; font-size:0.8rem;">
                                <b>${h.number}</b> ${h.name}
                            </span>
                        `).join('')}
                    </div>
                </div>` : ''}
            </div>
        `;

        const points = p.aite.length || 1;
        const amountPerPoint = Math.floor((userBudget * p.ratio) / points / 100) * 100;
        const cardTotal = amountPerPoint * points;
        totalComputed += cardTotal;

        clone.querySelector('.price-calc').textContent = `@${amountPerPoint} × ${points}点`;
        clone.querySelector('.price-total').textContent = formatPrice(cardTotal);

        const saveBtn = clone.querySelector('.save-btn');
        saveBtn.addEventListener('click', () => {
            saveBetToDatabase(saveBtn, p.type, p.method, points, cardTotal, p.jiku, p.aite);
        });

        container.appendChild(clone);
    });

    finalTotalDisp.textContent = formatPrice(totalComputed);

    // 出走馬データ一覧 (詳細表示版)
    const listSection = document.createElement('section');
    listSection.style = "padding:1rem; margin-top:1.5rem;";
    listSection.innerHTML = `
        <h3 style="font-size:0.85rem; color:#8b949e; margin-bottom:1rem; border-left:4px solid #d4af37; padding-left:10px;">DATA: 全出走馬オッズ・人気表</h3>
        <div style="border-radius:12px; overflow:hidden; border:1px solid #333;">
            <table style="width:100%; border-collapse:collapse; background:#161b22; font-size:0.85rem; text-align:left;">
                <thead style="background:#21262d; color:#8b949e;">
                    <tr>
                        <th style="padding:10px;">馬番</th>
                        <th style="padding:10px;">馬名</th>
                        <th style="padding:10px;">人気</th>
                        <th style="padding:10px;">オッズ</th>
                    </tr>
                </thead>
                <tbody>
                    ${(data.all_horses || []).sort((a, b) => a.number - b.number).map(h => `
                        <tr style="border-bottom:1px solid #21262d;">
                            <td style="padding:10px; font-weight:bold; color:#d4af37;">${h.number}</td>
                            <td style="padding:10px; font-weight:600;">${h.name}</td>
                            <td style="padding:10px; color:${h.popularity == 1 ? '#ffeb3b' : '#8b949e'}; font-weight:${h.popularity == 1 ? '900' : 'normal'};">${h.popularity}人気</td>
                            <td style="padding:10px; font-weight:bold;">${h.odds}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    container.appendChild(listSection);
}

// --- DB連動 ---
async function saveBetToDatabase(btn, betType, betMethod, points, amount, jiku, aite) {
    if (!currentData || !currentData.race_info) return;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '...';

    const payload = {
        race_id: currentData.race_id || currentData.race_info.id,
        race_name: currentData.race_info.name,
        bet_type: betType,
        bet_method: betMethod,
        points: points,
        amount: amount,
        jiku_horses: jiku.map(h => h.number).join(','),
        aite_horses: aite.map(h => h.number).join(','),
        jiku_names: jiku.map(h => h.name).join(','),
        jiku_pops: jiku.map(h => h.popularity).join(','),
        jiku_odds: jiku.map(h => h.odds).join(','),
        aite_names: aite.map(h => h.name).join(','),
        aite_pops: aite.map(h => h.popularity).join(','),
        aite_odds: aite.map(h => h.odds).join(',')
    };

    try {
        const res = await fetch('/api/save_bet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            btn.textContent = '済 ✅';
            btn.style.borderColor = '#3fb950';
            btn.style.color = '#3fb950';
        }
    } catch (e) {
        btn.textContent = '❌';
    }
}

// --- メイン取得処理 ---
async function fetchLiveOdds() {
    const urlInput = document.getElementById('netkeiba-url').value.trim();
    if (!urlInput) return;

    let raceId = urlInput;
    const match = urlInput.match(/race_id=(\d{12})/);
    if (match) raceId = match[1];
    else {
        const dbMatch = urlInput.match(/race\/(\d{12})/);
        if (dbMatch) raceId = dbMatch[1];
    }

    if (!/^\d{12}$/.test(raceId)) {
        showErrorInUI("12桁の正しいレースIDを入力してください");
        return;
    }

    const btn = document.getElementById('fetch-odds-btn');
    btn.disabled = true;
    btn.textContent = '🔄 分析中...';

    const container = document.getElementById('bet-cards-container');
    container.innerHTML = `
        <div style="text-align:center; padding:4rem; color:#8b949e;">
            <div class="loader" style="width:40px; height:40px; border:4px solid #333; border-top-color:#d4af37; border-radius:50%; margin:0 auto 20px; animation:spin 1s linear infinite;"></div>
            <p>最新のリアルタイム分布を解析中...<br><small>人気薄の妙味を探索しています</small></p>
            <style>@keyframes spin {100%{transform:rotate(360deg);}}</style>
        </div>
    `;

    try {
        const res = await fetch(`/api/scrape?race_id=${raceId}`);
        if (!res.ok) throw new Error("サーバーとの通信に失敗しました");
        const result = await res.json();

        if (result.success) {
            const horsesArray = Object.keys(result.horses).map(num => ({
                number: num,
                name: result.horses[num].name,
                odds: result.horses[num].odds,
                popularity: result.horses[num].popularity
            }));

            // 人気順位で評価用配列を作成
            const sortedByPop = [...horsesArray].sort((a, b) => (Number(a.popularity) || 100) - (Number(b.popularity) || 100));

            currentData = {
                race_id: result.race_id,
                race_info: { id: result.race_id, name: result.race_name },
                predictions: buildAIPredictions(sortedByPop, { name: result.race_name }),
                all_horses: horsesArray
            };
            renderApp(currentData);
        }
    } catch (e) {
        showErrorInUI("取得エラー: " + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '解析';
    }
}

// --- 初期化 ---
function initApp() {
    document.getElementById('fetch-odds-btn').addEventListener('click', fetchLiveOdds);
    document.getElementById('user-budget').addEventListener('change', () => {
        if (currentData) renderApp(currentData);
    });
}

document.addEventListener('DOMContentLoaded', initApp);
