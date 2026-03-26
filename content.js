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
                // カードのリンク先から chat_id と response_id を抽出
                const aTag = card.querySelector('a');
                if (!aTag || !aTag.href) {
                    throw new Error("チャットへのリンクが見つかりません。");
                }
                const url = new URL(aTag.href, window.location.origin);
                const pathParts = url.pathname.split('/');
                const chat_id = pathParts[pathParts.length - 1];
                const response_id = url.hash.replace('#', '');

                if (!chat_id || !response_id) {
                    throw new Error("チャットIDまたはレスポンスIDを取得できませんでした。");
                }

                // batchexecute 用の API 呼び出し
                // WIZ_global_data から CSRF (f.req) 用のトークンを取得
                const wizScript = Array.from(document.querySelectorAll('script')).find(s => s.textContent.includes('WIZ_global_data'));
                let atToken = '';
                if (wizScript) {
                    const match = wizScript.textContent.match(/"SNlM0e":"([^"]+)"/);
                    if (match && match[1]) {
                        atToken = match[1];
                    }
                }
                
                if (!atToken) {
                    // WIZ_global_dataから取れない場合は、windowから直接取得できるか試す(コンテントスクリプトの分離環境を考慮)
                    // inject script workaround might be needed, but we try anyway.
                    console.warn("CSRF Token not found in naive DOM scan. Assuming batchexecute might fail or require extension background bypass.");
                }

                // フルサイズ画像URLを取得するAPIの調査結果に基づく
                // rpcids=c8o8Fe には固有のトークン配列が渡される。
                // image_token (画像のggIDなど) が必要だと想定し、img.src から抽出を試みる。
                const imgSrc = img.src;
                // e.g. https://lh3.googleusercontent.com/gg/XXXXXXXXXX=s160...
                const hashMatch = imgSrc.match(/\/([a-zA-Z0-9_\-]+)=/);
                const image_token = hashMatch ? hashMatch[1] : null;

                // POST ボディの構築。実際の配列構造はGeminiのバージョンにより変わる可能性がある。
                // 構造: [chat_id, response_id, image_token] 等
                let reqArray = [chat_id, response_id];
                if (image_token) {
                    reqArray.push(image_token);
                }
                
                const freq = JSON.stringify([ [ ["c8o8Fe", JSON.stringify(reqArray), null, "generic"] ] ]);
                const bodyObj = new URLSearchParams();
                bodyObj.append('f.req', freq);
                if (atToken) {
                    bodyObj.append('at', atToken);
                }

                // APIリクエスト
                const response = await fetch(`/_/BardChatUi/data/batchexecute?rpcids=c8o8Fe`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    },
                    body: bodyObj.toString()
                });

                const text = await response.text();
                
                // レスポンスから https://lh3.googleusercontent.com/gg-dl/... を探す
                // または "https://..." を抽出する
                // batchexecuteのレスポンスは複数行に分かれた特殊な形式が多い
                const dlUrlMatch = text.match(/"(https:\/\/lh3\.googleusercontent\.com\/(?:gg-dl|rd-gg-dl)\/[^"]+)"/);
                let fullUrl = "";

                if (dlUrlMatch && dlUrlMatch[1]) {
                    fullUrl = dlUrlMatch[1];
                } else {
                    // APIからの取得に失敗した場合のフォールバック
                    // URLパラメータを =s0-d にしてみる
                    console.warn("APIレスポンスからダウンロードURLが見つかりませんでした。フォールバックを使用します。");
                    fullUrl = imgSrc.split('=')[0] + '=s0-d';
                }

                // フルサイズ画像をダウンロード
                await downloadImage(fullUrl, `gemini_image_${chat_id}_${response_id}.jpg`);

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
