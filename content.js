// content.js

let apiIdList = []; // APIやHTMLから抽出した {chat_id, response_id} の順序付きリスト

// -------------------------------------------------------------------
// 1. ページ空間へのスクリプトインジェクション
// jGArJ のレスポンスや初期HTML内のデータを抽出して postMessage で受け取る
// -------------------------------------------------------------------
function injectHookScript() {
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            // 文字列から c_[chat_id], r_[response_id] のペアをすべて抽出
            function extractAndSendIds(text) {
                if (!text) return;
                // バッチレスポンス内の形式: ["c_chatid", "r_responseid"] にマッチさせる
                const regex = /\\u005B\\s*"c_([a-zA-Z0-9_-]+)"\\s*,\\s*"r_([a-zA-Z0-9_-]+)"/g;
                let match;
                const extracted = [];
                while ((match = regex.exec(text)) !== null) {
                    extracted.push({ chat_id: match[1], response_id: match[2] });
                }
                
                // もう一つの形式: ["c_chatid","r_responseid"] 等にも対応するより緩い正規表現
                const regex2 = /\\["c_([a-zA-Z0-9_-]+)","r_([a-zA-Z0-9_-]+)"\\]/g;
                while ((match = regex2.exec(text)) !== null) {
                    extracted.push({ chat_id: match[1], response_id: match[2] });
                }

                // 重複排除して送信 (1回のレスポンスで同じ形式が複数回マッチする可能性があるため簡易的な一意化)
                const uniqueIds = [];
                const seen = new Set();
                extracted.forEach(item => {
                    const key = item.chat_id + "_" + item.response_id;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueIds.push(item);
                    }
                });

                if (uniqueIds.length > 0) {
                    window.postMessage({ type: "GEMINI_DL_IDS", ids: uniqueIds }, "*");
                    console.log("[GeminiDL Inject] IDs sent:", uniqueIds.length);
                }
            }

            // 初回ロード分のデータをHTMLから探す
            function scanHTML() {
                const scripts = document.querySelectorAll('script');
                scripts.forEach(s => {
                    if (s.textContent.includes('c_') && s.textContent.includes('r_')) {
                        extractAndSendIds(s.textContent);
                    }
                });
            }

            // DOMContentLoaded後と数秒後にスキャン実行
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', scanHTML);
            } else {
                scanHTML();
            }
            setTimeout(scanHTML, 2000); // 遅延読み込み対応

            // --- fetch のフック ---
            const originalFetch = window.fetch;
            window.fetch = async (...args) => {
                const response = await originalFetch(...args);
                const url = typeof args[0] === 'string' ? args[0] : (args[0] ? args[0].url : "");
                
                if (url.includes('jGArJ') || url.includes('batchexecute')) {
                    const clone = response.clone();
                    clone.text().then(text => {
                        extractAndSendIds(text);
                    }).catch(e => console.error(e));
                }
                return response;
            };

            // --- XHR のフック ---
            const originalXhrOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                this.addEventListener('load', function() {
                    const urlStr = typeof url === 'string' ? url : "";
                    if (urlStr.includes('jGArJ') || urlStr.includes('batchexecute')) {
                        extractAndSendIds(this.responseText);
                    }
                });
                originalXhrOpen.call(this, method, url, ...rest);
            };

        })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
}

// メッセージリスナー
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

                // APIリストから取れなかった場合のフォールバック抽出 (以前のロジック)
                if (!chat_id || !response_id) {
                    console.warn(`[GeminiDL] APIリストのインデックス ${currentIndex} にデータが見つかりません。DOMヒューリスティックによる抽出にフォールバックします。`);
                    const aTag = card.querySelector('a') || (card.shadowRoot && card.shadowRoot.querySelector('a'));
                    if (aTag && aTag.href && aTag.href.includes('/app/')) {
                        const url = new URL(aTag.href, window.location.origin);
                        const pathParts = url.pathname.split('/');
                        chat_id = pathParts[pathParts.length - 1];
                        response_id = url.hash.replace('#', '');
                    } else {
                        chat_id = card.dataset.chatId || card.getAttribute('data-chat-id');
                        response_id = card.dataset.responseId || card.getAttribute('data-response-id');
                        if (!chat_id || !response_id) {
                            const htmlStr = card.innerHTML;
                            const match = htmlStr.match(/\/app\/([a-zA-Z0-9_-]+)#([a-zA-Z0-9_-]+)/);
                            if (match) {
                                chat_id = match[1];
                                response_id = match[2];
                            }
                        }
                    }
                }

                if (!chat_id || !response_id) {
                    throw new Error("チャットへのリンク(ID)が見つかりません。リストインデックスからもフォールバック抽出でも取得できませんでした。");
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
                    
                    const dlUrlMatch = text.match(/"(https:\/\/lh3\.googleusercontent\.com\/(?:gg-dl|rd-gg-dl)\/[^"]+)"/);
                    if (dlUrlMatch && dlUrlMatch[1]) {
                        fullUrl = dlUrlMatch[1];
                    } else {
                        throw new Error("レスポンス内にダウンロードURLが見つかりません");
                    }
                } catch (apiErr) {
                    console.warn(`[GeminiDL] batchexecute APIからのURL取得に失敗しました。推測URLにフォールバックします: ${apiErr.message}`);
                    if (imgSrc.includes('/gg/')) {
                        fullUrl = imgSrc.replace('/gg/', '/gg-dl/').split('=')[0] + '=s0-d';
                    } else if (imgSrc.includes('/rd-gg/')) {
                        fullUrl = imgSrc.replace('/rd-gg/', '/rd-gg-dl/').split('=')[0] + '=s0-d';
                    } else {
                        fullUrl = imgSrc.split('=')[0] + '=s0-d';
                    }
                }

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

injectHookScript();
// 初期DOMが構築されるのを待ってからボタンを配置
setTimeout(initDLButtons, 1000);
observeDOM();
