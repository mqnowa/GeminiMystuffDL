// background.js

function getFormattedDate() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yy}${MM}${dd}${HH}${mm}${ss}`;
}

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
                    try {
                        sendResponse({ status: status });
                    } catch (e) {}
                }
                waitingTasks.delete(tabId);
            };
            
            const timeoutId = setTimeout(() => {
                console.log(`[GeminiDL] Timeout reached for tab ${tabId}. Forcing close.`);
                chrome.tabs.remove(tabId).catch(() => {});
                doResponse("timeout");
            }, 70000);
            
            waitingTasks.set(tabId, { doResponse, timeoutId });
        });
        
        return true; 
    }
    else if (request.type === "AUTO_DOWNLOAD_START_BG") {
        const tabId = sender.tab ? sender.tab.id : null;
        if (!tabId) return;

        const { url, chatId, responseId } = request;
        console.log(`[GeminiDL] Started bg download process for: ${url}`);
        
        const closeTabAndRespond = (status) => {
            console.log(`[GeminiDL] Bg download completed with status: ${status}. Closing tab ${tabId}...`);
            chrome.tabs.remove(tabId).catch(() => {});
            if (waitingTasks.has(tabId)) {
                const task = waitingTasks.get(tabId);
                clearTimeout(task.timeoutId);
                task.doResponse(status);
            }
        };

        (async () => {
            try {
                // Step 1: Request gg-dl URL
                const r1 = await fetch(url + "=d-I?alr=yes");
                if (!r1.ok) throw new Error("Step 1 Failed");
                const workFifeUrl = await r1.text();
                
                // Step 2: Request work.fife URL
                const r2 = await fetch(workFifeUrl);
                if (!r2.ok) throw new Error("Step 2 Failed");
                const finalUrl = await r2.text();
                
                // Step 3: Request final image
                const r3 = await fetch(finalUrl);
                if (!r3.ok) throw new Error("Step 3 Failed");
                const blob = await r3.blob();
                
                // Determine extension from Content-Type
                let ext = "png";
                if (blob.type.includes("jpeg") || blob.type.includes("jpg")) ext = "jpg";
                else if (blob.type.includes("webp")) ext = "webp";
                else if (blob.type.includes("gif")) ext = "gif";
                
                const filename = `${getFormattedDate()}_${chatId}_${responseId}.${ext}`;
                const objectUrl = URL.createObjectURL(blob);
                
                chrome.downloads.download({ url: objectUrl, filename: filename }, (downloadId) => {
                    if (chrome.runtime.lastError) {
                        console.error("[GeminiDL] Download Error:", chrome.runtime.lastError);
                        URL.revokeObjectURL(objectUrl);
                        closeTabAndRespond("error");
                        return;
                    }

                    // Monitor to wait until file is fully saved, then free Blob memory
                    const listener = (delta) => {
                        if (delta.id === downloadId && delta.state) {
                            if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
                                chrome.downloads.onChanged.removeListener(listener);
                                URL.revokeObjectURL(objectUrl);
                                console.log(`[GeminiDL] Revoked Blob URL for ${filename} (State: ${delta.state.current})`);
                            }
                        }
                    };
                    chrome.downloads.onChanged.addListener(listener);
                    
                    closeTabAndRespond("success");
                });
                
            } catch (err) {
                console.error("[GeminiDL] Error in bg download steps:", err);
                closeTabAndRespond("error");
            }
        })();
        
        return true;
    }
    else if (request.type === "AUTO_DOWNLOAD_ERROR") {
        if (sender && sender.tab) {
            const tabId = sender.tab.id;
            console.log(`[GeminiDL] Received ${request.type} from tab ${tabId}. Closing...`);
            chrome.tabs.remove(tabId).catch(() => {});
            if (waitingTasks.has(tabId)) {
                const task = waitingTasks.get(tabId);
                clearTimeout(task.timeoutId);
                task.doResponse("error");
            }
        }
        return true;
    }
});
