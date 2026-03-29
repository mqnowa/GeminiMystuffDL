(function () {
    var photos = [];
    fetchSpy(
        /.+\/batchexecute.+rpcids=jGArJ.+/,
        (text) => {
            let resBody = parseBatchexecuteResponse(text);
            if (resBody.length == 2) {
                for (var info of resBody[0]) {
                    var [cid, rid] = info[0];
                    photos.push([cid.slice(2), rid.slice(2)]);
                }
            }
            console.log(photos.length);
        }
    );

    function download(index) {
        const [cid, rid] = photos[index];
        const url = "https://gemini.google.com/app/" + cid + "#" + rid;
        // window.open(url + "?dl=true", '_blank');
        window.postMessage({
            action: "open_background_tab",
            url: url + "?dl=true"
        }, "*")
    }

    const cardSelector = '.library-item-card';

    // グリッド要素にマウスが入ったタイミングでイベントを捕捉（委譲）
    document.addEventListener('mouseover', (e) => {
        const card = e.target.closest(cardSelector);

        // カードが存在し、かつボタンがまだ作られていなければ作成
        if (card && !card.querySelector('.dl-spy-btn')) {
            const btn = document.createElement('button');
            btn.className = 'dl-spy-btn';

            // SVGアイコンをDOM APIで作成 (Trusted Types回避のため innerHTML は不使用)
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M12 16l-5-5h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z');
            svg.appendChild(path);
            btn.appendChild(svg);

            // クリック時の処理
            btn.onclick = (event) => {
                event.stopPropagation(); // カード側のクリックイベント発火を防ぐ
                const allCards = Array.from(document.querySelectorAll(cardSelector));
                const index = allCards.indexOf(card);
                download(index);
            };

            card.appendChild(btn);
        }
    });

    console.log("fetch上書き完了");
})();