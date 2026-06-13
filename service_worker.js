// service_worker.js: 拡張機能の司令塔（Background）。タブ間の伝言ゲームと、バックグラウンドタブの開閉管理を担う
console.log("GeminiDL service_worker.js");

// 指定したタブ(通常は送信元)を除外して、Geminiを利用している全てのタブに対してメッセージを一斉転送する関数
function bloadcastMessage(data, ignore_tab) {
    chrome.tabs.query({}, tabs => {
        tabs.forEach((tab) => {
            // tab.url が undefined のケース（読み込み中・破棄済みタブ等）でTypeErrorを防止
            if (!tab.url || !tab.url.startsWith("https://gemini.google.com/")) return;
            if (ignore_tab && tab.id === ignore_tab.id) return;
            // sendMessage先にリスナーがない場合のPromise拒否を吸収
            chrome.tabs.sendMessage(tab.id, { ...data, loopBlock: false }).catch(() => {});
        });
    });
}

// どこかのページから送られてきた通知を、bloadcastMessageを使って全体へ共有する
chrome.runtime.onMessage.addListener((msg, sender) => {
    bloadcastMessage(msg, sender.tab);
    return true;
})

// ダウンロード遂行のための、一時的な非アクティブタブの作成と削除（ライフサイクル監視）機能
function tabManager() {
    var managed_tabs = [];

    // 監視リストからidentifierに一致するエントリを削除し、タイムアウトをキャンセルし、タブを閉じるヘルパー
    function removeManagedTab(identifier) {
        const remaining = [];
        for (const mtab of managed_tabs) {
            if (mtab.identifier === identifier) {
                clearTimeout(mtab.timeoutId);
                // 既に閉じられているタブに対するremoveのエラーを吸収
                chrome.tabs.remove(mtab.tab.id).catch(() => {});
            } else {
                remaining.push(mtab);
            }
        }
        managed_tabs = remaining;
    }

    chrome.runtime.onMessage.addListener(msg => {
        switch (msg.gemdlAction) {
            case "open_tab_to_dl":
                // 1. ダウンロード用に特化したタブをバックグラウンド（裏側）で開く
                console.log("open_tab_to_dl", msg);
                chrome.tabs.create({
                    url: msg.url,
                    active: false
                }, tab => {
                    // タブ作成に失敗した場合（例: Chromeのリソース制限）の安全策
                    if (chrome.runtime.lastError || !tab) {
                        console.error("Tab creation failed:", chrome.runtime.lastError);
                        bloadcastMessage({
                            gemdlAction: "download_failed",
                            identifier: msg.identifier
                        });
                        return;
                    }
                    // 2. 問題が起きた際のために、60秒経過したタブは強制的に閉じてタイムアウトとして扱う安全装置
                    const toid = setTimeout(() => {
                        removeManagedTab(msg.identifier);
                        bloadcastMessage({
                            gemdlAction: "download_timeout",
                            identifier: msg.identifier
                        });
                    }, 60000);
                    // 監視リストに追加
                    managed_tabs.push({
                        tab: tab,
                        identifier: msg.identifier,
                        timeoutId: toid
                    });
                });
                break;
            case "download_failed":
            case "download_success":
                // 3. ダウンロード指令が完了(成功/失敗)したら、対象タブのタイムアウトを解除して素早くタブを閉じる
                console.log("download status", msg);
                removeManagedTab(msg.identifier);
                break;
            default:
                return false;
        }
        return true;
    });
}

(() => {
    tabManager();
})();