// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "DOWNLOAD_FULL_SIZE") {
        const { chatId, responseId } = request;
        const targetUrl = `https://gemini.google.com/app/${chatId}#${responseId}`;
        
        console.log(`[GeminiDL] Opening background tab for: ${targetUrl}`);
        
        // 非アクティブなタブを新規作成して該当チャットを開く
        chrome.tabs.create({ url: targetUrl, active: false }, (tab) => {
            const tabId = tab.id;
            
            // 該当ページ内で実行されるスクリプト
            // .generated-image-button を探してクリックする
            const executeClick = (rId) => {
                return new Promise((resolve) => {
                    console.log("[GeminiDL Script] Waiting for download button...");
                    
                    const checkExist = setInterval(() => {
                        // ハッシュから特定の応答メッセージブロック内のダウンロードボタンを探す
                        // rId には 'c_...' などが付いている場合もあるが、URLハッシュは純粋なID
                        const btn = document.querySelector(`[data-message-id="${rId}"] .generated-image-button`) ||
                                    document.querySelector(`.generated-image-button`); // フォールバック
                        
                        if (btn) {
                            console.log("[GeminiDL Script] Found download button. Clicking.");
                            clearInterval(checkExist);
                            btn.click();
                            
                            // クリック後、サーバー側でのアップスケールとダウンロード開始までにラグがあるため待機
                            // 10秒ほど待ってから完了としてタブを閉じる準備をする
                            setTimeout(() => resolve(true), 10000); 
                        }
                    }, 500); // 0.5秒おきにチェック
                    
                    // 30秒見つからなければタイムアウトとして諦める
                    setTimeout(() => {
                        clearInterval(checkExist);
                        console.log("[GeminiDL Script] Timeout waiting for download button.");
                        resolve(false);
                    }, 30000);
                });
            };

            // タブの完全な読み込みを待つ
            chrome.tabs.onUpdated.addListener(function listener(tId, changeInfo) {
                if (tId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    
                    console.log(`[GeminiDL] Injecting script to tab ${tabId}`);
                    // DOMが構築されたのでスクリプトを実行してボタンを押させる
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: executeClick,
                        args: [responseId]
                    }).then((results) => {
                        console.log(`[GeminiDL] Execution complete. Removing tab ${tabId}. Result:`, results);
                        chrome.tabs.remove(tabId);
                    }).catch(err => {
                        console.error("[GeminiDL] Error executing script:", err);
                        chrome.tabs.remove(tabId); // エラー時もゴミを残さないために閉じる
                    });
                }
            });
        });
        sendResponse({status: "started"});
    }
    return true; // 非同期でsendResponseを呼ぶ場合は必須だが、今回は即返す
});
