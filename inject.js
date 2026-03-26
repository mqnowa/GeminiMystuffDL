// inject.js
// ページの Main World で実行され、fetch や XMLHttpRequest をフックする。

(function() {
    function extractAndSendIds(text) {
        if (!text) return;
        const regex1 = /\\u005B\\s*"c_([a-zA-Z0-9_-]+)"\\s*,\\s*"r_([a-zA-Z0-9_-]+)"/g;
        let match;
        const extracted = [];
        
        while ((match = regex1.exec(text)) !== null) {
            extracted.push({ chat_id: match[1], response_id: match[2] });
        }
        
        const regex2 = /\\["c_([a-zA-Z0-9_-]+)","r_([a-zA-Z0-9_-]+)"\\]/g;
        while ((match = regex2.exec(text)) !== null) {
            extracted.push({ chat_id: match[1], response_id: match[2] });
        }

        const uniqueIds = [];
        const seen = new Set();
        extracted.forEach(item => {
            const key = item.chat_id + "_" + item.response_id;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueIds.push(item);
            }
        });

        if (uniqueIds.length > 0) {
            window.postMessage({ type: "GEMINI_DL_IDS", ids: uniqueIds }, "*");
            console.log("[GeminiDL Inject] IDs sent:", uniqueIds.length);
        }
    }

    function scanHTML() {
        const scripts = document.querySelectorAll('script');
        scripts.forEach(s => {
            if (s.textContent.includes('c_') && s.textContent.includes('r_')) {
                extractAndSendIds(s.textContent);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanHTML);
    } else {
        scanHTML();
    }
    setTimeout(scanHTML, 2000);

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const url = typeof args[0] === 'string' ? args[0] : (args[0] ? args[0].url : "");
        if (url.includes('jGArJ') || url.includes('batchexecute')) {
            const clone = response.clone();
            clone.text().then(text => extractAndSendIds(text)).catch(e => console.error(e));
        }
        return response;
    };

    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.addEventListener('load', function() {
            const urlStr = typeof url === 'string' ? url : "";
            if (urlStr.includes('jGArJ') || urlStr.includes('batchexecute')) {
                extractAndSendIds(this.responseText);
            }
        });
        originalXhrOpen.call(this, method, url, ...rest);
    };

    console.log("[GeminiDL Inject] Network hooks installed in Main World.");
})();
