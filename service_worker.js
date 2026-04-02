console.log("GeminiDL service_worker.js");

function bloadcastMessage(data, ignore_tab) {
    chrome.tabs.query({}, tabs => {
        tabs.forEach((tab) => {
            if (!tab.url.startsWith("https://gemini.google.com/")) return;
            if (ignore_tab && tab.id === ignore_tab.id) return;
            chrome.tabs.sendMessage(tab.id, {...data, loopBlock: false});
        });
    });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
    bloadcastMessage(msg, sender.tab);
    return true;
})

function tabManager() {
    var managed_tabs = [];
    chrome.runtime.onMessage.addListener(msg => {
        switch (msg.gemdlAction) {
        case "open_tab_to_dl":
            console.log("open_tab_to_dl", msg);
            chrome.tabs.create({
                url: msg.url,
                active: false
            }, tab => {
                const toid = setTimeout(() => {
                    chrome.tabs.remove(tab.id);
                    bloadcastMessage({
                        gemdlAction: "download_timeout",
                        identifier: msg.identifier
                    });
                }, 60000);
                managed_tabs.push({
                    tab: tab,
                    identifier: msg.identifier,
                    timeoutId: toid
                });
            });
            break;
        case "download_failed":
        case "download_success":
            console.log("download status", msg);
            for (let mtab of managed_tabs) {
                if (mtab.identifier == msg.identifier) {
                    clearTimeout(mtab.timeoutId)
                    chrome.tabs.remove(mtab.tab.id);
                }
            }
            break;
        default:
            return false;
        }
        return true;
    });
}

(() => {
    tabManager();
})();