chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "open_background_tab") {
    chrome.tabs.create({
      url: request.url,
      active: false
    });
  }
});