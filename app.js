async function triStageDownload(url, savename) {
    var current_url = url;
    for (let i = 0; i < 3; i++) {
        const res = await window._originalFetch(current_url, {
            referrerPolicy: "origin",
            credentials: 'include'
        });
        const type = res.headers.get("Content-Type");
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

(async () => {
    if (!location.href.includes("/app/")) return;
    var [path, search] = location.href.split("?");
    var [path, r_id] = path.split("#");
    var c_id = path.split("/").at(-1);
    const identifier = c_id + "#" + r_id;
    const sp = new URLSearchParams("?" + search);
    if (sp.get("dl") != "true") return;

    var download_complete = false;

    const itvId = setInterval(() => {
        const msgGroup = document
            .getElementById(r_id);
        if (!msgGroup) return;

        const dlButton = msgGroup
            .querySelector("button.generated-image-button");
        if (!dlButton) return;

        dlButton.click();
        clearInterval(itvId);
    }, 500);

    fetchSpy(/.+\/batchexecute.+rpcids=c8o8Fe.+/, text => {
        if (download_complete) return;
        const data = parseBatchexecuteResponse(text);
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
                    gemdlAction: "download_faild",
                    identifier: identifier
                }, "*");
            }
        })
    }, true);
    
})();