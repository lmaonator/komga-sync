// ==UserScript==
// @name        komga-sync
// @namespace   https://github.com/lmaonator/komga-sync
// @grant       GM.xmlHttpRequest
// @grant       GM.getValue
// @grant       GM.setValue
// @match       http*://*komga*/*
// @match       http*://*/komga/*
// @version     1.0
// @author      lmaonator
// @description Sync chapter progress with MangaUpdates
// ==/UserScript==

(async () => {
    if (!document.title.startsWith("Komga")) return;

    const prefix = "[komga-sync] ";

    const API_MU = "https://api.mangaupdates.com/v1";

    const MALDI = "ZjE4NDIxNGY4MTg4Y2RmNzEwZmM4N2MwMzMzYzhlMGM";

    const chapter = {
        id: "",
        title: "",
        number: "0",
        pagesCount: 0,
        seriesId: "",
        seriesTitle: "",
        completed: false,
        links: [],
    };

    let buttonInserted = false;

    let interval = setInterval(async () => {
        // book/<id>/read?page=1&incognito=false
        const url = new URL(window.location.href);

        let match = url.pathname.match(/series\/([^/]+)/);
        if (match) {
            const seriesId = match[1];
            if (!buttonInserted) {
                // Add UI button :3
                const button = document.createElement("button");
                button.innerText = "Komga Sync";
                button.className =
                    "v-btn v-btn--icon v-btn--round theme--dark v-size--default";
                button.style = "width: 120px;";
                const spacer = document.querySelector(
                    "main header > div.v-toolbar__content div.spacer",
                );
                button.addEventListener("click", async () =>
                    createUI(seriesId),
                );
                spacer.parentNode.insertBefore(button, spacer.nextSibling);
                buttonInserted = true;
            }
        } else {
            buttonInserted = false;
        }

        match = url.pathname.match(/book\/([^/]+)\/read/);
        if (match) {
            // Check for chapter change
            if (chapter.id !== match[1]) {
                chapter.id = match[1];
                // get book metadata
                let r = await fetch("/api/v1/books/" + chapter.id);
                let data = await r.json();
                chapter.title = data.metadata.title;
                chapter.number = data.metadata.number;
                chapter.pagesCount = data.media.pagesCount;
                chapter.seriesId = data.seriesId;
                chapter.seriesTitle = data.seriesTitle;
                chapter.completed = false;
                console.log(
                    prefix +
                        "Chapter opened: " +
                        chapter.seriesTitle +
                        " " +
                        chapter.number +
                        ": " +
                        chapter.title,
                );
                // get series metadata for links
                r = await fetch("/api/v1/series/" + chapter.seriesId);
                data = await r.json();
                chapter.links = data.metadata.links;
            }

            // Only sync if not incognito
            if (url.searchParams.get("incognito") !== "false") {
                return;
            }

            if (
                !chapter.completed &&
                Number(url.searchParams.get("page")) == chapter.pagesCount
            ) {
                chapter.completed = true;
                console.log(prefix + "Chapter complete, syncing..");
                const muLink = chapter.links.find(
                    (i) => i.label === "MangaUpdates",
                );
                if (muLink) {
                    if (
                        (await updateMuListSeries(
                            muLink.url,
                            chapter.number,
                        ).catch(() => false)) === true
                    ) {
                        console.log(
                            prefix + "Successfully synced with MangaUpdates",
                        );
                    }
                }
            }
        } else if (chapter.id !== "") {
            console.log(prefix + "Chapter closed");
            chapter.id = "";
        }
    }, 500);

    async function muRequest(endpoint, method, data) {
        const token = await GM.getValue("mu_session_token");
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                url: API_MU + endpoint,
                method,
                headers: {
                    Authorization: "Bearer " + token,
                    "Content-Type": "application/json",
                },
                data: data !== undefined ? JSON.stringify(data) : undefined,
                onload: function (response) {
                    if (response.status === 401) {
                        GM.setValue("mu_session_token", "");
                        alert(
                            "MangaUpdates session expired, please login again.",
                        );
                    }
                    resolve(response);
                },
                onerror: function (error) {
                    console.error(error);
                    reject(error);
                },
            });
        });
    }

    async function updateMuListSeries(url, chapterNum) {
        chapterNum = Math.floor(chapterNum);

        const token = await GM.getValue("mu_session_token", "");
        if (token === "") {
            return false;
        }

        let r = await muRequest("/lists/series/" + urlToSeriesId(url), "GET");
        const current = JSON.parse(r.responseText);
        if (current.status.chapter >= chapterNum) {
            return true;
        }

        r = await muRequest("/lists/series/update", "POST", [
            {
                series: {
                    id: urlToSeriesId(url),
                },
                status: {
                    chapter: chapterNum,
                },
            },
        ]);
        if (r.status === 200) {
            return true;
        } else {
            return false;
        }
    }

    /** @type {HTMLDivElement } */
    let modal = null;

    async function createUI(seriesId) {
        // Create Modal Dialog
        modal = document.createElement("div");
        modal.style =
            "z-index: 300; position: fixed; padding-top: 100px; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.4);";

        const content = document.createElement("div");
        content.style =
            "font-family: sans-serif; color: #000; background-color: #fff; margin: auto; padding: 1em; border: 1px solid #AAA; width: 80%;";
        modal.appendChild(content);

        const closeModal = (e) => {
            if (e.target == modal) {
                modal.remove();
                window.removeEventListener("click", closeModal);
            }
        };

        window.addEventListener("click", closeModal);

        // MangaUpdates login
        const muLogin = document.createElement("button");
        muLogin.innerText = "MangaUpdates Login";
        muLogin.style = "all: revert;";
        content.appendChild(muLogin);
        muLogin.addEventListener("click", async () => {
            const username = prompt("MangaUpdates username:");
            const password = prompt("MangaUpdates password:");
            GM.xmlHttpRequest({
                url: API_MU + "/account/login",
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({
                    username,
                    password,
                }),
                onload: async function (response) {
                    const data = JSON.parse(response.responseText);
                    if (data.status === "success") {
                        await GM.setValue(
                            "mu_session_token",
                            data.context.session_token,
                        );
                        await GM.setValue("mu_uid", data.context.uid);
                        console.log(prefix + "MangaUpdates login successful");
                    }
                },
            });
        });
        if ((await GM.getValue("mu_session_token", "")) !== "") {
            content.appendChild(document.createTextNode(" Logged in ✅"));
        }

        // get series metadata
        const r = await fetch("/api/v1/series/" + seriesId);
        const series = await r.json();

        const title = document.createElement("h2");
        title.textContent = series.metadata.title ?? series.name;
        title.style = "margin-top: 1em; margin-bottom: 1em;";
        content.appendChild(title);

        const urls = {
            mu: "",
            mal: "",
            al: "",
        };

        for (const link of series.metadata.links) {
            switch (link.label) {
                case "MangaUpdates":
                    urls.mu = link.url;
                    break;
                case "MyAnimeList":
                    urls.mal = link.url;
                    break;
                case "AniList":
                    urls.al = link.url;
                    break;
            }
            // fallback selection
            let url = new URL(link.url);
            switch (url.hostname) {
                case "mangaupdates.com":
                case "www.mangaupdates.com":
                    if (!urls.mu) urls.mu = link.url;
                    break;
                case "myanimelist.net":
                case "www.myanimelist.net":
                    if (!urls.mal) urls.mal = link.url;
                    break;
                case "anilist.co":
                case "www.anilist.co":
                    if (!urls.al) urls.al = link.url;
                    break;
            }
        }

        function urlForm(name, url, root) {
            const label = document.createElement("label");
            label.textContent = name;
            label.style = "display: inline-block; width: 120px;";
            root.appendChild(label);
            const urlInput = document.createElement("input");
            urlInput.type = "url";
            urlInput.value = url;
            urlInput.size = "80";
            urlInput.style = "all: revert;";
            root.appendChild(urlInput);
            const searchLabel = document.createElement("label");
            searchLabel.textContent = "Search Term:";
            searchLabel.style = "margin-left: 5px;";
            root.appendChild(searchLabel);
            const searchInput = document.createElement("input");
            searchInput.value = series.metadata.title ?? series.name;
            searchInput.type = "text";
            searchInput.size = "24";
            searchInput.style = "all: revert; margin-left: 3px;";
            root.appendChild(searchInput);
            const button = document.createElement("button");
            button.textContent = "Search " + name;
            button.style = "all: revert; margin: 3px;";
            root.appendChild(button);
            const br = document.createElement("br");
            root.appendChild(br);
            return [urlInput, searchInput, button];
        }

        const links = document.createElement("div");
        const [muUrlInput, muSearchInput, muButton] = urlForm(
            "MangaUpdates",
            urls.mu,
            links,
        );
        const [malUrlInput, malSearchInput, malButton] = urlForm(
            "MyAnimeList",
            urls.mal,
            links,
        );
        const [alUrlInput, alSearchInput, alButton] = urlForm(
            "AniList",
            urls.al,
            links,
        );
        content.appendChild(links);

        const komgaSetLink = async (label, url) => {
            const links = series.metadata.links.filter(
                (i) => i.label !== label,
            );
            links.push({ label, url });
            const r = await fetch("/api/v1/series/" + seriesId + "/metadata", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    links,
                }),
            });
        };

        muButton.addEventListener("click", async () => {
            GM.xmlHttpRequest({
                url: API_MU + "/series/search",
                method: "POST",
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({
                    search: muSearchInput.value,
                }),
                onload: function (response) {
                    const data = JSON.parse(response.responseText);
                    const header = document.createElement("h3");
                    header.textContent = "MangaUpdates Results";
                    header.style = "margin-bottom: 1em; margin-top: 1em";
                    content.appendChild(header);
                    const list = document.createElement("div");
                    list.style =
                        "display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5em";
                    for (const result of data.results) {
                        const record = result.record;
                        const r = document.createElement("div");
                        r.style = "border: 1px solid #000;";
                        r.innerHTML = `
                            <img src="${record.image.url.thumb}" style="float: left;">
                            <div style="display: inline-block; padding: 5px;">
                                <a href="${record.url}" target="_blank">${record.title}</a><br>
                                ${record.type} [${record.year}]<br>
                            </div><br>
                        `;
                        const btn = document.createElement("button");
                        btn.textContent = "Set URL";
                        btn.style =
                            "all: revert; margin: 5px; margin-top: 1em;";
                        btn.addEventListener("click", async () => {
                            muUrlInput.value = record.url;
                            muSearchInput.value = record.title;
                            await komgaSetLink("MangaUpdates", record.url);
                            header.remove();
                            list.remove();
                        });
                        r.appendChild(btn);
                        list.appendChild(r);
                    }
                    content.appendChild(list);
                },
            });
        });

        document.body.appendChild(modal);
    }

    function urlToSeriesId(url) {
        const match = url.match(
            /^https:\/\/(?:www\.)?mangaupdates\.com\/series\/([^/]+)/i,
        );
        if (match) {
            // https://www.mangaupdates.com/topic/4sw0ahm/mangaupdates-api-comments-suggestions-bugs?post=797158
            // Manick: The 7 character strings are just base 36 encoded versions of the new ID.
            return parseInt(match[1], 36);
        }
    }
})();
