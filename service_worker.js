function tabManager() {
    var managed_tabs = {};
    chrome.runtime.onMessage.addListener(msg => {
        if (msg.gemdlAction == "openTab2DL") {
            chrome.tabs.create({
                url: request.url,
                active: false
            }, tab => {
                const toid = setTimeout(() => {
                    chrome.tabs.remove(tab.id, () => {
                        
                    })
                }, 60000);
            })
        }
    })
}

(() => {
    tabManager();
})();