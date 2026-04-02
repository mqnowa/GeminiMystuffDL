// mystuff_ui.js: /mystuff ページにおけるメニューUI描画や一括ダウンロードボタンなどのユーザ操作を管理するためのファイル
console.log("GeminiDL mystuff_ui.js");

(function() {
    let styleInjected = false;

    // マウスホバーイベントを監視してダウンロードボタンを動的に追加する
    document.addEventListener("mouseover", (e) => {
        // 1. 対象が library-item-card か確認
        const card = e.target.closest("library-item-card");
        if (!card) return;

        // 2. 最初のホバー時にのみボタンの表示用CSSを共通注入
        if (!styleInjected) {
            const root = document.head || document.documentElement;
            if (root) {
                const style = document.createElement("style");
                style.textContent = `
                    library-item-card {
                        position: relative;
                    }
                    .gemdl-dl-btn {
                        position: absolute;
                        top: 8px;
                        right: 8px;
                        z-index: 100;
                        background: rgba(0, 0, 0, 0.6);
                        color: white;
                        border-radius: 50%;
                        width: 32px;
                        height: 32px;
                        display: none;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    }
                    .gemdl-dl-btn:hover {
                        background: rgba(0, 0, 0, 0.8);
                        transform: scale(1.1);
                    }
                    library-item-card:hover .gemdl-dl-btn {
                        display: flex;
                    }
                `;
                root.appendChild(style);
                styleInjected = true;
            }
        }

        // 3. 既にボタンが追加されていれば何もしない
        if (card.querySelector(".gemdl-dl-btn")) return;

        // 4. 現在のカードの全体の中でのインデックスを取得 (gemdl_photosとの連動用)
        const allCards = Array.from(document.querySelectorAll("library-item-card"));
        const index = allCards.indexOf(card);
        if (index === -1) return;

        // 5. ダウンロードボタン(SVG)を生成してカード末尾に追加
        const btn = document.createElement("div");
        btn.className = "gemdl-dl-btn";
        btn.title = "この画像をダウンロード";

        // TrustedHTML エラーを回避するため、innerHTML ではなく createElementNS でSVGノードを構築
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("height", "20");
        svg.setAttribute("viewBox", "0 -960 960 960");
        svg.setAttribute("width", "20");
        svg.setAttribute("fill", "currentColor");
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z");
        
        svg.appendChild(path);
        btn.appendChild(svg);

        // ボタンのクリックイベント: 画像プレビューの発動を阻害し、独自のダウンロードのみ処理
        btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation(); 
            if (typeof gemdl_download === "function") {
                gemdl_download(index);
            } else {
                console.error("GeminiDL: gemdl_download function is not defined.");
            }
        });

        card.appendChild(btn);
    });
})();