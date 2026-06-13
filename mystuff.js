// mystuff.js: マイアクティビティ一覧(/mystuff)で稼働し、画像リストの取得と連続ダウンロードの進行を管理
console.log("GeminiDL mystuff.js");

// 捕捉したすべての画像の固有IDリストと、一括ダウンロードの処理ステータス集計カウンター
var gemdl_photos = [];
var gemdl_batch_status = {
    total: 0,
    success: 0,
    failed: 0,
    timeout: 0
};

// リスト取得(batchexecute API)を傍受し、チャットID(cid)とメッセージID(rid)を抽出して配列に記録
fetchSpy(
    /.+\/batchexecute.+rpcids=jGArJ.+/,
    text => {
        let resBody = parseBatchexecuteResponse(text);
        if (resBody.length == 2) {
            for (var info of resBody[0]) {
                var [cid, rid] = info[0];
                gemdl_photos.push([cid.slice(2), rid.slice(2)]);
            }
        }
        console.log("Captured photos:", gemdl_photos.length);
    }
);

// 既にダウンロード指示を出した識別子を記憶するSet
const gemdl_downloaded_identifiers = new Set();

// インデックス番号を指定して画像のダウンロード処理（取得専用タブの起動）をトリガーする
function gemdl_download(index) {
    if (index < 0 || index >= gemdl_photos.length) return;
    const [cid, rid] = gemdl_photos[index];
    const url = "https://gemini.google.com/app/" + cid + "#" + rid;
    const identifier = cid + "#" + rid;
    
    // 同一の cid, rid の場合はタブを開かずにスキップ
    if (gemdl_downloaded_identifiers.has(identifier)) {
        console.log("Skipping duplicate download (already processed):", identifier);
        setTimeout(() => {
            window.postMessage({
                gemdlAction: "download_success",
                identifier: identifier,
                isDuplicate: true
            }, "*");
        }, 0);
        return;
    }
    
    gemdl_downloaded_identifiers.add(identifier);
    
    // ダウンロード用のタブ（裏タブ）を開くように拡張機能へ指示を転送
    window.postMessage({
        gemdlAction: "open_tab_to_dl",
        url: url + "?dl=true",
        identifier: identifier
    }, "*");
    console.log("Downloading... " + url + "?dl=true")
}

// バックグラウンド等から送られてくるダウンロード結果（成功・失敗・タイムアウト）を受け取り、ステータスを更新する
window.addEventListener("message", ev => {
    switch (ev.data.gemdlAction) {
    case "download_success":
        gemdl_batch_status.success += 1;
        console.log(gemdl_batch_status);
        break;
    case "download_timeout":
        gemdl_batch_status.failed += 1;
        console.log(gemdl_batch_status);
        break;
    case "download_failed":
        gemdl_batch_status.timeout += 1;
        console.log(gemdl_batch_status);
        break;
    default:
        return;
    }
})