// app.js

function checkAndRunDownload() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('dl') === 'true') {
        const hash = window.location.hash; // "#rId"
        if (hash && hash.length > 1) {
            const responseId = hash.substring(1);
            autoDownloadImage(responseId);
        }
    }
}

let isDownloading = false;

function autoDownloadImage(responseId) {
    if (isDownloading) return;
    isDownloading = true;

    const maxWaitElements = 120; // 500ms * 120 = 60 seconds (for finding button)
    let attempts = 0;

    console.log(`[GeminiDL app.js] Started auto-download search for message: ${responseId}`);

    const checkExist = setInterval(() => {
        attempts++;
        const messageBlock = document.getElementById(responseId) || 
                             document.querySelector(`[data-message-id="${responseId}"]`);
        let btn = null;
        if (messageBlock) {
            btn = messageBlock.querySelector('.generated-image-button');
        }

        if (btn) {
            clearInterval(checkExist);
            console.log("[GeminiDL app.js] Found download button. Starting animation observer...");
            
            // 60秒の全体タイムアウト
            const overallTimeout = setTimeout(() => {
                if(observer) observer.disconnect();
                console.log("[GeminiDL app.js] Timeout: Download process took longer than 60 seconds.");
                chrome.runtime.sendMessage({ type: "AUTO_DOWNLOAD_ERROR", error: "timeout" });
            }, 60000);

            let spinnerSeen = false;
            
            // DOM変化を監視
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    if (mutation.type === 'childList') {
                        // スピナーが追加されたか？
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                if (node.tagName.toLowerCase() === 'mat-spinner' || node.classList.contains('mat-mdc-progress-spinner') || node.classList.contains('mdc-circular-progress')) {
                                    spinnerSeen = true;
                                    console.log("[GeminiDL app.js] Spinner added. Download preparing...");
                                } else if (node.querySelector && (node.querySelector('mat-spinner') || node.querySelector('.mat-mdc-progress-spinner'))) {
                                    spinnerSeen = true;
                                    console.log("[GeminiDL app.js] Spinner added (child). Download preparing...");
                                }
                            }
                        });

                        // スピナーが削除されたか？ (準備完了 -> ダウンロード開始)
                        if (spinnerSeen) {
                            mutation.removedNodes.forEach(node => {
                                if (node.nodeType === 1) {
                                    if (node.tagName.toLowerCase() === 'mat-spinner' || node.classList.contains('mat-mdc-progress-spinner') || node.classList.contains('mdc-circular-progress') || (node.querySelector && node.querySelector('mat-spinner'))) {
                                        console.log("[GeminiDL app.js] Spinner removed! Download actually starting...");
                                        observer.disconnect();
                                        clearTimeout(overallTimeout);
                                        // 実ファイルの保存キックまでのバッファとして1秒待つ
                                        setTimeout(() => {
                                            chrome.runtime.sendMessage({ type: "AUTO_DOWNLOAD_DONE" });
                                        }, 1000);
                                    }
                                }
                            });
                        }
                    }
                });
            });

            // 監視開始
            observer.observe(btn, { childList: true, subtree: true, attributes: true });
            
            // クリック実行
            btn.click();
            
            // もし画像が既にキャッシュされていて、スピナーが一瞬（あるいは全く）出なかった場合のためのフォールバック
            // スピナーが3秒経っても出ない場合は、速やかにダウンロート処理が終了しているとみなし閉じる。
            setTimeout(() => {
                if (!spinnerSeen) {
                    console.log("[GeminiDL app.js] No spinner detected after 3 seconds. Assuming immediate download.");
                    observer.disconnect();
                    clearTimeout(overallTimeout);
                    chrome.runtime.sendMessage({ type: "AUTO_DOWNLOAD_DONE" });
                }
            }, 3000);

        } else if (attempts >= maxWaitElements) {
            clearInterval(checkExist);
            console.log("[GeminiDL app.js] Timeout: Download button not found within 60 seconds.");
            chrome.runtime.sendMessage({ type: "AUTO_DOWNLOAD_ERROR", error: "not_found" });
        }
    }, 500);
}

// 実行
checkAndRunDownload();

// URLの変更（SPAの遷移）を検知するためのフォールバック監視
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        // isDownloading をリセットして再チェック
        isDownloading = false; 
        checkAndRunDownload();
    }
}).observe(document, {subtree: true, childList: true});
