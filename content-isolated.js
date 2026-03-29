window.addEventListener("message", (event) => {
  // 自分のページからのメッセージか、かつ必要なデータかを確認（セキュリティのため）
  if (event.source !== window || !event.data.action) return;

  // 拡張機能から送られたメッセージ（fromExtension: true）は無視する（ループ防止）
  if (event.data.fromExtension) return;

  if (["download", "open_background_tab", "download_status"].includes(event.data.action)) {
    // 拡張機能のAPIを使ってService Workerへ転送
    chrome.runtime.sendMessage(event.data);
  }
});

// Service Worker からのメッセージをウェブページ (mystuff) に転送
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "download_status") {
    // ページ自身がこのメッセージを拾い直さないよう、フラグを立てて転送
    window.postMessage({ ...message, fromExtension: true }, "*");
  }
});
