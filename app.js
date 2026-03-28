async function downloadImage(url, name, attempt = 1) {
    if (attempt > 3) return;
    // referrerPolicy: "no-referrer" を入れることで「手打ち」と同じ状態にする
    const res = await window._originalFetch(url, {
        referrerPolicy: "origin",
        credentials: 'include'
    }
    );
    const type = res.headers.get("Content-Type") || "";

    if (type.includes("image")) {
        const ext = type.split("/")[1].split(";")[0];
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await res.blob()), download: `${name}.${ext}` });
        a.click();
        window.close();
    } else {
        downloadImage((await res.text()).trim(), name, attempt + 1);
    }
}

(() => {
    const url = new URL(location.href);
    const cid = url.pathname.split("/").at(-1)
    const parts = url.hash.split("?");
    const rid = parts[0].slice(1);
    const dl = (parts.length > 1) ? (new URLSearchParams(parts[1])).get("dl") : null;

    if (dl == undefined) {
        return;
    }

    fetchSpy(
        /.+\/batchexecute.+rpcids=c8o8Fe.+/,
        (text) => {
            let resBody = parseBatchexecuteResponse(text);
            downloadImage(
                resBody[0] + "=d-I?alr=yes",
                cid + "#" + rid,
            );
        },
        true
    );

    const intervalId = setInterval(() => {
        var dlButton = document.querySelector(`div#${CSS.escape(rid)} .generated-image-button`);
        if (dlButton != null) {
            dlButton.click();
            clearInterval(intervalId);
        }
    }, 500);
})();