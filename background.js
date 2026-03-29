const tabMap = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "open_background_tab") {
    chrome.tabs.create({
      url: request.url,
      active: false
    }, (tab) => {
      if (request.identifier) {
        tabMap.set(request.identifier, tab.id);
      }
    });
  } else if (request.action === "download_status") {
    // 該当するタブがあれば閉じる
    if (request.identifier) {
      const tabId = tabMap.get(request.identifier);
      if (tabId) {
        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) {
            console.log("Tab already closed or error:", chrome.runtime.lastError.message);
          }
        });
        tabMap.delete(request.identifier);
      }
    }

    // すべての mystuff ページタブへステータスを転送
    chrome.tabs.query({ url: ["*://gemini.google.com/mystuff*", "*://gemini.google.com/u/*/mystuff*"] }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, request);
      });
    });
  }
});

// タブが手動で閉じられた場合のクリーンアップ
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [identifier, id] of tabMap.entries()) {
    if (id === tabId) {
      tabMap.delete(identifier);
      break;
    }
  }
});