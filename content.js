// content.js

let apiIdList = []; // APIやHTMLから抽出した {chat_id, response_id} の順序付きリスト

// メッセージリスナー: inject.js からのデータを受信
window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "GEMINI_DL_IDS") return;
    const { ids } = event.data;
    if (ids && ids.length > 0) {
        // すでに登録されているIDとの重複を避けて追加
        ids.forEach(newItem => {
            const exists = apiIdList.some(item => item.chat_id === newItem.chat_id && item.response_id === newItem.response_id);
            if (!exists) {
                apiIdList.push(newItem);
            }
        });
        console.log(`[GeminiDL Content] ID list updated. Total IDs: ${apiIdList.length}`);
    }
});

// -------------------------------------------------------------------
// 2. ボタンの挿入とダウンロードロジック
// -------------------------------------------------------------------
function initDLButtons() {
    // 画面上の全カード要素を取得してインデックス順を保持
    const allCards = Array.from(document.querySelectorAll('.library-item-card'));
    
    allCards.forEach((card, index) => {
        if (card.classList.contains('gemini-dl-processed')) return;
        card.classList.add('gemini-dl-processed');
        
        const img = card.querySelector('img');
        if (!img) return;

        const btnContainer = document.createElement('div');
        btnContainer.className = 'gemini-dl-btn-container';

        const dlBtn = document.createElement('button');
        dlBtn.className = 'gemini-dl-btn';
        dlBtn.innerHTML = '📥 フルサイズ';
        dlBtn.title = 'オリジナル解像度でダウンロード';

        dlBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            dlBtn.disabled = true;
            const originalText = dlBtn.innerHTML;
            dlBtn.innerHTML = '⏳ 取得中...';

            try {
                // DOM上のインデックスを用いて保持しているリストからIDを取得
                // もしDOM再構築でインデックスがずれた場合のために、allCards内でのカードの現在のインデックスを再計算
                const currentCards = Array.from(document.querySelectorAll('.library-item-card'));
                const currentIndex = currentCards.indexOf(card);
                let chat_id = null;
                let response_id = null;

                if (currentIndex !== -1 && currentIndex < apiIdList.length) {
                    const idData = apiIdList[currentIndex];
                    chat_id = idData.chat_id;
                    response_id = idData.response_id;
                    console.log(`[GeminiDL] ID matched from list index ${currentIndex}: chat=${chat_id}, res=${response_id}`);
                }

                // --- バックグラウンドタブ方式のダウンロード ---
                if (!chat_id || !response_id) {
                    throw new Error(`チャットへのリンク(ID)が見つかりません。APIリスト(全${apiIdList.length}件)のインデックス ${currentIndex} にデータが存在しません。`);
                }
                
                chrome.runtime.sendMessage({
                    type: "DOWNLOAD_FULL_SIZE",
                    chatId: chat_id,
                    responseId: response_id
                }, (response) => {
                    console.log("[GeminiDL] Background download process started for", chat_id, response_id);
                });

                dlBtn.innerHTML = '🔄 DL準備中...';
                
                setTimeout(() => {
                    dlBtn.innerHTML = originalText;
                    dlBtn.disabled = false;
                }, 5000);

            } catch (err) {
                console.error("GeminiDL Error:", err);
                alert("画像のダウンロードに失敗しました: " + err.message);
                dlBtn.innerHTML = originalText;
                dlBtn.disabled = false;
            }
        });

        btnContainer.appendChild(dlBtn);
        card.appendChild(btnContainer);
    });
}

async function downloadImage(url, filename) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
    } catch (e) {
        console.warn("[GeminiDL] fetchによるダウンロードに失敗、直接遷移します。", e);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// -------------------------------------------------------------------
// 3. 初期化と監視
// -------------------------------------------------------------------
function observeDOM() {
    const observer = new MutationObserver((mutations) => {
        let shouldRun = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && (node.classList.contains('library-item-card') || node.querySelector('.library-item-card'))) {
                        shouldRun = true;
                    }
                });
            }
        });
        if (shouldRun) {
            // スクロールで追加されたカードを処理
            setTimeout(initDLButtons, 200); 
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// 初期DOMが構築されるのを待ってからボタンを配置
setTimeout(initDLButtons, 1000);
observeDOM();
