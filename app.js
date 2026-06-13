// app.js: チャット画面(/app/)にて起動し、画像の自動ダウンロード処理全般を制御します
console.log("GeminiDL app.js");

// 複数回のリダイレクト(URLの遷移)を辿り、最終的な画像ファイルを特定してローカルへ保存する関数
async function triStageDownload(url, savename) {
    var current_url = url;
    for (let i = 0; i < 3; i++) {
        const res = await window._originalFetch(current_url, {
            referrerPolicy: "origin",
            credentials: 'include'
        });
        const type = res.headers.get("Content-Type");
        
        // レスポンスが「画像」であればダミーのaタグ経由でダウンロードを実行して終了
        if (type && type.includes("image")) {
            const ext = type.split("/")[1].split(";")[0];
            Object.assign(
                document.createElement("a"),
                {
                    href: URL.createObjectURL(await res.blob()),
                    download: `${savename}.${ext}`
                }
            ).click();
            return true;
        } else {
            current_url = (await res.text()).trim();
        }

    }
    return false;
}

// URLに "?dl=true" が含まれる場合、自動ダウンロード処理を開始（無名関数で実行）
(async () => {
    if (!location.href.includes("/app/")) return;
    var [path, search] = location.href.split("?");
    var [path, r_id] = path.split("#");
    var c_id = path.split("/").at(-1);
    const identifier = c_id + "#" + r_id; // 各画像の固有IDを生成
    const sp = new URLSearchParams("?" + search);
    if (sp.get("dl") != "true") return;

    var download_complete = false;

    // 0.5秒おきに読込ボタン(spinner)を監視し、表示されたら画像抽出用のボタンを自動クリック
    const itvId = setInterval(() => {
        const msgGroup = document
            .getElementById(r_id);
        if (!msgGroup) return;

        const dlButtons = msgGroup
            .querySelectorAll("download-generated-image-button button");
        if (dlButtons.length === 0) return;

        const dlButton = dlButtons[dlButtons.length - 1];
        dlButton.click();
        clearInterval(itvId);
    }, 500);

    // batchexecute (APIの通信)をインターセプトし、画像生URLを横取りして直接ダウンロードを実施
    fetchSpy(/.+\/batchexecute.+rpcids=c8o8Fe.+/, text => {
        if (download_complete) return;
        const data = parseBatchexecuteResponse(text);
        
        // 取得したURLを元に画像ダウンロードに挑戦し、成否を他タブ(拡張機能全体)へ通知する
        triStageDownload(
            data[0] + "=d-I?alr=yes",
            identifier,
        ).then(success => {
            if (success) {
                window.postMessage({
                    gemdlAction: "download_success",
                    identifier: identifier
                }, "*");
                download_complete = true;
            } else {
                window.postMessage({
                    gemdlAction: "download_failed",
                    identifier: identifier
                }, "*");
            }
        }).catch(() => {
            // ネットワークエラー等で例外が発生した場合、速やかに失敗を通知して並行枠を解放する
            window.postMessage({
                gemdlAction: "download_failed",
                identifier: identifier
            }, "*");
        })
    }, true);
    
})();