// background.js

let waitingDownloads = [];

chrome.downloads.onCreated.addListener((downloadItem) => {
    console.log(`[GeminiDL] Global download detected:`, downloadItem.url);
    if (waitingDownloads.length > 0) {
        const req = waitingDownloads.shift();
        req.cleanUpAndClose();
        req.doResponse("success");
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "DOWNLOAD_FULL_SIZE") {
        const { chatId, responseId } = request;
        const targetUrl = `https://gemini.google.com/app/${chatId}#${responseId}`;
        
        console.log(`[GeminiDL] Opening background tab for: ${targetUrl}`);
        
        chrome.tabs.create({ url: targetUrl, active: false }, (tab) => {
            const tabId = tab.id;
            let responded = false;
            
            const doResponse = (status) => {
                if (!responded) {
                    responded = true;
                    sendResponse({ status: status });
                }
            };
            
            const cleanUpAndClose = () => {
                waitingDownloads = waitingDownloads.filter(item => item.tabId !== tabId);
                clearTimeout(timeoutId);
                chrome.tabs.remove(tabId).catch(() => {});
            };

            // タイムアウト設定 (最長120秒待つ)
            const timeoutId = setTimeout(() => {
                console.log(`[GeminiDL] Timeout reached for tab ${tabId}. Forcing close.`);
                cleanUpAndClose();
                doResponse("timeout");
            }, 120000);

            const executeClick = (rId) => {
                return new Promise((resolve) => {
                    const checkExist = setInterval(() => {
                        const btn = document.querySelector(`[data-message-id="${rId}"] .generated-image-button`) ||
                                    document.querySelector(`.generated-image-button`);
                        
                        if (btn) {
                            console.log("[GeminiDL Script] Found download button. Clicking.");
                            clearInterval(checkExist);
                            btn.click();
                            // クリックできたことを即座に返す（タブは background.js が監視して閉じる）
                            resolve(true); 
                        }
                    }, 500);
                    
                    setTimeout(() => {
                        clearInterval(checkExist);
                        resolve(false);
                    }, 30000);
                });
            };

            chrome.tabs.onUpdated.addListener(function listener(tId, changeInfo) {
                if (tId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    
                    console.log(`[GeminiDL] Injecting script to tab ${tabId}`);
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: executeClick,
                        args: [responseId]
                    }).then((results) => {
                        console.log(`[GeminiDL] Click execution finished. Waiting for download to start...`);
                        
                        if (results && results[0] && results[0].result) {
                            // ボタンクリックが成功したタブを待機キューに追加
                            waitingDownloads.push({ tabId, cleanUpAndClose, doResponse });
                        } else {
                            // 失敗時は即座に閉じる
                            cleanUpAndClose();
                            doResponse("error");
                        }
                    }).catch(err => {
                        console.error("[GeminiDL] Error executing script:", err);
                        cleanUpAndClose();
                        doResponse("error");
                    });
                }
            });
        });
    }
    return true; 
});
