console.log("GeminiDL message-helper.js");

window.addEventListener("message", ev => {
    if (ev.source != window || !ev.data.gemdlAction) return;
    if (ev.data.loopBlock) return;
    chrome.runtime.sendMessage({...ev.data, loopBlock: true});
})

chrome.runtime.onMessage.addListener(msg => {
    if (msg.loopBlock) return;
    window.postMessage({...msg, loopBlock: true}, "*");
    return true;
});