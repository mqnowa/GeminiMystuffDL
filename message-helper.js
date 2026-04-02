window.addEventListener("message", ev => {
    if (ev.source != window || !ev.data.gemdlAction) return;
    if (ev.data.loopBlock) return;
    chrome.runtime.sendMessage(ev.data);
})

chrome.runtime.onMessage.addListener(msg => {
    window.postMessage({...msg, loopBlock: true}, "*");
})