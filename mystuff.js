(function () {
    var photos = [];
    let rangeState = {
        mode: 'IDLE', // IDLE, SELECT_START, SELECT_END, DOWNLOADING
        startIndex: null,
        endIndex: null,
        concurrentLimit: 5,
        queue: [],
        activeCount: 0,
        stats: { success: 0, error: 0, timeout: 0 },
        failedIds: [],
        processedIds: new Set() // 重複処理防止用
    };

    let ui = {};

    fetchSpy(
        /.+\/batchexecute.+rpcids=jGArJ.+/,
        (text) => {
            let resBody = parseBatchexecuteResponse(text);
            if (resBody.length == 2) {
                for (var info of resBody[0]) {
                    var [cid, rid] = info[0];
                    photos.push([cid.slice(2), rid.slice(2)]);
                }
            }
            console.log("Captured photos:", photos.length);
        }
    );

    function download(index) {
        if (index < 0 || index >= photos.length) return;
        const [cid, rid] = photos[index];
        const url = "https://gemini.google.com/app/" + cid + "#" + rid;
        const identifier = cid + "#" + rid;
        console.log("Starting background download:", identifier);
        window.postMessage({
            action: "open_background_tab",
            url: url + "?dl=true",
            identifier: identifier
        }, "*");
    }

    const cardSelector = '.library-item-card';

    // UIの構築 (Trusted Types対応)
    function initUI() {
        if (ui.panel) return;

        // 一括ダウンロードパネル
        ui.panel = document.createElement('div');
        ui.panel.className = 'dl-batch-panel';

        // 1行目: 同時実行数設定
        const row1 = document.createElement('div');
        row1.className = 'dl-panel-row';
        
        const concurrentLabel = document.createElement('span');
        concurrentLabel.textContent = '同時実行:';
        row1.appendChild(concurrentLabel);

        ui.concurrentInput = document.createElement('input');
        ui.concurrentInput.type = 'number';
        ui.concurrentInput.className = 'dl-concurrent-input';
        ui.concurrentInput.value = 5;
        ui.concurrentInput.min = 1;
        ui.concurrentInput.max = 20;
        row1.appendChild(ui.concurrentInput);
        ui.panel.appendChild(row1);

        // 2行目: 実行ボタン
        const row2 = document.createElement('div');
        row2.className = 'dl-panel-row';
        
        ui.batchBtn = document.createElement('button');
        ui.batchBtn.className = 'dl-batch-btn';
        ui.batchBtn.textContent = '一括ダウンロード';
        ui.batchBtn.onclick = toggleRangeSelection;
        row2.appendChild(ui.batchBtn);
        ui.panel.appendChild(row2);

        // 3行目: 統計カウンター
        ui.statsContainer = document.createElement('div');
        ui.statsContainer.className = 'dl-stats-container';
        
        const createStat = (label, className) => {
            const item = document.createElement('div');
            item.className = `dl-stat-item ${className}`;
            const lbl = document.createElement('span');
            lbl.className = 'dl-stat-label';
            lbl.textContent = label;
            const val = document.createElement('span');
            val.className = 'dl-stat-value';
            val.textContent = '0';
            item.appendChild(lbl);
            item.appendChild(val);
            ui.statsContainer.appendChild(item);
            return val;
        };

        ui.valSuccess = createStat('成功', 'dl-stat-success');
        ui.valError = createStat('失敗', 'dl-stat-error');
        ui.valTimeout = createStat('ＴＯ', 'dl-stat-timeout');

        ui.panel.appendChild(ui.statsContainer);

        document.body.appendChild(ui.panel);

        // ステータスバナー (指示用)
        ui.banner = document.createElement('div');
        ui.banner.className = 'dl-status-banner';

        ui.bannerText = document.createElement('div');
        ui.bannerText.className = 'dl-banner-text';
        ui.banner.appendChild(ui.bannerText);

        document.body.appendChild(ui.banner);
    }

    function toggleRangeSelection() {
        if (rangeState.mode === 'IDLE') {
            rangeState.mode = 'SELECT_START';
            ui.batchBtn.textContent = 'キャンセル';
            showBanner('開始点を選択してください');
            
            // カウンターをリセット
            ui.valSuccess.textContent = '0';
            ui.valError.textContent = '0';
            ui.valTimeout.textContent = '0';
        } else {
            resetRangeSelection();
        }
    }

    function resetRangeSelection() {
        rangeState.mode = 'IDLE';
        rangeState.startIndex = null;
        rangeState.endIndex = null;
        if (ui.batchBtn) ui.batchBtn.textContent = '一括ダウンロード';
        hideBanner();
        clearHighlights();
    }

    function showBanner(text) {
        ui.bannerText.textContent = text;
        ui.banner.classList.add('visible');
    }

    function hideBanner() {
        ui.banner.classList.remove('visible');
    }

    function clearHighlights() {
        document.querySelectorAll('.dl-range-highlight').forEach(el => {
            el.classList.remove('dl-range-highlight');
        });
    }

    function updateHighlights(start, end) {
        clearHighlights();
        if (start === null || end === null) return;
        const allCards = document.querySelectorAll(cardSelector);
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let i = min; i <= max; i++) {
            if (allCards[i]) allCards[i].classList.add('dl-range-highlight');
        }
    }

    function startBatchDownload() {
        const start = rangeState.startIndex;
        const end = rangeState.endIndex;
        const concurrent = parseInt(ui.concurrentInput.value) || 5;

        rangeState.mode = 'DOWNLOADING';
        rangeState.concurrentLimit = concurrent;
        rangeState.activeCount = 0;
        rangeState.stats = { success: 0, error: 0, timeout: 0 };
        rangeState.failedIds = [];
        rangeState.processedIds = new Set();
        rangeState.queue = [];

        // キューの作成 (逆順対応)
        if (start <= end) {
            for (let i = start; i <= end; i++) rangeState.queue.push(i);
        } else {
            for (let i = start; i >= end; i--) rangeState.queue.push(i);
        }

        ui.batchBtn.disabled = true;
        processQueue();
    }

    function processQueue() {
        if (rangeState.queue.length === 0 && rangeState.activeCount === 0) {
            finishBatchDownload();
            return;
        }

        while (rangeState.activeCount < rangeState.concurrentLimit && rangeState.queue.length > 0) {
            const index = rangeState.queue.shift();
            rangeState.activeCount++;
            updateProgress();
            download(index);
        }
    }

    function updateProgress() {
        const total = (Math.abs(rangeState.startIndex - rangeState.endIndex) + 1);
        const done = rangeState.stats.success + rangeState.stats.error + rangeState.stats.timeout;
        showBanner(`ダウンロード中... (${done}/${total})`);
        
        // パネル内の統計数値を更新
        ui.valSuccess.textContent = rangeState.stats.success.toString();
        ui.valError.textContent = rangeState.stats.error.toString();
        ui.valTimeout.textContent = rangeState.stats.timeout.toString();
    }

    function finishBatchDownload() {
        ui.batchBtn.disabled = false;
        ui.batchBtn.textContent = '一括ダウンロード';
        
        ui.valSuccess.textContent = rangeState.stats.success.toString();
        ui.valError.textContent = rangeState.stats.error.toString();
        ui.valTimeout.textContent = rangeState.stats.timeout.toString();

        showBanner('ダウンロード完了');

        saveDownloadReport();

        rangeState.mode = 'IDLE';
        setTimeout(hideBanner, 5000);
    }

    function saveDownloadReport() {
        let content = "";
        let filename = "";
        const now = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];

        if (rangeState.failedIds.length > 0) {
            const lines = rangeState.failedIds.map(id => {
                const [cid, rid] = id.split("#");
                return `https://gemini.google.com/app/${cid}#${rid}`;
            });
            content = "以下のダウンロードに失敗しました（再構成用URL）：\n\n" + lines.join('\n');
            filename = `${now}_failed_downloads.txt`;
        } else {
            content = `すべてのダウンロードが正常に完了しました。\n\n統計:\n成功: ${rangeState.stats.success}\n失敗: ${rangeState.stats.error}\nタイムアウト: ${rangeState.stats.timeout}\n\n完了日時: ${new Date().toLocaleString()}\n`;
            filename = `${now}_all_success.txt`;
        }

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // イベントリスナー
    document.addEventListener('mouseover', (e) => {
        const card = e.target.closest(cardSelector);
        if (!card) return;

        const allCards = Array.from(document.querySelectorAll(cardSelector));
        const index = allCards.indexOf(card);

        // 個別ダウンロードボタン
        if (!card.querySelector('.dl-spy-btn')) {
            const btn = document.createElement('button');
            btn.className = 'dl-spy-btn';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M12 16l-5-5h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z');
            svg.appendChild(path);
            btn.appendChild(svg);
            btn.onclick = (event) => {
                event.stopPropagation();
                download(index);
            };
            card.appendChild(btn);
        }

        // 範囲選択のハイライト更新
        if (rangeState.mode === 'SELECT_START') {
            updateHighlights(index, index);
        } else if (rangeState.mode === 'SELECT_END') {
            updateHighlights(rangeState.startIndex, index);
        }
    });

    document.addEventListener('click', (e) => {
        const card = e.target.closest(cardSelector);
        if (!card || rangeState.mode === 'IDLE' || rangeState.mode === 'DOWNLOADING') return;

        e.preventDefault();
        e.stopPropagation();

        const allCards = Array.from(document.querySelectorAll(cardSelector));
        const index = allCards.indexOf(card);

        if (rangeState.mode === 'SELECT_START') {
            rangeState.startIndex = index;
            rangeState.mode = 'SELECT_END';
            showBanner('終了点を選択してください');
        } else if (rangeState.mode === 'SELECT_END') {
            rangeState.endIndex = index;
            startBatchDownload();
        }
    }, true);

    // メッセージ受信
    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data || event.data.action !== 'download_status') return;

        const { status, identifier } = event.data;
        console.log(`[mystuff] Received status: ${status} for ${identifier}`, event.data);

        if (rangeState.mode !== 'DOWNLOADING') {
            console.log("[mystuff] Ignored: not in DOWNLOADING mode");
            return;
        }

        // 重複処理の防止 (念のため)
        if (identifier && rangeState.processedIds.has(identifier)) {
            console.warn(`[mystuff] Duplicate status ignored for ${identifier}`);
            return;
        }
        if (identifier) rangeState.processedIds.add(identifier);

        if (status === 'success') {
            rangeState.stats.success++;
        } else if (status === 'error' || status === 'timeout') {
            rangeState.stats[status]++;
            if (identifier) rangeState.failedIds.push(identifier);
        }

        rangeState.activeCount = Math.max(0, rangeState.activeCount - 1);
        console.log(`[mystuff] Stats updated - Success: ${rangeState.stats.success}, Active: ${rangeState.activeCount}`);
        
        updateProgress();
        processQueue();
    });

    const initInterval = setInterval(() => {
        if (document.body) {
            initUI();
            clearInterval(initInterval);
        }
    }, 500);

    console.log("Range downloader initialized");
})();