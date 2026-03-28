// app.js

if (window.location.search.includes('dl=true')) {
    const hash = window.location.hash; // "#rId"
    if (hash && hash.length > 1) {
        const responseId = hash.substring(1);
        autoDownloadImage(responseId);
    }
}

function autoDownloadImage(responseId) {
    const maxRetries = 60; // 500ms * 60 = 30 seconds
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
            console.log("[GeminiDL app.js] Found download button. Clicking...");
            btn.click();
            // クリック後、少し待ってからバックグラウンドに「終了」を通知
            setTimeout(() => {
                chrome.runtime.sendMessage({ type: "AUTO_DOWNLOAD_DONE" });
            }, 1000);
        } else if (attempts >= maxRetries) {
            clearInterval(checkExist);
            console.log("[GeminiDL app.js] Timeout: Download button not found.");
            chrome.runtime.sendMessage({ type: "AUTO_DOWNLOAD_ERROR", error: "timeout" });
        }
    }, 500);
}
