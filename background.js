const tabMap = new Map();

// mystuff ページタブへメッセージをブロードキャストする共通関数
function broadcastToMystuff(message) {
  chrome.tabs.query({ url: ["*://gemini.google.com/mystuff*", "*://gemini.google.com/u/*/mystuff*"] }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message);
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "open_background_tab") {
    chrome.tabs.create({
      url: request.url,
      active: false
    }, (tab) => {
      if (request.identifier) {
        // 60秒のタイムアウトを設定
        const timeoutId = setTimeout(() => {
          console.log("Background timeout:", request.identifier);
          
          // タブが存在すれば閉じる
          chrome.tabs.remove(tab.id, () => {
            if (chrome.runtime.lastError) {
              console.log("Tab already closed on timeout:", request.identifier);
            }
          });

          // タイムアウトしたことを mystuff に通知
          broadcastToMystuff({
            action: "download_status",
            status: "timeout",
            identifier: request.identifier
          });

          tabMap.delete(request.identifier);
        }, 60000);

        tabMap.set(request.identifier, { tabId: tab.id, timeoutId: timeoutId });
      }
    });
  } else if (request.action === "download_status") {
    // 該当するタブがあれば閉じる
    if (request.identifier) {
      const entry = tabMap.get(request.identifier);
      if (entry) {
        // タイムアウト監視を解除
        clearTimeout(entry.timeoutId);
        
        chrome.tabs.remove(entry.tabId, () => {
          if (chrome.runtime.lastError) {
            console.log("Tab already closed or error:", chrome.runtime.lastError.message);
          }
        });
        tabMap.delete(request.identifier);
      }
    }

    // すべての mystuff ページタブへステータスを転送
    broadcastToMystuff(request);
  }
});

// タブが手動で閉じられた場合のクリーンアップ
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [identifier, entry] of tabMap.entries()) {
    if (entry.tabId === tabId) {
      clearTimeout(entry.timeoutId);
      tabMap.delete(identifier);
      break;
    }
  }
});