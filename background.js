chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "open_background_tab") {
    chrome.tabs.create({
      url: request.url,
      active: false
    });
  } else if (request.action === "download_status") {
    // すべての mystuff ページタブへステータスを転送
    chrome.tabs.query({ url: "*://gemini.google.com/mystuff*" }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, request);
      });
    });
  }
});