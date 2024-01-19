// ==UserScript==
// @name        komga-sync
// @version     1.0
// @author      lmaonator
// @description Sync manga chapter progress with tracking websites.
// @license     GPL-3.0-or-later
// @namespace   https://github.com/lmaonator/komga-sync
// @homepageURL https://github.com/lmaonator/komga-sync
// @supportURL  https://github.com/lmaonator/komga-sync/issues
// @downloadURL https://github.com/lmaonator/komga-sync/raw/main/komga-sync.user.js
// @match       http*://komga.*/*
// @match       http*://*/komga/*
// @match       https://lmaonator.github.io/komga-sync/auth-*.html*
// @grant       GM.xmlHttpRequest
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.deleteValue
// @grant       GM.openInTab
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
    const ANILIST_OAUTH = "https://anilist.co/api/v2/oauth";
    const ANILIST_API = "https://graphql.anilist.co";
    const DICLAM = "ZjE4NDIxNGY4MTg4Y2RmNzEwZmM4N2MwMzMzYzhlMGM";
    const DICLA = "MTYzNDc";

    if (document.title === "komga-sync MAL auth") {
        return malAuth();
    } else if (document.title === "komga-sync AniList auth") {
        return aniListAuth();
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

    setInterval(async () => {
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
                const button = createElement("button", {
                    className:
                        "v-btn v-btn--icon v-btn--round theme--dark v-size--default",
                    style: "width: 120px;",
                    textContent: "Komga Sync",
                });
                button.addEventListener("click", () => {
                    createUI(seriesId);
                    button.blur();
                });
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
                    ["AniList", updateAniListEntry],
                ];
                for (const [site, func] of sites) {
                    const link = chapter.links.find((i) => i.label === site);
                    if (link) {
                        try {
                            const r = await func(link.url, chapter.number);
                            if (r === true) {
                                console.log(
                                    prefix + "Successfully synced with " + site,
                                );
                            }
                        } catch (error) {
                            console.error(
                                prefix + "Error syncing with " + site,
                                error,
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

    // Check if tokens are expired based on documented expiration times
    const malTokenExpiresAt = await GM.getValue("mal_expires_at", null);
    if (malTokenExpiresAt !== null) {
        if (malTokenExpiresAt <= Date.now()) {
            await GM.deleteValue("mal_access_token");
            await GM.deleteValue("mal_expires_at");
            alert("MyAnimeList session has expired, please login again.");
        }
    }
    const alTokenExpiresAt = await GM.getValue("anilist_expires_at", null);
    if (alTokenExpiresAt !== null) {
        if (alTokenExpiresAt <= Date.now()) {
            await GM.deleteValue("anilist_access_token");
            await GM.deleteValue("anilist_expires_at");
            alert("AniList session has expired, please login again.");
        } else if (alTokenExpiresAt - 604800_000 <= Date.now()) {
            // 1 week before expiration
            alert("AniList session will expire soon, please login again.");
        }
    }

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
                onload: (response) => {
                    if (response.status === 401) {
                        GM.setValue("mu_session_token", "");
                        alert(
                            "MangaUpdates session expired, please login again.",
                        );
                    }
                    return resolve(response);
                },
                onerror: (error) => {
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

        const update = {
            series: {
                id: urlToId(url),
            },
            status: {
                chapter: chapterNum,
            },
        };
        let endpoint = "/lists/series";

        let r = await muRequest("/lists/series/" + urlToId(url), "GET");
        if (r.status === 404) {
            update.list_id = 0; // add to reading list
        } else {
            const current = JSON.parse(r.responseText);
            if (current.status.chapter >= chapterNum) {
                return true;
            }
            endpoint += "/update";
        }

        r = await muRequest(endpoint, "POST", [update]);
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
                        // MAL refresh tokens are valid for 1 month
                        GM.setValue("mal_expires_at", Date.now() + 2592000_000);
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
                onerror: (e) => {
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
            "/manga/" + mangaId + "?fields=my_list_status,num_chapters,status",
            "GET",
        );
        const data = JSON.parse(r.responseText);
        const status = data.my_list_status ?? {
            is_rereading: false,
            num_chapters_read: 0,
            status: "plan_to_read",
        };

        if (status.num_chapters_read >= chapterNum) {
            return true;
        }

        const update = {
            num_chapters_read: chapterNum,
        };

        const date = new Date().toISOString().substring(0, 10);

        if (status.status === "plan_to_read") {
            update.status = "reading";
            if (status.start_date === undefined) {
                update.start_date = date;
            }
        } else if (
            status.status === "reading" &&
            chapterNum >= data.num_chapters &&
            data.status === "finished"
        ) {
            update.status = "completed";
            if (status.finish_date === undefined) {
                update.finish_date = date;
            }
        }

        r = await malRequest(
            "/manga/" + mangaId + "/my_list_status",
            "PATCH",
            update,
        );
        if (r.status === 200) {
            return true;
        } else {
            return false;
        }
    }

    async function aniListRequest(query, variables) {
        const accessToken = await GM.getValue("anilist_access_token");
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                url: ANILIST_API,
                method: "POST",
                headers: {
                    Authorization: "Bearer " + accessToken,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                data: JSON.stringify({
                    query: query,
                    variables: variables,
                }),
                onload: async (r) => {
                    if (
                        r.status === 400 &&
                        r.responseText.includes("Invalid token")
                    ) {
                        await GM.deleteValue("anilist_access_token");
                        await GM.deleteValue("anilist_expires_at");
                        alert(
                            "AniList session has expired, please login again.",
                        );
                    }
                    return resolve(r);
                },
                onerror: (e) => {
                    console.error(e);
                    return reject(e);
                },
            });
        });
    }

    async function updateAniListEntry(url, chapterNum) {
        const aniListId = urlToId(url);
        chapterNum = Math.floor(chapterNum);

        let r = await aniListRequest(
            `
            query ($id: Int) {
                Media(id: $id, type: MANGA) {
                    id
                    chapters
                    mediaListEntry {
                        id
                        status
                        progress
                        repeat
                        startedAt {
                            year
                            month
                            day
                        }
                        completedAt {
                            year
                            month
                            day
                        }
                    }
                }
            }
            `,
            { id: aniListId },
        );
        let data = JSON.parse(r.responseText);
        if (data.errors?.length > 0) {
            console.error(data.errors);
            return false;
        }
        const manga = data.data.Media;
        const mle = manga.mediaListEntry;

        if (mle.progress >= chapterNum) {
            return true;
        }

        const date = new Date();
        const currentDate = {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
        };
        const vars = {
            progress: chapterNum,
        };
        if (manga.chapters == chapterNum) {
            vars.status = "COMPLETED";
            vars.completedAt = currentDate;
        } else {
            vars.status = "CURRENT";
        }

        if (mle === undefined) {
            // create new mediaListEntry
            vars.mediaId = aniListId;
            vars.startedAt = currentDate;
        } else if (
            ["CURRENT", "DROPPED", "PAUSED", "PLANNING"].includes(mle.status)
        ) {
            // update mediaListEntry
            vars.id = mle.id;
        } else {
            // already completed, do nothing
            return true;
        }
        r = await aniListRequest(
            `
            mutation (
                $id: Int, $mediaId: Int,
                $status: MediaListStatus, $progress: Int, $repeat: Int,
                $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput
            ) {
                SaveMediaListEntry (
                    id: $id, mediaId: $mediaId,
                    status: $status, progress: $progress, repeat: $repeat,
                    startedAt: $startedAt, completedAt: $completedAt
                ) {
                    id
                    mediaId
                    status
                    progress
                    repeat
                    startedAt {
                        year
                        month
                        day
                    }
                    completedAt {
                        year
                        month
                        day
                    }
                }
            }
            `,
            vars,
        );
        data = JSON.parse(r.responseText);
        if (data.errors?.length > 0) {
            console.error(data.errors);
            return false;
        } else {
            return true;
        }
    }

    // Create Shadow DOM
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const shadowStyle = document.createElement("style");
    shadowStyle.textContent = `
.modal {
    z-index: 300;
    position: fixed;
    padding-top: 100px;
    transform: translate(0, 0);
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
    width: auto;
    height: auto;
    overflow: auto;
    background-color: rgba(0, 0, 0, 0.8);
    overscroll-behavior: contain;
}

.content {
    font-family: Roboto, sans-serif;
    font-size: 16px;
    color: #ffffff;
    background-color: #121212;
    margin: auto;
    width: 80%;
    padding: 1em;
    border: 1px solid #696969;
    border-radius: 10px;
}

h2 {
    margin-top: 1em;
    margin-bottom: 1em;
}

label {
    display: inline-block;
    width: 120px;
}

button {
    background-color: #303030;
    border: 2px solid #303030;
    border-radius: 5px;
    color: #ffffff;
    padding: 6px 16px;
    text-align: center;
    text-decoration: none;
    display: inline-block;
    font-size: 16px;
    margin: 2px;
    transition-duration: 0.2s;
    cursor: pointer;
}

button:hover {
    background-color: #ffffff;
    color: #000000;
}

.login-button {
    width: 200px;
}

input[type=text],
input[type=url] {
    padding: 5px;
    margin: 2px;
    box-sizing: border-box;
    border: 1px solid #303030;
    border-radius: 5px;
    color: #ffffff;
    background-color: #303030;
    font-size: 16px;
    width: 100%;
    max-width: 800px;
}

a {
    text-decoration: none;
    color: #ffffff;
}

.resultList {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;"
}

.resultCard {
    border: 1px solid #000;
    background-color: #232323;
    flex-basis: 400px;
    flex-grow: 1;
}

.resultCard .thumb {
    float: left;
    margin-right: 4px;
    width: 106px;
}

.resultCard img {
    display: block;
    height: 150px;
    width: 106px;
    object-fit: contain;
}

.resultCard details {
    margin: 5px;
}

.resultCard summary {
    font-weight: bold;
}

.resultCard summary span {
    text-transform: capitalize;
}

.resultCard button {
    margin: 0.5em;
    padding: 3px 8px;
    border: 1px solid #404040;
    font-size: 14px;
}

.resultCard ul {
    margin-top: 0.25em;
    padding-left: 10px;
    list-style: inside;
    overflow: auto;
}`;
    shadow.appendChild(shadowStyle);

    async function createUI(seriesId) {
        // Create Modal Dialog
        modal = document.createElement("div");
        modal.classList.add("modal");

        const content = document.createElement("div");
        content.classList.add("content");
        modal.appendChild(content);

        function closeModalClick(e) {
            if (e.target == modal) {
                modal.remove();
                shadow.removeEventListener("click", closeModalClick);
                window.removeEventListener("keydown", closeModalKey);
            }
        }

        function closeModalKey(e) {
            if (e.code === "Escape") {
                modal.remove();
                shadow.removeEventListener("click", closeModalClick);
                window.removeEventListener("keydown", closeModalKey);
            }
        }

        shadow.addEventListener("click", closeModalClick);
        window.addEventListener("keydown", closeModalKey);

        // MangaUpdates login
        const muLogin = document.createElement("button");
        muLogin.textContent = "MangaUpdates Login";
        muLogin.className = "login-button";
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
                onload: async (response) => {
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
        malLogin.textContent = "MyAnimeList Login";
        malLogin.className = "login-button";
        content.appendChild(malLogin);
        malLogin.addEventListener("click", async () => {
            const state = randStr(16);
            const code_challenge = randStr(64);
            await GM.setValue("mal_state", state);
            await GM.setValue("mal_challenge", code_challenge);
            const params = new URLSearchParams({
                response_type: "code",
                client_id: atob(DICLAM),
                state,
                code_challenge,
                code_challenge_method: "plain",
            });
            GM.openInTab(AL_OAUTH + "/authorize?" + params.toString());
        });
        if ((await GM.getValue("mal_access_token", "")) !== "") {
            content.appendChild(document.createTextNode(" Logged in ✅"));
        }
        content.appendChild(document.createElement("br"));

        // AniList login
        const aniListLogin = document.createElement("button");
        aniListLogin.textContent = "AniList Login";
        aniListLogin.className = "login-button";
        content.appendChild(aniListLogin);
        aniListLogin.addEventListener("click", () => {
            const params = new URLSearchParams({
                client_id: atob(DICLA),
                response_type: "token",
            });
            GM.openInTab(ANILIST_OAUTH + "/authorize?" + params.toString());
        });
        if ((await GM.getValue("anilist_access_token", "")) !== "") {
            content.appendChild(document.createTextNode(" Logged in ✅"));
        }
        content.appendChild(document.createElement("br"));

        // get series metadata
        const r = await fetch("/api/v1/series/" + seriesId);
        const series = await r.json();

        const title = document.createElement("h2");
        title.textContent = series.metadata.title ?? series.name;
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
            root.appendChild(label);
            const urlInput = document.createElement("input");
            urlInput.type = "url";
            urlInput.value = url;
            root.appendChild(urlInput);
            const button = document.createElement("button");
            button.textContent = "Search " + name;
            root.appendChild(document.createElement("br"));
            return [urlInput, button];
        }

        const links = document.createElement("div");

        const [muUrlInput, muButton] = urlForm("MangaUpdates", urls.mu, links);
        const [malUrlInput, malButton] = urlForm(
            "MyAnimeList",
            urls.mal,
            links,
        );
        const [alUrlInput, alButton] = urlForm("AniList", urls.al, links);

        const searchLabel = document.createElement("label");
        searchLabel.textContent = "Search Term:";
        links.appendChild(searchLabel);
        const searchInput = document.createElement("input");
        searchInput.value = series.metadata.title ?? series.name;
        searchInput.type = "text";
        searchInput.size = "80";
        searchInput.style = "margin-top: 16px;";
        links.appendChild(searchInput);

        const buttonContainer = document.createElement("div");
        buttonContainer.style = "margin-top: 8px;";
        buttonContainer.appendChild(muButton);
        buttonContainer.appendChild(malButton);
        buttonContainer.appendChild(alButton);
        links.appendChild(buttonContainer);
        const note = document.createElement("div");
        note.style = "font-size: 14px; margin: 5px 2px;";
        note.textContent =
            " Note: AniList has MyAnimeList IDs for most entries, if MAL is still " +
            "missing it will also be added if available.";
        links.appendChild(note);
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
            if (r.status === 204) {
                series.metadata.links = links;
            }
        };

        const resultContainer = document.createElement("div");
        content.appendChild(resultContainer);

        const prepareResult = (name, note) => {
            resultContainer.innerHTML = "";
            const header = document.createElement("h3");
            header.textContent = name + " Results";
            header.style = "margin-top: 1em";
            header.style.marginBottom = note !== undefined ? "0.25em" : "1em";
            resultContainer.appendChild(header);
            if (note !== undefined) {
                createElement(
                    "div",
                    {
                        textContent: note,
                        style: "font-size: 14px; margin-bottom: 1em;",
                    },
                    resultContainer,
                );
            }
            const list = createElement(
                "div",
                { className: "resultList" },
                resultContainer,
            );
            return { header, list };
        };

        const resultCard = (picture, url, title, type, date, extra) => {
            type = type.replace("_", " ").toLowerCase();
            const card = createElement("div", { className: "resultCard" });
            const thumb = createElement("div", { className: "thumb" }, card);
            const img = createElement("img", { src: picture }, thumb);
            const details = createElement("details", {}, card);
            img.addEventListener("click", () => {
                details.toggleAttribute("open");
            });
            const summary = createElement(
                "summary",
                {
                    innerHTML: `${title} <a href="${url}" target="_blank">🔗</a>
                        <span>${type}</span> [${date}]`,
                },
                details,
            );
            details.insertAdjacentHTML("beforeend", extra ?? "");
            const button = createElement(
                "button",
                { textContent: "Set URL" },
                card,
            );
            return { card, button };
        };

        muButton.addEventListener("click", async () => {
            GM.xmlHttpRequest({
                url: MU_API + "/series/search",
                method: "POST",
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({
                    search: searchInput.value,
                }),
                onload: (response) => {
                    const data = JSON.parse(response.responseText);
                    const { header, list } = prepareResult("MangaUpdates");
                    for (const { record } of data.results) {
                        const { card, button } = resultCard(
                            record.image.url.thumb,
                            record.url,
                            record.title,
                            record.type,
                            record.year,
                        );
                        button.addEventListener("click", async () => {
                            muUrlInput.value = record.url;
                            await komgaSetLink("MangaUpdates", record.url);
                        });
                        list.appendChild(card);
                    }
                },
                onerror: (e) => console.error(e),
            });
        });

        malButton.addEventListener("click", async () => {
            const url = new URL(MAL_API + "/manga");
            url.searchParams.set("q", searchInput.value);
            url.searchParams.set(
                "fields",
                "start_date, media_type, alternative_titles",
            );
            url.searchParams.set("nsfw", "true");
            GM.xmlHttpRequest({
                url: url.toString(),
                method: "GET",
                headers: {
                    "X-MAL-CLIENT-ID": atob(DICLAM),
                },
                onload: (r) => {
                    const data = JSON.parse(r.responseText);
                    const { header, list } = prepareResult(
                        "MyAnimeList",
                        "Click on the series thumbnail or title to show synonyms.",
                    );
                    for (const { node } of data.data) {
                        const mangaUrl =
                            "https://myanimelist.net/manga/" + node.id;
                        const titles = node.alternative_titles;
                        const { card, button } = resultCard(
                            node.main_picture.medium,
                            mangaUrl,
                            node.title,
                            node.media_type,
                            node.start_date.slice(0, 4),
                            (titles.en !== "" ? titles.en + "<br>" : "") +
                                titles.ja +
                                (titles.synonyms.length > 0
                                    ? "<br><b>Synonyms:</b><ul>" +
                                      titles.synonyms.reduce(
                                          (acc, cur) => acc + `<li>${cur}</li>`,
                                          "",
                                      ) +
                                      "</ul>"
                                    : ""),
                        );
                        button.addEventListener("click", async () => {
                            malUrlInput.value = mangaUrl;
                            await komgaSetLink("MyAnimeList", mangaUrl);
                        });
                        list.appendChild(card);
                    }
                },
                onerror: (e) => console.error(e),
            });
        });

        alButton.addEventListener("click", async () => {
            const data = {
                query: `
                    query ($search: String) {
                        Page {
                            media(search: $search, type: MANGA) {
                            id
                            idMal
                            title {
                                romaji
                                english
                                native
                            }
                            format
                            startDate {
                                year
                            }
                            coverImage {
                                medium
                            }
                            synonyms
                            siteUrl
                            }
                        }
                    }
                `,
                variables: {
                    search: searchInput.value,
                },
            };
            GM.xmlHttpRequest({
                url: ANILIST_API,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                data: JSON.stringify(data),
                onload: (r) => {
                    const data = JSON.parse(r.responseText);
                    const { header, list } = prepareResult(
                        "AniList",
                        "Click on the series thumbnail or title to show synonyms.",
                    );
                    for (const m of data.data.Page.media) {
                        const { card, button } = resultCard(
                            m.coverImage.medium,
                            m.siteUrl,
                            m.title.english ?? m.title.romaji ?? m.title.native,
                            m.format,
                            m.startDate.year,
                            (m.title.romaji ? m.title.romaji + "<br>" : "") +
                                m.title.native +
                                (m.synonyms.length > 0
                                    ? "<br><b>Synonyms:</b><ul>" +
                                      m.synonyms.reduce(
                                          (acc, cur) => acc + `<li>${cur}</li>`,
                                          "",
                                      ) +
                                      "</ul>"
                                    : ""),
                        );
                        button.addEventListener("click", async () => {
                            await komgaSetLink("AniList", m.siteUrl);
                            alUrlInput.value = m.siteUrl;
                            if (m.idMal !== null && malUrlInput.value === "") {
                                const malUrl =
                                    "https://myanimelist.net/manga/" + m.idMal;
                                await komgaSetLink("MyAnimeList", malUrl);
                                malUrlInput.value = malUrl;
                            }
                        });
                        list.appendChild(card);
                    }
                },
                onerror: (e) => console.error(e),
            });
        });

        shadow.appendChild(modal);
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

    async function aniListAuth() {
        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.hash.slice(1));
        const access_token = params.get("access_token");
        if (access_token !== null) {
            await GM.setValue("anilist_access_token", access_token);
            await GM.setValue(
                "anilist_expires_at",
                parseInt(params.get("expires_in"), 10) * 1000 + Date.now(),
            );
            document.body.appendChild(
                document.createTextNode(
                    "Successfully authenticated with AniList ✅. You can now close this window.",
                ),
            );
        } else {
            document.body.appendChild(
                document.createTextNode(
                    "Failed to authenticate with AniList ⚠️. Please try again.",
                ),
            );
        }
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
        match = url.match(
            /^https:\/\/(?:www\.)?myanimelist\.net\/manga\/([^/]+)/i,
        );
        if (match) {
            return parseInt(match[1], 10);
        }
        match = url.match(/^https:\/\/(?:www\.)?anilist\.co\/manga\/([^/]+)/i);
        if (match) {
            return parseInt(match[1], 10);
        }
        throw new Error("Invalid URL");
    }

    function randStr(length) {
        const chars =
            "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let result = "";
        for (let i = length; i > 0; --i) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }

    /**
     * Creates a new element with optional attributes and optionally append to a parent
     * @param {String} tagName tag name, eg. div
     * @param {Object} attributes object with attributes, eg. { id: 'my-element' }
     * @param {Element} appendTo parent to which the new element should be appended to
     * @returns {Element} the created element
     */
    function createElement(tagName, attributes, appendTo) {
        el = document.createElement(tagName);
        if (attributes !== undefined) {
            for (const [key, value] of Object.entries(attributes)) {
                el[key] = value;
            }
        }
        if (appendTo !== undefined) appendTo.appendChild(el);
        return el;
    }
})();
