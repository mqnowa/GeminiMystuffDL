// content.js

let apiIdList = []; // APIやHTMLから抽出した {chat_id, response_id} の順序付きリスト

// 範囲ダウンロード用状態管理
let appState = 'IDLE'; // IDLE, SELECTING_START, SELECTING_END, DOWNLOADING
let rangeStartIndex = -1;
let rangeEndIndex = -1;
let downloadQueue = [];
let maxConcurrent = 5;
let activeDownloads = 0;
let successCount = 0;
let timeoutCount = 0;
let errorCount = 0;
let totalInQueue = 0;
let failedUrls = [];

let panelStatusDiv = null;
let bannerDiv = null;
let rangeBtn = null;
let concurrentInput = null;

// メッセージリスナー: inject.js からのデータを受信
window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "GEMINI_DL_IDS") return;
    const { ids } = event.data;
    if (ids && ids.length > 0) {
        // すでに登録されているIDとの重複を避けて追加
        ids.forEach(newItem => {
            const exists = apiIdList.some(item => item.chat_id === newItem.chat_id && item.response_id === newItem.response_id);
            if (!exists) {
                apiIdList.push(newItem);
            }
        });
        console.log(`[GeminiDL Content] ID list updated. Total IDs: ${apiIdList.length}`);
    }
});

// -------------------------------------------------------------------
// 2. ボタンの挿入とダウンロードロジック
// -------------------------------------------------------------------
function initDLButtons() {
    // 画面上の全カード要素を取得してインデックス順を保持
    const allCards = Array.from(document.querySelectorAll('.library-item-card'));
    
    allCards.forEach((card, index) => {
        if (card.classList.contains('gemini-dl-processed')) return;
        card.classList.add('gemini-dl-processed');
        
        const img = card.querySelector('img');
        if (!img) return;

        const btnContainer = document.createElement('div');
        btnContainer.className = 'gemini-dl-btn-container';

        const dlBtn = document.createElement('button');
        dlBtn.className = 'gemini-dl-btn';
        dlBtn.innerHTML = '📥 フルサイズ';
        dlBtn.title = 'オリジナル解像度でダウンロード';

        dlBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            dlBtn.disabled = true;
            const originalText = dlBtn.innerHTML;
            dlBtn.innerHTML = '⏳ 取得中...';

            try {
                // DOM上のインデックスを用いて保持しているリストからIDを取得
                // もしDOM再構築でインデックスがずれた場合のために、allCards内でのカードの現在のインデックスを再計算
                const currentCards = Array.from(document.querySelectorAll('.library-item-card'));
                const currentIndex = currentCards.indexOf(card);
                let chat_id = null;
                let response_id = null;

                if (currentIndex !== -1 && currentIndex < apiIdList.length) {
                    const idData = apiIdList[currentIndex];
                    chat_id = idData.chat_id;
                    response_id = idData.response_id;
                    console.log(`[GeminiDL] ID matched from list index ${currentIndex}: chat=${chat_id}, res=${response_id}`);
                }

                // --- バックグラウンドタブ方式のダウンロード ---
                if (!chat_id || !response_id) {
                    throw new Error(`チャットへのリンク(ID)が見つかりません。APIリスト(全${apiIdList.length}件)のインデックス ${currentIndex} にデータが存在しません。`);
                }
                
                chrome.runtime.sendMessage({
                    type: "DOWNLOAD_FULL_SIZE",
                    chatId: chat_id,
                    responseId: response_id
                }, (response) => {
                    console.log("[GeminiDL] Background download process started for", chat_id, response_id);
                });

                dlBtn.innerHTML = '🔄 DL準備中...';
                
                setTimeout(() => {
                    dlBtn.innerHTML = originalText;
                    dlBtn.disabled = false;
                }, 5000);

            } catch (err) {
                console.error("GeminiDL Error:", err);
                alert("画像のダウンロードに失敗しました: " + err.message);
                dlBtn.innerHTML = originalText;
                dlBtn.disabled = false;
            }
        });

        btnContainer.appendChild(dlBtn);
        card.appendChild(btnContainer);
    });
}

async function downloadImage(url, filename) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
    } catch (e) {
        console.warn("[GeminiDL] fetchによるダウンロードに失敗、直接遷移します。", e);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// -------------------------------------------------------------------
// 3. 初期化と監視
// -------------------------------------------------------------------
function observeDOM() {
    const observer = new MutationObserver((mutations) => {
        let shouldRun = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && (node.classList.contains('library-item-card') || node.querySelector('.library-item-card'))) {
                        shouldRun = true;
                    }
                });
            }
        });
        if (shouldRun) {
            // スクロールで追加されたカードを処理
            setTimeout(initDLButtons, 200); 
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// -------------------------------------------------------------------
// 4. 範囲機能 UIおよびロジック
// -------------------------------------------------------------------
function initRangeDownloadUI() {
    if (document.querySelector('.gemini-dl-panel')) return;

    // パネル
    const panel = document.createElement('div');
    panel.className = 'gemini-dl-panel';
    
    const controls = document.createElement('div');
    controls.className = 'gemini-dl-controls';
    
    rangeBtn = document.createElement('button');
    rangeBtn.className = 'gemini-dl-btn';
    rangeBtn.textContent = '範囲ダウンロード';
    
    const label = document.createElement('span');
    label.textContent = '件ずつ:';
    label.style.fontSize = '12px';
    
    concurrentInput = document.createElement('input');
    concurrentInput.type = 'number';
    concurrentInput.min = '1';
    concurrentInput.value = '5';
    concurrentInput.className = 'gemini-dl-input-n';
    
    controls.appendChild(rangeBtn);
    controls.appendChild(label);
    controls.appendChild(concurrentInput);
    
    panelStatusDiv = document.createElement('div');
    panelStatusDiv.className = 'gemini-dl-status';
    panelStatusDiv.textContent = '待機中';
    
    panel.appendChild(controls);
    panel.appendChild(panelStatusDiv);
    document.body.appendChild(panel);
    
    // バナー
    bannerDiv = document.createElement('div');
    bannerDiv.className = 'gemini-dl-banner';
    document.body.appendChild(bannerDiv);
    
    rangeBtn.addEventListener('click', () => {
        if (appState === 'IDLE') {
            startSelection();
        } else {
            cancelSelectionOrDownload();
        }
    });

    // キャプチャリングフェーズでクリックフック
    document.addEventListener('click', handleGlobalClick, true);
}

function startSelection() {
    appState = 'SELECTING_START';
    rangeBtn.textContent = 'キャンセル';
    bannerDiv.textContent = '開始点を選択';
    bannerDiv.classList.add('show');
    document.body.classList.add('gemini-dl-selecting');
    rangeStartIndex = -1;
    rangeEndIndex = -1;
    panelStatusDiv.textContent = '範囲選択中...';
    clearHighlights();
}

function cancelSelectionOrDownload() {
    appState = 'IDLE';
    rangeBtn.textContent = '範囲ダウンロード';
    bannerDiv.classList.remove('show');
    document.body.classList.remove('gemini-dl-selecting');
    clearHighlights();
    downloadQueue = []; // キューのクリア
    panelStatusDiv.textContent = 'キャンセルしました';
}

function clearHighlights() {
    document.querySelectorAll('.gemini-dl-selected').forEach(el => el.classList.remove('gemini-dl-selected'));
}

function handleGlobalClick(e) {
    if (appState !== 'SELECTING_START' && appState !== 'SELECTING_END') return;
    
    const card = e.target.closest('.library-item-card');
    if (!card) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const allCards = Array.from(document.querySelectorAll('.library-item-card'));
    const index = allCards.indexOf(card);
    if (index === -1) return;

    if (appState === 'SELECTING_START') {
        rangeStartIndex = index;
        card.classList.add('gemini-dl-selected');
        appState = 'SELECTING_END';
        bannerDiv.textContent = '終了点を選択';
    } else if (appState === 'SELECTING_END') {
        rangeEndIndex = index;
        card.classList.add('gemini-dl-selected');
        bannerDiv.classList.remove('show');
        document.body.classList.remove('gemini-dl-selecting');
        startRangeDownload();
    }
}

function startRangeDownload() {
    appState = 'DOWNLOADING';
    rangeBtn.textContent = 'キャンセル(停止)';
    
    const start = Math.min(rangeStartIndex, rangeEndIndex);
    const end = Math.max(rangeStartIndex, rangeEndIndex);
    const n = parseInt(concurrentInput.value, 10) || 5;
    maxConcurrent = n > 0 ? n : 5;
    
    downloadQueue = [];
    activeDownloads = 0;
    successCount = 0;
    timeoutCount = 0;
    errorCount = 0;
    failedUrls = [];

    const allCards = Array.from(document.querySelectorAll('.library-item-card'));
    for (let i = start; i <= end; i++) {
        const idData = apiIdList[i];
        if (idData) {
            downloadQueue.push({ index: i, ...idData });
        }
    }
    
    totalInQueue = downloadQueue.length;
    updateStatusText();
    processQueue();
}

function updateStatusText() {
    const done = successCount + timeoutCount + errorCount;
    panelStatusDiv.textContent = `${done}/${totalInQueue} 完了 (成功:${successCount} タイムアウト:${timeoutCount} エラー:${errorCount})`;
    if (done === totalInQueue && totalInQueue > 0) {
        appState = 'IDLE';
        rangeBtn.textContent = '範囲ダウンロード';
        panelStatusDiv.textContent += ' - 完了しました';
        clearHighlights();
        
        if (failedUrls.length > 0) {
            const textList = failedUrls.join('\n');
            const blob = new Blob([textList], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const timeStr = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
            a.download = `geminidl_failed_urls_${timeStr}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        }
    }
}

function processQueue() {
    if (appState !== 'DOWNLOADING') return;
    
    while (activeDownloads < maxConcurrent && downloadQueue.length > 0) {
        const item = downloadQueue.shift();
        activeDownloads++;
        
        chrome.runtime.sendMessage({
            type: "DOWNLOAD_FULL_SIZE",
            chatId: item.chat_id,
            responseId: item.response_id
        }, (response) => {
            activeDownloads--;
            // もし途中でキャンセルされて appState != DOWNLOADING になっていたら後続処理はただ流す
            if (appState !== 'DOWNLOADING') return;
            
            const status = response ? response.status : "error";
            const targetUrl = `https://gemini.google.com/app/${item.chat_id}#${item.response_id}`;
            
            if (status === "success") {
                successCount++;
            } else if (status === "timeout") {
                timeoutCount++;
                failedUrls.push(targetUrl);
            } else {
                errorCount++;
                failedUrls.push(targetUrl);
            }
            
            updateStatusText();
            processQueue(); // 空いた枠で次を処理
        });
    }
}

// 初期DOMが構築されるのを待ってからボタン・パネルを配置
setTimeout(() => {
    initDLButtons();
    initRangeDownloadUI();
}, 1000);
observeDOM();
