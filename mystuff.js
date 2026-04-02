console.log("GeminiDL mystuff.js");

var gemdl_photos = [];
var gemdl_batch_status = {
    total: 0,
    success: 0,
    failed: 0,
    timeout: 0
};

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

function gemdl_download(index) {
    if (index < 0 || index >= gemdl_photos.length) return;
    const [cid, rid] = gemdl_photos[index];
    const url = "https://gemini.google.com/app/" + cid + "#" + rid;
    const identifier = cid + "#" + rid;
    window.postMessage({
        gemdlAction: "open_tab_to_dl",
        url: url + "?dl=true",
        identifier: identifier
    }, "*");
    console.log("Downloading... " + url + "?dl=true")
}

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