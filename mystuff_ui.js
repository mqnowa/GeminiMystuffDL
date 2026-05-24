// mystuff_ui.js: /mystuff ページにおけるメニューUI描画や一括ダウンロードボタンなどのユーザ操作を管理するためのファイル
console.log("GeminiDL mystuff_ui.js");

(function() {
    let styleInjected = false;
    let bMode = "idle"; // 取る値: 'idle', 'select_start', 'select_end', 'downloading'
    let bStart = -1, bEnd = -1;
    let bQueue = [], bActive = 0, bTotal = 0;
    let bResults = { success: 0, failed: 0, timeout: 0, urls: [] };

    let uiWidget, uiBtn, uiSuccess, uiFailed, uiTimeout;
    let uiBanner, uiHistoryCheckbox;

    function initBatchUI() {
        if (document.getElementById("gemdl-batch-widget")) return;

        // まとめてスタイルを注入
        const style = document.createElement("style");
        style.textContent = `
            #gemdl-batch-widget { position: fixed; bottom: 20px; right: 20px; z-index: 9999; background: #fff; border: 1px solid #ccc; border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: flex; flex-direction: column; gap: 8px; color: #333; font-family: sans-serif; font-size: 14px; }
            .gemdl-batch-btn { background: #1a73e8; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; transition: background 0.2s; }
            .gemdl-batch-btn:hover { background: #1557b0; }
            .gemdl-batch-btn.cancel { background: #d93025; }
            .gemdl-batch-btn.cancel:hover { background: #b31412; }
            .gemdl-counters { display: flex; gap: 12px; justify-content: space-between; }
            .gemdl-c-s { color: #1e8e3e; font-weight: bold; }
            .gemdl-c-f { color: #d93025; font-weight: bold; }
            .gemdl-c-t { color: #f29900; font-weight: bold; }
            
            #gemdl-banner { position: fixed; bottom: 0; left: 0; width: 100%; z-index: 9998; background: #1a73e8; color: #fff; text-align: center; padding: 12px; font-weight: bold; font-size: 16px; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s; }
            #gemdl-banner.show { transform: translateY(0); }
            #gemdl-banner.downloading { background: linear-gradient(to right, #1a73e8 0%, #1a73e8 var(--progress, 0%), #0d47a1 var(--progress, 0%), #0d47a1 100%); }
            
            .gemdl-history-opt { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 4px; cursor: pointer; user-select: none; }
            .gemdl-history-opt input { cursor: pointer; }
            
            /* カードの角丸に追従させた美しいオーバレイハイライト */
            library-item-card.gemdl-range-highlight::after { 
                content: '';
                position: absolute;
                inset: 0; /* width / height 100% と同義 */
                border-radius: 16px; /* Gemini風の角丸 */
                box-shadow: inset 0 0 0 4px #1a73e8; /* 内側にボーダーを描画 */
                background: rgba(26, 115, 232, 0.2); /* 全体を薄いブルーで染める */
                pointer-events: none; /* マウスのイベントを貫通させる */
                z-index: 50;
                transition: opacity 0.2s;
            }
            
            library-item-card { position: relative; }
            .gemdl-dl-btn { position: absolute; top: 8px; right: 8px; z-index: 100; background: rgba(0,0,0,0.6); color: white; border-radius: 50%; width: 32px; height: 32px; display: none; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
            .gemdl-dl-btn:hover { background: rgba(0,0,0,0.8); transform: scale(1.1); }
            library-item-card:hover .gemdl-dl-btn { display: flex; }
        `;
        (document.head || document.documentElement).appendChild(style);

        // --- 右下のウィジェット構築 ---
        uiWidget = document.createElement("div");
        uiWidget.id = "gemdl-batch-widget";
        
        uiBtn = document.createElement("button");
        uiBtn.className = "gemdl-batch-btn";
        uiBtn.textContent = "一括ダウンロード";
        
        const cDiv = document.createElement("div");
        cDiv.className = "gemdl-counters";
        
        const spanS = document.createElement("span");
        spanS.className = "gemdl-c-s";
        spanS.textContent = "成功: ";
        const valS = document.createElement("span");
        valS.id = "gemdl-c-s-v";
        valS.textContent = "0";
        spanS.appendChild(valS);

        const spanF = document.createElement("span");
        spanF.className = "gemdl-c-f";
        spanF.textContent = "失敗: ";
        const valF = document.createElement("span");
        valF.id = "gemdl-c-f-v";
        valF.textContent = "0";
        spanF.appendChild(valF);

        const spanT = document.createElement("span");
        spanT.className = "gemdl-c-t";
        spanT.textContent = "タイムアウト: ";
        const valT = document.createElement("span");
        valT.id = "gemdl-c-t-v";
        valT.textContent = "0";
        spanT.appendChild(valT);

        cDiv.appendChild(spanS);
        cDiv.appendChild(spanF);
        cDiv.appendChild(spanT);
        
        const optLabel = document.createElement("label");
        optLabel.className = "gemdl-history-opt";
        uiHistoryCheckbox = document.createElement("input");
        uiHistoryCheckbox.type = "checkbox";
        uiHistoryCheckbox.id = "gemdl-history-chk";
        uiHistoryCheckbox.checked = true;
        optLabel.appendChild(uiHistoryCheckbox);
        optLabel.appendChild(document.createTextNode("すべての履歴を保存"));

        uiWidget.appendChild(uiBtn);
        uiWidget.appendChild(cDiv);
        uiWidget.appendChild(optLabel);
        document.documentElement.appendChild(uiWidget);

        uiSuccess = document.getElementById("gemdl-c-s-v");
        uiFailed = document.getElementById("gemdl-c-f-v");
        uiTimeout = document.getElementById("gemdl-c-t-v");

        // --- 下部バナー構築 ---
        uiBanner = document.createElement("div");
        uiBanner.id = "gemdl-banner";
        document.documentElement.appendChild(uiBanner);

        // --- メインボタンのイベント ---
        uiBtn.addEventListener("click", () => {
            if (bMode === "idle") {
                // ダウンロードモード開始
                bMode = "select_start";
                bStart = -1; bEnd = -1;
                uiBtn.textContent = "キャンセル";
                uiBtn.className = "gemdl-batch-btn cancel";
                showBanner("開始画像を選択");
                clearHighlights();
            } else {
                // ダウンロード中・選択中のキャンセル機能
                cancelBatch();
            }
        });
    }

    function showBanner(text) {
        uiBanner.textContent = text;
        uiBanner.classList.add("show");
    }

    function hideBanner() {
        uiBanner.classList.remove("show");
        uiBanner.classList.remove("downloading");
        uiBanner.style.removeProperty("--progress");
    }

    function updateProgress() {
        if (bMode !== "downloading") return;
        const finished = bResults.success + bResults.failed + bResults.timeout;
        const percent = bTotal > 0 ? (finished / bTotal) * 100 : 0;
        uiBanner.textContent = `ダウンロード中(${finished}/${bTotal})`;
        uiBanner.style.setProperty("--progress", `${percent}%`);
        uiBanner.classList.add("downloading");
    }

    function clearHighlights() {
        document.querySelectorAll("library-item-card.gemdl-range-highlight").forEach(el => el.classList.remove("gemdl-range-highlight"));
    }

    function getCardIndex(card) {
        return Array.from(document.querySelectorAll("library-item-card")).indexOf(card);
    }

    function cancelBatch() {
        clearHighlights();
        hideBanner();
        bMode = "idle";
        uiBtn.textContent = "一括ダウンロード";
        uiBtn.className = "gemdl-batch-btn";
        
        if (bActive > 0 || bQueue.length > 0) {
            // キャンセルされた場合、残りのキューを一覧の未実行リストとして記録
            bQueue.forEach(idx => {
                if (typeof gemdl_photos !== "undefined" && gemdl_photos[idx]) {
                    const obj = gemdl_photos[idx];
                    bResults.urls.push({ status: "未実行(キャンセル)", url: `https://gemini.google.com/app/${obj[0]}#${obj[1]}` });
                }
            });
            bQueue = [];
            exportResults();
        }
    }

    function startDownloads(sIdx, eIdx) {
        bMode = "downloading";
        bResults = { success: 0, failed: 0, timeout: 0, urls: [] };
        uiSuccess.textContent = "0"; uiFailed.textContent = "0"; uiTimeout.textContent = "0";
        bQueue = [];
        
        // 逆順を考慮してループ
        let step = sIdx <= eIdx ? 1 : -1;
        for (let i = sIdx; step === 1 ? i <= eIdx : i >= eIdx; i += step) {
            bQueue.push(i);
        }
        bTotal = bQueue.length;
        updateProgress();
        showBanner(""); // showBanner内でテキスト上書きされるが一応
        processQueue();
    }

    function processQueue() {
        if (bMode !== "downloading") return;
        // 最大5並列になるよう新しいダウンロードを呼び出し
        while (bActive < 5 && bQueue.length > 0) {
            const idx = bQueue.shift();
            bActive++;
            if (typeof gemdl_download === "function") {
                gemdl_download(idx);
            }
        }
        checkFinish();
    }

    function checkFinish() {
        if (bActive === 0 && bQueue.length === 0 && bMode === "downloading") {
            // 全て完了したらレポートを出力して終了
            bMode = "idle";
            uiBtn.textContent = "一括ダウンロード";
            uiBtn.className = "gemdl-batch-btn";
            clearHighlights();
            exportResults();
        }
    }

    function exportResults() {
        if (bResults.urls.length === 0 && !uiHistoryCheckbox.checked) return;
        
        const header = "0,ステータス,URL";
        const lines = [header];
        bResults.urls.forEach((item, i) => {
            lines.push(`${i + 1},${item.status},${item.url}`);
        });
        const text = lines.join("\n");
        // BOMを付与してExcel文字化けを防ぐ
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, text], {type: "text/csv;charset=utf-8"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        const prefix = uiHistoryCheckbox.checked ? "gemini_download_history_" : "gemini_download_report_";
        a.download = prefix + new Date().toISOString().replace(/[:.]/g, "-") + ".csv";
        a.click();
    }

    // --- クリックのキャプチャ（選択モードの制御） ---
    document.addEventListener("click", (e) => {
        if (bMode !== "select_start" && bMode !== "select_end") return;
        const card = e.target.closest("library-item-card");
        if (card) {
            // モード中は画像プレビューを阻止する
            e.preventDefault();
            e.stopPropagation();
            
            const idx = getCardIndex(card);
            if (idx === -1) return;

            if (bMode === "select_start") {
                bStart = idx;
                bMode = "select_end";
                showBanner("終了画像を選択");
            } else if (bMode === "select_end") {
                bEnd = idx;
                startDownloads(bStart, bEnd);
            }
        }
    }, { capture: true }); // キャプチャフェーズで最優先でキャッチ

    // --- ホバーによる UI ハイライト制御 ---
    document.addEventListener("mouseover", (e) => {
        const card = e.target.closest("library-item-card");
        if (!card) return;

        // （以前実装した）1枚のみダウンロード用のホバーボタンの追加管理
        if (!card.querySelector(".gemdl-dl-btn")) {
            const btn = document.createElement("div");
            btn.className = "gemdl-dl-btn";
            btn.title = "この画像をダウンロード";
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("height", "20"); svg.setAttribute("viewBox", "0 -960 960 960"); svg.setAttribute("width", "20"); svg.setAttribute("fill", "currentColor");
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", "M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z");
            svg.appendChild(path); btn.appendChild(svg);
            
            btn.addEventListener("click", (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                const i = getCardIndex(card);
                if(i !== -1 && typeof gemdl_download === "function") gemdl_download(i);
            });
            card.appendChild(btn);
        }

        // --- 一括選択モード時の範囲ハイライトロジック ---
        if (bMode === "select_start") {
            clearHighlights();
            card.classList.add("gemdl-range-highlight");
        } else if (bMode === "select_end") {
            clearHighlights();
            const idx = getCardIndex(card);
            if (bStart !== -1 && idx !== -1) {
                // 開始点～現在のホバー点までを青くする
                const s = Math.min(bStart, idx);
                const e = Math.max(bStart, idx);
                const allCards = Array.from(document.querySelectorAll("library-item-card"));
                for (let i = s; i <= e; i++) {
                    if (allCards[i]) allCards[i].classList.add("gemdl-range-highlight");
                }
            }
        }
    });

    // --- メッセージ待ち受け：カウンター管理とキューの消費 ---
    window.addEventListener("message", ev => {
        let reportUrl = "";
        let reportedAction = false;
        if(ev.data.gemdlAction && ev.data.identifier) {
            reportUrl = 'https://gemini.google.com/app/' + ev.data.identifier;
        }

        switch (ev.data.gemdlAction) {
            case "download_success":
                bResults.success++;
                if(uiSuccess) uiSuccess.textContent = bResults.success;
                if(uiHistoryCheckbox && uiHistoryCheckbox.checked) {
                    bResults.urls.push({ status: "成功", url: reportUrl });
                }
                reportedAction = true;
                break;
            case "download_timeout":
                bResults.timeout++;
                if(uiTimeout) uiTimeout.textContent = bResults.timeout;
                bResults.urls.push({ status: "タイムアウト", url: reportUrl });
                reportedAction = true;
                break;
            case "download_failed":
                bResults.failed++;
                if(uiFailed) uiFailed.textContent = bResults.failed;
                bResults.urls.push({ status: "エラー", url: reportUrl });
                reportedAction = true;
                break;
        }

        // キューが動いている最中であれば、終わった分だけ再度呼び出し
        if (reportedAction && bMode === "downloading") {
            bActive = Math.max(0, bActive - 1);
            updateProgress();
            processQueue();
        }
    });

    // 初期化のタイミング制御: bodyがある程度読み込まれてから
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initBatchUI);
    } else {
        initBatchUI();
    }

})();