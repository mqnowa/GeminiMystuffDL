window.addEventListener("message", (event) => {
  // 自分のページからのメッセージか、かつ必要なデータかを確認（セキュリティのため）
  if (event.source !== window || !event.data.action) return;

  if (event.data.action === "download") {
    // 拡張機能のAPIを使ってService Workerへ転送
    chrome.runtime.sendMessage(event.data);
  } else if (event.data.action === "open_background_tab") {
    // バックグラウンドへ「裏でタブを開いて」と依頼
    chrome.runtime.sendMessage(event.data);
  }
});