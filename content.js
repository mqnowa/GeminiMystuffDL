// content.js

// GeminiのページDOMを監視し、画像サムネイルのカードにダウンロードボタンを追加します。
function initDLButtons() {
    // 既に処理済みのカードを避けるため :not(.gemini-dl-processed) を使用
    const cards = document.querySelectorAll('.library-item-card:not(.gemini-dl-processed)');
    
    cards.forEach(card => {
        card.classList.add('gemini-dl-processed');
        
        // img タグの存在確認
        const img = card.querySelector('img');
        if (!img) return;

        // ボタンコンテナの生成
        const btnContainer = document.createElement('div');
        btnContainer.className = 'gemini-dl-btn-container';

        // ダウンロードボタンの生成
        const dlBtn = document.createElement('button');
        dlBtn.className = 'gemini-dl-btn';
        dlBtn.innerHTML = '📥 フルサイズ';
        dlBtn.title = 'オリジナル解像度でダウンロード';

        // ホバーエリアの干渉を避けるためのクリックイベント
        dlBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            dlBtn.disabled = true;
            const originalText = dlBtn.innerHTML;
            dlBtn.innerHTML = '⏳ 取得中...';

            try {
                let chat_id = null;
                let response_id = null;

                // 1. aタグを探す
                const aTag = card.querySelector('a') || (card.shadowRoot && card.shadowRoot.querySelector('a'));
                if (aTag && aTag.href && aTag.href.includes('/app/')) {
                    const url = new URL(aTag.href, window.location.origin);
                    const pathParts = url.pathname.split('/');
                    chat_id = pathParts[pathParts.length - 1];
                    response_id = url.hash.replace('#', '');
                } else {
                    // 2. data属性から探す
                    chat_id = card.dataset.chatId || card.getAttribute('data-chat-id');
                    response_id = card.dataset.responseId || card.getAttribute('data-response-id');

                    // 3. innerHTMLなどから正規表現で探す
                    if (!chat_id || !response_id) {
                        const htmlStr = card.innerHTML;
                        const match = htmlStr.match(/\/app\/([a-zA-Z0-9_-]+)#([a-zA-Z0-9_-]+)/);
                        if (match) {
                            chat_id = match[1];
                            response_id = match[2];
                        }
                    }
                }

                if (!chat_id || !response_id) {
                    throw new Error("チャットへのリンクが見つかりません。(ID不詳)");
                }

                // CSRF トークンの取得
                const wizScript = Array.from(document.querySelectorAll('script')).find(s => s.textContent.includes('WIZ_global_data'));
                let atToken = '';
                if (wizScript) {
                    const match = wizScript.textContent.match(/"SNlM0e":"([^"]+)"/);
                    if (match && match[1]) {
                        atToken = match[1];
                    }
                }

                const imgSrc = img.src;
                const hashMatch = imgSrc.match(/\/([a-zA-Z0-9_\-]+)=/);
                const image_token = hashMatch ? hashMatch[1] : null;

                let fullUrl = "";

                // APIリクエストの試行
                try {
                    let reqArray = [chat_id, response_id];
                    if (image_token) reqArray.push(image_token);
                    
                    const freq = JSON.stringify([ [ ["c8o8Fe", JSON.stringify(reqArray), null, "generic"] ] ]);
                    const bodyObj = new URLSearchParams();
                    bodyObj.append('f.req', freq);
                    if (atToken) bodyObj.append('at', atToken);

                    const response = await fetch(`/_/BardChatUi/data/batchexecute?rpcids=c8o8Fe`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                        },
                        body: bodyObj.toString()
                    });

                    if (!response.ok) throw new Error("APIレスポンスエラー");
                    const text = await response.text();
                    
                    // レスポンスからダウンロードURLを探す
                    const dlUrlMatch = text.match(/"(https:\/\/lh3\.googleusercontent\.com\/(?:gg-dl|rd-gg-dl)\/[^"]+)"/);
                    if (dlUrlMatch && dlUrlMatch[1]) {
                        fullUrl = dlUrlMatch[1];
                    } else {
                        throw new Error("レスポンス内にダウンロードURLが見つかりません");
                    }
                } catch (apiErr) {
                    console.warn("batchexecute APIからのURL取得に失敗しました。推測URLにフォールバックします。", apiErr);
                    // 完全なフォールバック: gg -> gg-dl, rd-gg -> rd-gg-dl に置換し、解像度を s0 にする
                    if (imgSrc.includes('/gg/')) {
                        fullUrl = imgSrc.replace('/gg/', '/gg-dl/').split('=')[0] + '=s0-d';
                    } else if (imgSrc.includes('/rd-gg/')) {
                        fullUrl = imgSrc.replace('/rd-gg/', '/rd-gg-dl/').split('=')[0] + '=s0-d';
                    } else {
                        fullUrl = imgSrc.split('=')[0] + '=s0-d';
                    }
                }

                // フルサイズ画像をダウンロード
                await downloadImage(fullUrl, `gemini_original_${chat_id}.jpg`);

            } catch (err) {
                console.error("GeminiDL Error:", err);
                alert("画像のダウンロードに失敗しました: " + err.message);
            } finally {
                dlBtn.innerHTML = originalText;
                dlBtn.disabled = false;
            }
        });

        btnContainer.appendChild(dlBtn);
        card.appendChild(btnContainer);
    });
}

// 画像のダウンロードをブラウザに強制するヘルパー
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
        
        // クリーンアップ
        setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
    } catch (e) {
        // fetchでCORSエラーになる場合は、タブを開くなどの代替策
        console.warn("fetchによるダウンロードに失敗、直接遷移します。", e);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// 初期ロードと、MutationObserverを使った動的要素への対応
function observeDOM() {
    const observer = new MutationObserver((mutations) => {
        let shouldRun = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                shouldRun = true;
            }
        });
        if (shouldRun) {
            initDLButtons();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// 実行エントリーポイント
initDLButtons();
observeDOM();
