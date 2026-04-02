// message-helper.js: ページ内スクリプトと拡張機能本体(Service Worker)の間の「通信の架け橋」となるスクリプト
console.log("GeminiDL message-helper.js");

// 1. ページ内 (window.postMessage等) からの通信を受け取り、拡張機能 (chrome.runtime) へ転送
window.addEventListener("message", ev => {
    // 自分自身への送信か、拡張機能独自のメッセージであるかを確認
    if (ev.source != window || !ev.data.gemdlAction) return;
    // ループ通信(無限転送)を防ぐためのブロック機構
    if (ev.data.loopBlock) return;
    
    // 拡張機能側のバックグラウンドへメッセージを送信
    chrome.runtime.sendMessage({...ev.data, loopBlock: true});
})

// 2. 逆に、拡張機能からの通知を受け取り、ページ内のスクリプトへ転送
chrome.runtime.onMessage.addListener(msg => {
    if (msg.loopBlock) return;
    window.postMessage({...msg, loopBlock: true}, "*");
    return true;
});