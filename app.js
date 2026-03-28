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
            console.log("[GeminiDL app.js] Found download button. Waiting for network interception...");
            
            // 60秒の全体タイムアウト
            const overallTimeout = setTimeout(() => {
                window.removeEventListener("message", messageListener);
                console.log("[GeminiDL app.js] Timeout: Download process took longer than 60 seconds.");
                chrome.runtime.sendMessage({ type: "AUTO_DOWNLOAD_ERROR", error: "timeout" });
            }, 60000);

            // inject.js からのURL傍受メッセージ待機
            const messageListener = (event) => {
                if (event.data && event.data.type === "GEMINI_DL_FULL_SIZE_URL") {
                    console.log("[GeminiDL app.js] Received full size URL from inject.js:", event.data.url);
                    window.removeEventListener("message", messageListener);
                    clearTimeout(overallTimeout);
                    
                    let chatId = "unknown";
                    const pathParts = window.location.pathname.split('/');
                    if (pathParts.length > 0) {
                        chatId = pathParts[pathParts.length - 1];
                    }
                    
                    chrome.runtime.sendMessage({ 
                        type: "AUTO_DOWNLOAD_START_BG", 
                        url: event.data.url,
                        chatId: chatId,
                        responseId: responseId
                    });
                }
            };
            window.addEventListener("message", messageListener);
            
            // クリック実行 (これにより batchexecute が発生し inject.js が傍受する)
            btn.click();

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
