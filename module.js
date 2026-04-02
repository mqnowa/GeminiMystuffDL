// module.js: ブラウザ全体の通信(XHR, fetch)をフックし、特定のURLの通信内容を傍受・操作するための基盤機能
console.log("GeminiDL module.js");

(function() {
    window._fetchSpies = window._fetchSpies || [];

    // 指定したURLパターンの通信が完了した際に、独自のaction(コールバック)を呼び出せるよう指示を登録する
    window.fetchSpy = function(urlPattern, action, preventDefault = false) {
        window._fetchSpies.unshift({ pattern: urlPattern, action, preventDefault });
    };

    // --- XMLHttpRequest のインターセプト(横取り)設定 ---
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        // 送信先URLが傍受対象リストと一致するかチェック
        this._matchedSpy = window._fetchSpies.find(s => 
            s.pattern instanceof RegExp ? s.pattern.test(url) : url.includes(s.pattern)
        );
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        const self = this;

        if (this._matchedSpy) {
            const spy = this._matchedSpy;
            self._actionExecuted = false; // 実行済みフラグ

            // status と statusText の書き換え
            Object.defineProperty(self, 'status', {
                get: function() {
                    return spy.preventDefault ? 500 : (this._realStatus || 200);
                }
            });

            // response / responseText の書き換え
            ['responseText', 'response'].forEach(prop => {
                // 元のプロトタイプからゲッターを取得
                const descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, prop);
                const originalGetter = descriptor.get;

                Object.defineProperty(self, prop, {
                    get: function() {
                        const originalValue = originalGetter.call(self);

                        // 【重要】通信完了(4) かつ まだ実行していない場合のみ action を呼ぶ
                        if (self.readyState === 4 && !self._actionExecuted) {
                            self._actionExecuted = true; 
                            spy.action(originalValue);
                        }

                        return spy.preventDefault ? "" : originalValue;
                    }
                });
            });
        }

        return originalSend.apply(this, arguments);
    };

    // --- fetch のインターセプト設定 (XHR版の挙動を完全再現) ---
    window._originalFetch = window.fetch;
    const originalFetch = window._originalFetch;

    window.fetch = async function(...args) {
        const url = args[0] instanceof Request ? args[0].url : args[0];
        
        const spy = window._fetchSpies.find(s => 
            s.pattern instanceof RegExp ? s.pattern.test(url) : url.includes(s.pattern)
        );

        // マッチしない場合は通常通り
        if (!spy) return originalFetch.apply(this, args);

        // 1. 通信自体は必ず実行する (XHR版の originalSend.apply に相当)
        const response = await originalFetch.apply(this, args);

        // 2. 裏側で action を実行するためのデータ取得 (クローンを使用)
        // アプリ側がレスポンスを触る前に、まずこちらで中身を確保する
        const clonedForSpy = response.clone();
        clonedForSpy.text().then(text => {
            spy.action(text);
        }).catch(() => {}); // エラーハンドリング

        // 3. アプリ側に返すレスポンスを「偽装」する
        if (spy.preventDefault) {
            // preventDefault が true の場合：
            // ステータス 500、中身は空文字の Response を作成して返す
            return new Response("", {
                status: 500,
                statusText: "Internal Server Error (Intercepted)",
                headers: response.headers // ヘッダーだけは維持
            });
        }

        // 通常時はそのままの response を返す
        return response;
    };
})();

// fetchSpyの簡便なエイリアス関数
function fetchSpy(urlPattern, action, preventDefault = false) {
    window._fetchSpies.unshift({ pattern: urlPattern, action, preventDefault });
}

// Google特有のbatchexecuteレスポンス形式(不要な改行や入れ子)を解析して、平易なJSONデータを取り出すヘルパー
function parseBatchexecuteResponse(text) {
    var size = null;
    var contents = [];
    for (var line of text.split("\n")) {
        if (size != null) {
            contents.push(JSON.parse(line));
            size = null;
        } else if (/^\d+$/.test(line)) {
            size = line;
        }
    }
    return JSON.parse(contents[0][0][2]);
}