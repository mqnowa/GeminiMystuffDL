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

    const gridSelector = 'library-item-grid';
    const cardSelector = 'library-item-card';

    // グリッド要素にマウスが入ったタイミングでイベントを捕捉（委譲）
    document.addEventListener('mouseover', (e) => {
        const card = e.target.closest(cardSelector);

        // カードが存在し、かつボタンがまだ作られていなければ作成
        if (card && !card.querySelector('.dl-spy-btn')) {
            const btn = document.createElement('button');
            btn.className = 'dl-spy-btn';
            btn.innerText = '⬇️';

            // クリック時の処理（プレースホルダー）
            btn.onclick = (event) => {
                event.stopPropagation(); // カード側のクリックイベント発火を防ぐ
                const allCards = Array.from(card.parentNode.children);
                const index = allCards.indexOf(card);
                download(index);
            };

            card.appendChild(btn);
        }
    });

    console.log("fetch上書き完了");
})();