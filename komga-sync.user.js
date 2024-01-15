// ==UserScript==
// @name        komga-sync
// @namespace   https://github.com/lmaonator/komga-sync
// @grant       GM.xmlHttpRequest
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.deleteValue
// @grant       GM.openInTab
// @match       http*://komga.*/*
// @match       http*://*/komga/*
// @match       https://lmaonator.github.io/komga-sync/auth-*.html*
// @version     1.0
// @author      lmaonator
// @description Sync manga chapter progress with tracking websites.
// @license     GPL-3.0-or-later
// @homepageURL https://github.com/lmaonator/komga-sync
// @supportURL  https://github.com/lmaonator/komga-sync/issues
// @downloadURL https://github.com/lmaonator/komga-sync/raw/main/komga-sync.user.js
// ==/UserScript==
//
// komga-sync: a userscript to sync manga chapter progress with tracking websites.
// Copyright (C) 2024  lmaonator
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//

(async () => {
    const prefix = "[komga-sync] ";
    const MU_API = "https://api.mangaupdates.com/v1";
    const MAL_OAUTH = "https://myanimelist.net/v1/oauth2";
    const MAL_API = "https://api.myanimelist.net/v2";
    const DICLAM = "ZjE4NDIxNGY4MTg4Y2RmNzEwZmM4N2MwMzMzYzhlMGM";

    if (document.title === "komga-sync MAL auth") {
        return malAuth();
    }

    if (!document.title.startsWith("Komga")) return;

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
                const spacer = document.querySelector(
                    "main header > div.v-toolbar__content div.spacer",
                );
                // sometimes the interval fires before the page is fully rendered
                if (spacer === null) {
                    return;
                }
                // Add UI button :3
                const button = document.createElement("button");
                button.innerText = "Komga Sync";
                button.className =
                    "v-btn v-btn--icon v-btn--round theme--dark v-size--default";
                button.style = "width: 120px;";
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

                const sites = [
                    ["MangaUpdates", updateMuListSeries],
                    ["MyAnimeList", updateMalListStatus],
                ];
                for (const [site, func] of sites) {
                    const link = chapter.links.find((i) => i.label === site);
                    if (link) {
                        const r = await func(url, chapter.number).catch(
                            () => false,
                        );
                        if (r === true) {
                            console.log(
                                prefix + "Successfully synced with " + site,
                            );
                        }
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
                url: MU_API + endpoint,
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
                    return resolve(response);
                },
                onerror: function (error) {
                    console.error(error);
                    return reject(error);
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

        let r = await muRequest("/lists/series/" + urlToId(url), "GET");
        const current = JSON.parse(r.responseText);
        if (current.status.chapter >= chapterNum) {
            return true;
        }

        r = await muRequest("/lists/series/update", "POST", [
            {
                series: {
                    id: urlToId(url),
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

    async function malToken(code, code_verifier) {
        const params = {
            client_id: atob(DICLAM),
            client_secret: "",
        };
        if (code !== undefined && code_verifier !== undefined) {
            Object.assign(params, {
                grant_type: "authorization_code",
                code,
                code_verifier,
            });
        } else {
            Object.assign(params, {
                grant_type: "refresh_token",
                refresh_token: await GM.getValue("mal_refresh_token"),
            });
        }
        const data = new URLSearchParams(params).toString();
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                url: MAL_OAUTH + "/token",
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data,
                onload: (r) => {
                    if (r.status === 200) {
                        const data = JSON.parse(r.responseText);
                        GM.setValue("mal_access_token", data.access_token);
                        GM.setValue("mal_refresh_token", data.refresh_token);
                        return resolve(true);
                    }
                    alert("MyAnimeList session expired, please login again.");
                    console.error(r);
                    return resolve(false);
                },
                onerror: (e) => {
                    console.error(e);
                    return reject(false);
                },
            });
        });
    }

    async function malRequest(endpoint, method, params) {
        const access_token = await GM.getValue("mal_access_token");
        let data = params;
        if (data !== undefined) {
            data = new URLSearchParams(data).toString();
        }
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                url: MAL_API + endpoint,
                method,
                headers: {
                    Authorization: "Bearer " + access_token,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data,
                onload: async (r) => {
                    if (r.status === 401) {
                        if (await malToken()) {
                            return malRequest(endpoint, method, params);
                        }
                    }
                    return resolve(r);
                },
                onerror: function (e) {
                    console.error(e);
                    return reject(e);
                },
            });
        });
    }

    async function updateMalListStatus(url, chapterNum) {
        const mangaId = urlToId(url);
        chapterNum = Math.floor(chapterNum);

        let r = await malRequest(
            "/manga/" + mangaId + "?fields=my_list_status",
            "GET",
        );
        let data = JSON.parse(r.responseText);
        if (data.my_list_status.num_chapters_read >= chapterNum) {
            return true;
        }

        r = await malRequest("/manga/" + mangaId + "/my_list_status", "PATCH", {
            num_chapters_read: chapterNum,
        });
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
        muLogin.style = "all: revert; margin: 3px;";
        content.appendChild(muLogin);
        muLogin.addEventListener("click", async () => {
            const username = prompt("MangaUpdates username:");
            const password = prompt("MangaUpdates password:");
            GM.xmlHttpRequest({
                url: MU_API + "/account/login",
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
        content.appendChild(document.createElement("br"));

        // MyAnimeList login
        const malLogin = document.createElement("button");
        malLogin.innerText = "MyAnimeList Login";
        malLogin.style = "all: revert; margin: 3px;";
        content.appendChild(malLogin);
        malLogin.addEventListener("click", async () => {
            const state = randStr(16);
            const challenge = randStr(64);
            await GM.setValue("mal_state", state);
            await GM.setValue("mal_challenge", challenge);
            GM.openInTab(
                MAL_OAUTH +
                    "/authorize?response_type=code&client_id=" +
                    atob(DICLAM) +
                    "&state=" +
                    state +
                    "&code_challenge=" +
                    challenge +
                    "&code_challenge_method=plain",
            );
        });
        if ((await GM.getValue("mal_access_token", "")) !== "") {
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
            const button = document.createElement("button");
            button.textContent = "Search " + name;
            button.style = "all: revert; margin: 3px;";
            root.appendChild(button);
            root.appendChild(document.createElement("br"));
            return [urlInput, button];
        }

        const links = document.createElement("div");
        const searchLabel = document.createElement("label");
        searchLabel.textContent = "Search Term:";
        searchLabel.style = "display: inline-block; width: 120px;";
        links.appendChild(searchLabel);
        const searchInput = document.createElement("input");
        searchInput.value = series.metadata.title ?? series.name;
        searchInput.type = "text";
        searchInput.size = "80";
        searchInput.style = "all: revert; margin-bottom: 0.75em;";
        links.appendChild(searchInput);
        links.appendChild(document.createElement("br"));

        const [muUrlInput, muButton] = urlForm("MangaUpdates", urls.mu, links);
        const [malUrlInput, malButton] = urlForm(
            "MyAnimeList",
            urls.mal,
            links,
        );
        const [alUrlInput, alButton] = urlForm("AniList", urls.al, links);
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

        const resultContainer = (name) => {
            const header = document.createElement("h3");
            header.textContent = name + " Results";
            header.style = "margin-bottom: 1em; margin-top: 1em";
            content.appendChild(header);
            const list = document.createElement("div");
            list.style =
                "display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5em";
            content.appendChild(list);
            return { header, list };
        };

        muButton.addEventListener("click", async () => {
            GM.xmlHttpRequest({
                url: MU_API + "/series/search",
                method: "POST",
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({
                    search: searchInput.value,
                }),
                onload: function (response) {
                    const data = JSON.parse(response.responseText);
                    const { header, list } = resultContainer("MangaUpdates");
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
                            await komgaSetLink("MangaUpdates", record.url);
                            header.remove();
                            list.remove();
                        });
                        r.appendChild(btn);
                        list.appendChild(r);
                    }
                },
            });
        });

        malButton.addEventListener("click", async () => {
            const url = new URL(MAL_API + "/manga");
            url.searchParams.set("q", searchInput.value);
            url.searchParams.set("fields", "start_date, media_type");
            GM.xmlHttpRequest({
                url: url.toString(),
                method: "GET",
                headers: {
                    "X-MAL-CLIENT-ID": atob(DICLAM),
                },
                onload: (r) => {
                    const data = JSON.parse(r.responseText);
                    const { header, list } = resultContainer("MyAnimeList");
                    for (const { node } of data.data) {
                        const r = document.createElement("div");
                        r.style = "border: 1px solid #000;";
                        const mangaUrl =
                            "https://myanimelist.net/manga/" + node.id;
                        r.innerHTML = `
                            <img src="${node.main_picture.medium}" style="float: left;">
                            <div style="display: inline-block; padding: 5px;">
                                <a href="${mangaUrl}" target="_blank">${node.title}</a><br>
                                ${node.media_type} [${node.start_date}]<br>
                            </div><br>
                        `;
                        const btn = document.createElement("button");
                        btn.textContent = "Set URL";
                        btn.style =
                            "all: revert; margin: 5px; margin-top: 1em;";
                        btn.addEventListener("click", async () => {
                            malUrlInput.value = mangaUrl;
                            await komgaSetLink("MyAnimeList", mangaUrl);
                            header.remove();
                            list.remove();
                        });
                        r.appendChild(btn);
                        list.appendChild(r);
                    }
                },
                onerror: (e) => console.log(e),
            });
        });

        document.body.appendChild(modal);
    }

    async function malAuth() {
        const url = new URL(window.location.href);
        const state = await GM.getValue("mal_state");
        if (url.searchParams.get("state") !== state) {
            document.body.appendChild(
                document.createTextNode(
                    "Error: Authorization state does not match",
                ),
            );
            return;
        }
        const challenge = await GM.getValue("mal_challenge");
        const code = url.searchParams.get("code");
        const r = await malToken(code, challenge).catch(() => false);
        if (r) {
            document.body.appendChild(
                document.createTextNode(
                    "Successfully authenticated with MyAnimeList ✅. You can now close this window.",
                ),
            );
        } else {
            document.body.appendChild(
                document.createTextNode(
                    "Failed to authenticate with MyAnimeList ⚠️. Error details were logged to console.",
                ),
            );
        }
        GM.deleteValue("mal_state");
        GM.deleteValue("mal_challenge");
    }

    function urlToId(url) {
        let match = url.match(
            /^https:\/\/(?:www\.)?mangaupdates\.com\/series\/([^/]+)/i,
        );
        if (match) {
            // https://www.mangaupdates.com/topic/4sw0ahm/mangaupdates-api-comments-suggestions-bugs?post=797158
            // Manick: The 7 character strings are just base 36 encoded versions of the new ID.
            return parseInt(match[1], 36);
        }
        match = url.match(/^https:\/\/myanimelist\.net\/manga\/([^/]+)/i);
        if (match) {
            return parseInt(match[1], 10);
        }
    }

    function randStr(length) {
        const chars =
            "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var result = "";
        for (var i = length; i > 0; --i) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }
})();
