// background.js

let waitingTasks = new Map(); // tabId -> { doResponse, timeoutId }

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "DOWNLOAD_FULL_SIZE") {
        const { chatId, responseId } = request;
        const targetUrl = `https://gemini.google.com/app/${chatId}?dl=true#${responseId}`;
        
        console.log(`[GeminiDL] Opening background tab for: ${targetUrl}`);
        
        chrome.tabs.create({ url: targetUrl, active: false }, (tab) => {
            const tabId = tab.id;
            let responded = false;
            
            const doResponse = (status) => {
                if (!responded) {
                    responded = true;
                    sendResponse({ status: status });
                }
                waitingTasks.delete(tabId);
            };
            
            // タイムアウト設定 (最長120秒待つ)
            const timeoutId = setTimeout(() => {
                console.log(`[GeminiDL] Timeout reached for tab ${tabId}. Forcing close.`);
                chrome.tabs.remove(tabId).catch(() => {});
                doResponse("timeout");
            }, 120000);
            
            waitingTasks.set(tabId, { doResponse, timeoutId });
        });
        
        return true; 
    }
    else if (request.type === "AUTO_DOWNLOAD_DONE" || request.type === "AUTO_DOWNLOAD_ERROR") {
        if (sender && sender.tab) {
            const tabId = sender.tab.id;
            const status = request.type === "AUTO_DOWNLOAD_DONE" ? "success" : "error";
            
            console.log(`[GeminiDL] Received ${request.type} from tab ${tabId}. Closing...`);
            
            // すぐにタブを閉じる
            chrome.tabs.remove(tabId).catch(() => {});
            
            if (waitingTasks.has(tabId)) {
                const task = waitingTasks.get(tabId);
                clearTimeout(task.timeoutId);
                task.doResponse(status);
            }
        }
        return true;
    }
});
