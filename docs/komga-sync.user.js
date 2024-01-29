// ==UserScript==
// @name        komga-sync
// @version     1.2.0
// @author      lmaonator
// @description Sync manga chapter progress with tracking websites.
// @license     GPL-3.0-or-later
// @homepageURL https://lmaonator.github.io/komga-sync/
// @downloadURL https://lmaonator.github.io/komga-sync/komga-sync.user.js
// @supportURL  https://github.com/lmaonator/komga-sync/issues
// @namespace   https://github.com/lmaonator/komga-sync
// @match       http*://komga.*/*
// @match       http*://*/komga/*
// @match       https://lmaonator.github.io/komga-sync/auth-*.html*
// @grant       GM.xmlHttpRequest
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.deleteValue
// @grant       GM.openInTab
// ==/UserScript==
(function () {
    'use strict';

    /**
     * Conversion of Mihon App's ChapterRecognition.kt from Kotlin to JS
     * with additional removal of year and resolution tags.
     */
    const chapterRecognition = {
        NUMBER_PATTERN: "([0-9]+)(.[0-9]+)?(.?[a-z]+)?",

        /**
         * All cases with Ch.xx
         * Mokushiroku Alice Vol.1 Ch. 4: Misrepresentation -R> 4
         */
        get basic() {
            return new RegExp(`(?<=ch\\.) *${this.NUMBER_PATTERN}`);
        },

        /**
         * Example: Bleach 567: Down With Snowwhite -R> 567
         */
        get number() {
            return new RegExp(this.NUMBER_PATTERN);
        },

        /**
         * Regex used to remove unwanted tags
         * Example Prison School 12 v.1 vol004 version1243 volume64 -R> Prison School 12
         */
        unwanted: /\b(?:v|ver|vol|version|volume|season|s)[^a-z]?[0-9]+/g,

        /**
         * Regex used to remove unwanted whitespace
         * Example One Piece 12 special -R> One Piece 12special
         */
        unwantedWhiteSpace: /\s(?=extra|special|omake)/g,

        /**
         * Regex used to remove unwanted year like "(2024)"
         */
        unwantedYear: /[([][^)\]]*(?:19|20)\d\d(?:[-.]\d\d)?[-. )\]]/g,

        /**
         * Regex used to remove unwated resolution tags like "(x3200)"
         */
        unwantedRsolution: /\(x\d{4}\)/g,

        /**
         *
         * @param {string} mangaTitle
         * @param {string} chapterName
         * @returns {number}
         */
        parseChapterNumber: function (mangaTitle, chapterName) {
            // Get chapter title with lower case
            let name = chapterName.toLowerCase();

            // Remove manga title from chapter title.
            name = name.replaceAll(mangaTitle.toLowerCase(), "").trim();

            // Turn underscores into spaces
            name = name.replaceAll("_", " ");

            // Remove unwanted year.
            name = name.replaceAll(this.unwantedYear, "");

            // Remove unwanted resolution.
            name = name.replaceAll(this.unwantedRsolution, "");

            // Remove comma's or hyphens.
            name = name.replaceAll(",", ".").replaceAll("-", ".");

            // Remove unwanted white spaces.
            name = name.replaceAll(this.unwantedWhiteSpace, "");

            // Remove unwanted tags.
            name = name.replaceAll(this.unwanted, "");

            // Check base case ch.xx
            let match = name.match(this.basic);
            if (match !== null) {
                const num = this.getChapterNumberFromMatch(match);
                if (!isNaN(num)) {
                    return num;
                }
            }

            // Take the first number encountered.
            match = name.match(this.number);
            if (match !== null) {
                const num = this.getChapterNumberFromMatch(match);
                if (!isNaN(num)) {
                    return num;
                }
            }

            return -1;
        },

        /**
         * Check if chapter number is found and return it
         * @param {RegExpMatchArray} result of regex
         * @return {number} chapter number if found else null
         */
        getChapterNumberFromMatch: function (match) {
            let initial = Number(match[1]);
            let subChapterDecimal = match[2] ?? null;
            let subChapterAlpha = match[3] ?? null;
            let addition = this.checkForDecimal(subChapterDecimal, subChapterAlpha);
            return initial + addition;
        },

        /**
         * Check for decimal in received strings
         * @param {string | null} decimal decimal value of regex
         * @param {string | null} alpha alpha value of regex
         * @return {number} decimal/alpha float value
         */
        checkForDecimal: function (decimal, alpha) {
            if (decimal !== null && decimal !== "") {
                return Number(decimal);
            }

            if (alpha !== null && alpha !== "") {
                if (alpha.includes("extra")) {
                    return 0.99;
                }

                if (alpha.includes("omake")) {
                    return 0.98;
                }

                if (alpha.includes("special")) {
                    return 0.97;
                }

                const trimmedAlpha = alpha.replace(/^\.+/, "");
                if (trimmedAlpha.length == 1) {
                    return this.parseAlphaPostFix(trimmedAlpha[0]);
                }
            }

            return 0.0;
        },

        /**
         * x.a -> x.1, x.b -> x.2, etc
         * @param {string} alpha
         * @return {number}
         */
        parseAlphaPostFix: function (alpha) {
            const number = alpha.charCodeAt() - ("a".charCodeAt() - 1);
            if (number >= 10) return 0.0;
            return number / 10.0;
        },
    };

    /**
     * Adds a row displaying the parsed chapter number to the book DOM.
     *
     * @returns {boolean} Success
     */
    function addChapterParsePreview() {
        const container = document.querySelector(
            "div.container.pa-6.container--fluid",
        );

        if (container === null) {
            return false;
        }

        const fileName = Array.from(container.children)
            .find((e) => e.firstChild.textContent === "FILE")
            .lastChild.textContent.split(/\/|\\/)
            .pop();
        const title =
            container
                .querySelector("a.link-underline.text-h5")
                .textContent.trim() ?? "";
        const number = chapterRecognition.parseChapterNumber(title, fileName);

        const row = document.createElement("div");
        row.className = "row align-center text-caption";
        const label = document.createElement("div");
        label.className = "py-1 text-uppercase col-sm-3 col-md-2 col-xl-1 col-4";
        const value = document.createElement("div");
        value.className = "py-1 col-sm-9 col-md-10 col-xl-11 col-8";

        label.textContent = "Parsed Chapter";
        value.textContent = number;

        row.appendChild(label);
        row.appendChild(value);
        container.appendChild(row);
        return true;
    }

    const ANILIST_OAUTH = "https://anilist.co/api/v2/oauth";
    const ANILIST_API = "https://graphql.anilist.co";
    const DICLA = "MTYzNDc";

    async function getAniListToken() {
        return await GM.getValue("anilist_access_token");
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
                        alert("AniList session has expired, please login again.");
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

    async function updateAniListEntry(aniListId, chapterNum) {
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

    function openAniListOAuth() {
        const params = new URLSearchParams({
            client_id: atob(DICLA),
            response_type: "token",
        });
        GM.openInTab(ANILIST_OAUTH + "/authorize?" + params.toString());
    }

    async function handleAniListOAuthRedirect() {
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

    async function checkAniListTokenExpiration() {
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
    }

    async function searchAniList(searchTerm) {
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
                search: searchTerm,
            },
        };
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                url: ANILIST_API,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                data: JSON.stringify(data),
                onload: (r) => resolve(JSON.parse(r.responseText)),
                onerror: reject,
            });
        });
    }

    const aniList = {
        getToken: getAniListToken,
        checkTokenExpiration: checkAniListTokenExpiration,
        openOAuth: openAniListOAuth,
        handleOAuthRedirect: handleAniListOAuthRedirect,
        updateEntry: updateAniListEntry,
        search: searchAniList,
    };

    function seriesDefault() {
        return {
            parseFileForChapterNumber: null,
        };
    }

    async function loadConfig() {
        const config = {
            parseFileForChapterNumber: false,
            series: {},
        };
        Object.assign(config, JSON.parse(await GM.getValue("config", "{}")));
        return config;
    }

    async function saveConfig(config) {
        await GM.setValue("config", JSON.stringify(config));
    }

    function parseFileForChapterNumber(config, seriesId) {
        const seriesConfig = config.series[seriesId];
        if (seriesConfig === undefined) {
            return config.parseFileForChapterNumber;
        }
        if (seriesConfig.parseFileForChapterNumber === null) {
            return config.parseFileForChapterNumber;
        }
        return seriesConfig.parseFileForChapterNumber;
    }

    function createGlobalConfigDOM(config) {
        const container = document.createElement("div");
        container.insertAdjacentHTML(
            "afterbegin",
            `
<div class="global-conf-title">Global Configuration</div>
<div>
    <span>Chapter Number Source:</span>
    <input type="radio" name="config-parse-file" id="config-parse-file-komga"
        value="komga" ${config.parseFileForChapterNumber === false ? "checked" : ""}>
    <label for="config-parse-file-komga">Komga</label>
    <input type="radio" name="config-parse-file" id="config-parse-file-file"
        value="file" ${config.parseFileForChapterNumber === true ? "checked" : ""}>
    <label for="config-parse-file-file">Parse Filename</label>
</div>`,
        );

        function parseFileRadioClick(e) {
            switch (e.target.value) {
                case "komga":
                    config.parseFileForChapterNumber = false;
                    break;
                case "file":
                    config.parseFileForChapterNumber = true;
                    break;
            }
            saveConfig(config);
        }

        container
            .querySelector("#config-parse-file-komga")
            .addEventListener("change", parseFileRadioClick);
        container
            .querySelector("#config-parse-file-file")
            .addEventListener("change", parseFileRadioClick);

        return container;
    }

    function createSeriesConfigDOM(config, seriesId) {
        if (!config.series[seriesId]) {
            config.series[seriesId] = seriesDefault();
        }
        const seriesConfig = config.series[seriesId];

        const container = document.createElement("div");
        container.insertAdjacentHTML(
            "afterbegin",
            `
<div>
    <span>Chapter Number Source:</span>
    <input type="radio" name="config-parse-file-series" id="config-parse-file-series-global"
        value="global" ${seriesConfig.parseFileForChapterNumber === null ? "checked" : ""}>
    <label for="config-parse-file-series-global">Global Setting</label>
    <input type="radio" name="config-parse-file-series" id="config-parse-file-series-komga"
        value="komga" ${seriesConfig.parseFileForChapterNumber === false ? "checked" : ""}>
    <label for="config-parse-file-series-komga">Komga</label>
    <input type="radio" name="config-parse-file-series" id="config-parse-file-series-file"
        value="file" ${seriesConfig.parseFileForChapterNumber === true ? "checked" : ""}>
    <label for="config-parse-file-series-file">Parse Filename</label>
</div>
`,
        );

        function parseFileRadioClick(e) {
            switch (e.target.value) {
                case "global":
                    seriesConfig.parseFileForChapterNumber = null;
                    break;
                case "komga":
                    seriesConfig.parseFileForChapterNumber = false;
                    break;
                case "file":
                    seriesConfig.parseFileForChapterNumber = true;
                    break;
            }
            saveConfig(config);
        }

        container
            .querySelector("#config-parse-file-series-global")
            .addEventListener("change", parseFileRadioClick);
        container
            .querySelector("#config-parse-file-series-komga")
            .addEventListener("change", parseFileRadioClick);
        container
            .querySelector("#config-parse-file-series-file")
            .addEventListener("change", parseFileRadioClick);
        return container;
    }

    class CropTool extends HTMLElement {
        constructor(fileNamePrefix) {
            super();

            this.keyCode = "KeyX";
            this.fileNamePrefix = fileNamePrefix ?? "";
            this.isOpen = false;

            this.touch = false;
            this.longTouchTimeout = undefined;
            this.longTouchDuration = 1000;
        }

        /**
         * Event Handler as arrow function to allow this. class access without .bind
         * @param {KeyboardEvent} e
         */
        keyHandler = (e) => {
            if (e.code === "Escape" && this.isOpen) {
                e.stopPropagation();
                this.close();
            } else if (e.code === this.keyCode) {
                if (this.isOpen) {
                    this.close();
                } else {
                    this.open();
                }
            }
        };

        /**  @param {PointerEvent} e */
        pointerDownHandler = (e) => {
            clearTimeout(this.longTouchTimeout);
            this.longTouchTimeout = setTimeout(() => {
                if (this.isOpen) {
                    this.close();
                } else {
                    this.touch = e.pointerType !== "mouse";
                    this.open();
                }
            }, this.longTouchDuration);
        };

        pointerUpHandler = () => {
            clearTimeout(this.longTouchTimeout);
        };

        connectedCallback() {
            this.shadow = this.attachShadow({ mode: "open" });

            const style = document.createElement("style");
            style.textContent = `.ui {
    z-index: 300;
    position: fixed;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(#000000, #444444);
    touch-action: none;
}

.legend {
    z-index: 305;
    position: fixed;
    left: 10px;
    top: 10px;
    padding: 5px;
    user-select: none;
    pointer-events: none;
    background-color: rgba(18, 18, 18, 0.6);
    border: 1px solid rgba(105, 105, 105, 0.6);
    border-radius: 10px;
    color: #ffffff;
    font-family: Roboto, sans-serif;
    font-size: 14px;
}

.legend div {
    margin: 5px;
}

.legend div.legend-title {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 10px;
}

.page {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.page.hide-cursor {
    cursor: none;
}

.crosshair {
    z-index: 320;
    position: fixed;
    left: 0;
    top: 0;
    background-color: #ff0000;
    user-select: none;
    pointer-events: none;
}

.crosshair.hidden {
    visibility: hidden;
    display: none;
}

.crosshair-x {
    width: 1px;
    height: 100%;
}

.crosshair-y {
    width: 100%;
    height: 1px;
}

.selection {
    z-index: 310;
    position: fixed;
    background-color: rgba(255, 0, 0, 0.5);
    user-select: none;
    pointer-events: none;
    display: flex;
    justify-content: center;
    align-items: center;
}

.save {
    border: 0;
    background-color: transparent;
    pointer-events: auto;
    cursor: pointer;
    width: 90%;
    height: 90%;
}

.drag {
    position: absolute;
    z-index: 330;
    cursor: grab;
    background-color: rgba(100, 100, 100, 0.7);
    width: 30px;
    height: 30px;
    pointer-events: auto;
    box-sizing: border-box;
    border: 0 solid #000000;
}

.drag:hover {
    background-color: rgba(200, 200, 200, 0.9);
}

.drag.top,
.drag.bottom {
    width: 100%;
    margin: 0 30px;
    border-width: 1px 0;
}

.drag.left,
.drag.right {
    height: 100%;
    border-width: 0 1px;
}

.drag.top {
    top: 0;
    transform: translate(0, -100%);
}

.drag.right {
    right: 0;
    transform: translate(100%, 0);
}

.drag.bottom {
    bottom: 0;
    transform: translate(0, 100%);
}

.drag.left {
    left: 0;
    transform: translate(-100%, 0);
}

.drag.tl,
.drag.tr,
.drag.br,
.drag.bl {
    width: 30px;
    height: 30px;
    border-width: 1px;
}

.drag.tl {
    top: 0;
    left: 0;
    transform: translate(-100%, -100%);
}

.drag.tr {
    top: 0;
    right: 0;
    transform: translate(100%, -100%);
}

.drag.br {
    bottom: 0;
    right: 0;
    transform: translate(100%, 100%);
}

.drag.bl {
    bottom: 0;
    left: 0;
    transform: translate(-100%, 100%);
}
`;
            this.shadow.appendChild(style);

            window.addEventListener("keydown", this.keyHandler, true);
            window.addEventListener("pointerdown", this.pointerDownHandler);
            window.addEventListener("pointerup", this.pointerUpHandler);
            window.addEventListener("pointercancel", this.pointerUpHandler);
        }

        disconnectedCallback() {
            window.removeEventListener("keydown", this.keyHandler, true);
            window.removeEventListener("pointerdown", this.pointerDownHandler);
            window.removeEventListener("pointerup", this.pointerUpHandler);
            window.removeEventListener("pointercancel", this.pointerUpHandler);
        }

        close() {
            if (this.isOpen) {
                this.ui.remove();
                this.isOpen = false;
            }
        }

        open() {
            this.isOpen = true;
            this.ui = document.createElement("div");
            this.ui.classList.add("ui");

            const legend = document.createElement("div");
            legend.classList.add("legend");
            this.ui.appendChild(legend);
            legend.insertAdjacentHTML(
                "afterbegin",
                `
<div class="legend-title">Crop-Tool</div>
<div><b>${this.touch ? "Touch and hold" : "Press ESC / X"}</b> to cancel.</div>
<div><b>${this.touch ? "Touch" : "Click"}</b> to set start and end point.</div>
<div><b>Drag</b> sides or corners to adjust selection.</div>
<div><b>${this.touch ? "Touch" : "Click"}</b> the selection to download.</div>
`,
            );

            const { page, imageUrl } = this.getPageAndImageUrl();

            const img = document.createElement("img");
            img.src = imageUrl.href;
            img.classList.add("page", "hide-cursor");
            this.ui.appendChild(img);

            img.addEventListener("contextmenu", (e) => {
                // prevent long touch hold context menu on android
                e.preventDefault();
            });

            const chAx = document.createElement("div");
            const chAy = document.createElement("div");
            chAx.classList.add("crosshair", "crosshair-x");
            chAy.classList.add("crosshair", "crosshair-y");

            // crosshair A follows the mouse cursor, only add it for non-touch devices
            if (!this.touch) {
                chAx.style.left = document.body.offsetWidth / 2 + "px";
                chAy.style.top = document.body.offsetHeight / 2 + "px";
                this.ui.appendChild(chAx);
                this.ui.appendChild(chAy);
            }

            const chBx = document.createElement("div");
            const chBy = document.createElement("div");
            chBx.classList.add("crosshair", "crosshair-x", "hidden");
            chBy.classList.add("crosshair", "crosshair-y", "hidden");

            this.ui.appendChild(chBx);
            this.ui.appendChild(chBy);

            const selection = {
                x: 0,
                y: 0,
                state: 0,
                dragging: false,
                dragPos: "top",
                dragBase: { x: 0, y: 0 },
            };

            this.ui.addEventListener("pointermove", (e) => {
                if (selection.state === 0) {
                    chAx.style.left = e.clientX + "px";
                    chAy.style.top = e.clientY + "px";
                } else if (selection.state === 1) {
                    chBx.style.left = e.clientX + "px";
                    chBy.style.top = e.clientY + "px";
                }

                if (selection.state === 1) {
                    selDiv.style.left = Math.min(selection.x, e.clientX) + "px";
                    selDiv.style.width = Math.abs(e.clientX - selection.x) + "px";
                    selDiv.style.top = Math.min(selection.y, e.clientY) + "px";
                    selDiv.style.height = Math.abs(e.clientY - selection.y) + "px";
                }

                if (selection.dragging) {
                    const rect = selDiv.getBoundingClientRect();
                    const pos = selection.dragPos;
                    const eX = e.clientX;
                    const eY = e.clientY;
                    const diffY = eY - selection.dragBase.y;
                    const diffX = eX - selection.dragBase.x;

                    if (
                        (pos == "top" || pos == "tl" || pos == "tr") &&
                        rect.height - diffY >= 0
                    ) {
                        selDiv.style.top = rect.top + diffY + "px";
                        selDiv.style.height = rect.height - diffY + "px";
                        selection.dragBase.y = eY;
                    } else if (
                        (pos == "bottom" || pos == "bl" || pos == "br") &&
                        rect.height + diffY >= 0
                    ) {
                        selDiv.style.bottom = rect.bottom - diffY + "px";
                        selDiv.style.height = rect.height + diffY + "px";
                        selection.dragBase.y = eY;
                    }

                    if (
                        (pos == "right" || pos == "tr" || pos == "br") &&
                        rect.width + diffX >= 0
                    ) {
                        selDiv.style.right = rect.right - diffX + "px";
                        selDiv.style.width = rect.width + diffX + "px";
                        selection.dragBase.x = eX;
                    }
                    if (
                        (pos == "left" || pos == "tl" || pos == "bl") &&
                        rect.width - diffX >= 0
                    ) {
                        selDiv.style.left = rect.left + diffX + "px";
                        selDiv.style.width = rect.width - diffX + "px";
                        selection.dragBase.x = eX;
                    }
                }
            });

            const dragEnd = () => {
                if (selection.dragging) {
                    selection.dragging = false;
                }
            };
            this.ui.addEventListener("pointerup", dragEnd);
            this.ui.addEventListener("pointercancel", dragEnd);

            const selDiv = document.createElement("div");
            selDiv.classList.add("selection");
            selDiv.style.left = 0;
            selDiv.style.top = 0;
            selDiv.style.width = 0;
            selDiv.style.height = 0;
            this.ui.appendChild(selDiv);

            const cropAndDownload = () => {
                const rect = selDiv.getBoundingClientRect();
                const pointA = this.getClickedPixel(img, rect.left, rect.top);
                const pointB = this.getClickedPixel(img, rect.right, rect.bottom);
                const cropped = this.cropImage(img, pointA, pointB);
                this.downloadImage(
                    cropped,
                    `${this.fileNamePrefix} - ${page} crop.png`,
                );
                this.close();
            };

            const createSaveButton = () => {
                const btn = document.createElement("button");
                btn.classList.add("save");
                btn.tabIndex = -1;
                selDiv.appendChild(btn);
                btn.addEventListener("click", cropAndDownload);
            };

            function createDragControls() {
                const make = (pos) => {
                    const el = document.createElement("div");
                    el.classList.add("drag", pos);
                    selDiv.appendChild(el);
                    el.addEventListener("pointerdown", (e) => {
                        e.stopPropagation();
                        selection.dragging = true;
                        selection.dragPos = pos;
                        selection.dragBase.x = e.clientX;
                        selection.dragBase.y = e.clientY;
                    });
                    return el;
                };
                return [
                    "top",
                    "right",
                    "bottom",
                    "left",
                    "tl",
                    "tr",
                    "bl",
                    "br",
                ].map(make);
            }

            img.addEventListener("click", (e) => {
                if (selection.state === 0) {
                    selection.state = 1;
                    selection.x = e.clientX;
                    selection.y = e.clientY;
                    selDiv.style.left = e.clientX + "px";
                    selDiv.style.top = e.clientY + "px";

                    chBx.style.left = e.clientX + "px";
                    chBy.style.top = e.clientY + "px";
                    chBx.classList.remove("hidden");
                    chBy.classList.remove("hidden");
                } else if (selection.state === 1) {
                    selection.state = 2;
                    selDiv.style.width = Math.abs(selection.x - e.clientX) + "px";
                    selDiv.style.height = Math.abs(selection.y - e.clientY) + "px";

                    chAx.classList.add("hidden");
                    chAy.classList.add("hidden");
                    chBx.classList.add("hidden");
                    chBy.classList.add("hidden");
                    img.classList.remove("hide-cursor");

                    createDragControls();
                    createSaveButton();
                }
            });

            this.shadow.appendChild(this.ui);
        }

        getPageAndImageUrl() {
            const url = new URL(window.location.href);
            const book = url.pathname.match(/book\/([^/]+)\/read/)[1];
            const page = url.searchParams.get("page");
            const imageUrl = new URL(
                url.origin + `/api/v1/books/${book}/pages/${page}`,
            );
            return { page, imageUrl };
        }

        cropImage(img, pointA, pointB) {
            const canvas = document.createElement("canvas");
            const width = Math.abs(pointB.x - pointA.x);
            const height = Math.abs(pointB.y - pointA.y);
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(
                img,
                Math.min(pointA.x, pointB.x),
                Math.min(pointA.y, pointB.y),
                width,
                height,
                0,
                0,
                width,
                height,
            );
            return canvas.toDataURL("image/png");
        }

        downloadImage(imgUrl, filename) {
            const a = document.createElement("a");
            a.href = imgUrl;
            a.download = filename;
            a.click();
        }

        /**
         * Get rendered rectangle of an image with object-fit: contain
         * @param {HTMLImageElement} img
         */
        getRenderedImageRect(img) {
            const imageRatio = img.naturalWidth / img.naturalHeight;
            const elementRatio = img.width / img.height;

            let targetWidth;
            let targetHeight;

            if (imageRatio > elementRatio) {
                targetWidth = img.width;
                targetHeight = targetWidth / imageRatio;
            } else {
                targetHeight = img.height;
                targetWidth = targetHeight * imageRatio;
            }

            return {
                width: targetWidth,
                height: targetHeight,
                x: (img.width - targetWidth) / 2,
                y: (img.height - targetHeight) / 2,
            };
        }

        /**
         * Calculate the pixel coordinates in the actual image from click on img element
         * @param {HTMLImageElement} img
         * @param {number} mouseX MouseEvent.clientX
         * @param {number} mouseY MouseEevent.clientY
         * @returns
         */
        getClickedPixel(img, mouseX, mouseY) {
            const rect = this.getRenderedImageRect(img);
            const ratioX = img.naturalWidth / rect.width;
            const ratioY = img.naturalHeight / rect.height;
            let x = Math.floor((mouseX - rect.x) * ratioX);
            let y = Math.floor((mouseY - rect.y) * ratioY);
            x = Math.max(0, Math.min(x, img.naturalWidth));
            y = Math.max(0, Math.min(y, img.naturalHeight));
            return { x, y };
        }
    }

    customElements.define("crop-tool", CropTool);

    const MU_API = "https://api.mangaupdates.com/v1";

    async function getToken() {
        return await GM.getValue("mu_session_token");
    }

    async function request(endpoint, method, data) {
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
                        GM.deleteValue("mu_session_token");
                        alert("MangaUpdates session expired, please login again.");
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

    async function updateSeries(mangaUpdatesId, chapterNum) {
        chapterNum = Math.floor(chapterNum);

        const token = await GM.getValue("mu_session_token", "");
        if (token === "") {
            return false;
        }

        const update = {
            series: {
                id: mangaUpdatesId,
            },
            status: {
                chapter: chapterNum,
            },
        };
        let endpoint = "/lists/series";

        let r = await request("/lists/series/" + mangaUpdatesId, "GET");
        if (r.status === 404) {
            update.list_id = 0; // add to reading list
        } else {
            const current = JSON.parse(r.responseText);
            if (current.status.chapter >= chapterNum) {
                return true;
            }
            endpoint += "/update";
        }

        r = await request(endpoint, "POST", [update]);
        if (r.status === 200) {
            return true;
        } else {
            return false;
        }
    }

    async function login(rootElement) {
        const prefix = "[komga-sync] ";

        const muModal = document.createElement("div");
        muModal.classList.add("mu-login");
        rootElement.appendChild(muModal);

        const muForm = document.createElement("form");
        muModal.appendChild(muForm);
        muForm.insertAdjacentHTML(
            "afterbegin",
            `
<div class="mu-login-title">MangaUpdates Login</div>
<div class="mu-login-desc">
Note: The MangaUpdates API does not support OAuth.
Username and password are required to create a session token.
</div>
<div id="mu-login-error"></div>
<div>
<label for="mu-username">Username:</label>
<input type="text" id="mu-username" name="username" required>
</div>
<div>
<label for="mu-password">Password:</label>
<input type="password" id="mu-password" name="password" required>
</div>
<div>
<button type="submit">Login</button>
<button type="button">Cancel</button>
</div>`,
        );

        muForm
            .querySelector("button:nth-child(2)")
            .addEventListener("click", () => muModal.remove());

        muForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const formData = new FormData(muForm);

            GM.xmlHttpRequest({
                url: MU_API + "/account/login",
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({
                    username: formData.get("username"),
                    password: formData.get("password"),
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
                        muModal.remove();
                    } else {
                        muForm.querySelector("#mu-login-error").textContent =
                            "⚠️" + data.reason;
                        console.error(
                            prefix + "MangaUpdates login failed:",
                            data.reason,
                        );
                    }
                },
                onerror: (e) =>
                    console.error(prefix + "MangaUpdates login error", e),
            });
        });
    }

    async function search(searchTerm) {
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                url: MU_API + "/series/search",
                method: "POST",
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({
                    search: searchTerm,
                }),
                onload: (r) => resolve(JSON.parse(r.responseText)),
                onerror: reject,
            });
        });
    }

    const mangaUpdates = {
        login,
        getToken,
        updateSeries,
        search,
    };

    const MAL_OAUTH = "https://myanimelist.net/v1/oauth2";
    const MAL_API = "https://api.myanimelist.net/v2";
    const DICLAM = "ZjE4NDIxNGY4MTg4Y2RmNzEwZmM4N2MwMzMzYzhlMGM";

    function randStr(length) {
        const chars =
            "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let result = "";
        for (let i = length; i > 0; --i) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }

    async function getMalToken() {
        return await GM.getValue("mal_access_token");
    }

    async function checkMalTokenExpiration() {
        const malTokenExpiresAt = await GM.getValue("mal_expires_at", null);
        if (malTokenExpiresAt !== null) {
            if (malTokenExpiresAt <= Date.now()) {
                await GM.deleteValue("mal_access_token");
                await GM.deleteValue("mal_expires_at");
                alert("MyAnimeList session has expired, please login again.");
            }
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

    async function updateMalListStatus(malId, chapterNum) {
        chapterNum = Math.floor(chapterNum);

        let r = await malRequest(
            "/manga/" + malId + "?fields=my_list_status,num_chapters,status",
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
            "/manga/" + malId + "/my_list_status",
            "PATCH",
            update,
        );
        if (r.status === 200) {
            return true;
        } else {
            return false;
        }
    }

    async function openMalOAuth() {
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
        GM.openInTab(MAL_OAUTH + "/authorize?" + params.toString());
    }

    async function handleMalOAuthRedirect() {
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

    async function searchMAL(searchTerm) {
        const url = new URL(MAL_API + "/manga");
        url.searchParams.set("q", searchTerm);
        url.searchParams.set(
            "fields",
            "start_date, media_type, alternative_titles",
        );
        url.searchParams.set("nsfw", "true");
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                url: url.toString(),
                method: "GET",
                headers: {
                    "X-MAL-CLIENT-ID": atob(DICLAM),
                },
                onload: (r) => resolve(JSON.parse(r.responseText)),
                onerror: reject,
            });
        });
    }

    const myAnimeList = {
        getToken: getMalToken,
        checkTokenExpiration: checkMalTokenExpiration,
        openOAuth: openMalOAuth,
        handleOAuthRedirect: handleMalOAuthRedirect,
        updateStatus: updateMalListStatus,
        search: searchMAL,
        randStr,
    };

    (async () => {
        const prefix = "[komga-sync] ";

        if (document.title === "komga-sync MAL auth") {
            return myAnimeList.handleOAuthRedirect();
        } else if (document.title === "komga-sync AniList auth") {
            return aniList.handleOAuthRedirect();
        }

        if (!document.title.startsWith("Komga")) return;

        const config = await loadConfig();

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
        let chapterParsePreviewInserted = false;

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
                    const button = document.createElement("button");
                    button.className =
                        "v-btn v-btn--icon v-btn--round theme--dark v-size--default";
                    button.style.width = "120px";
                    button.textContent = "Komga Sync";
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
                    if (parseFileForChapterNumber(config, chapter.seriesId)) {
                        chapter.number = chapterRecognition.parseChapterNumber(
                            data.seriesTitle,
                            data.url,
                        );
                    } else {
                        chapter.number = data.metadata.number;
                    }
                    chapter.pagesCount = data.media.pagesCount;
                    chapter.seriesId = data.seriesId;
                    chapter.seriesTitle = data.seriesTitle;
                    chapter.completed = false;
                    console.log(
                        prefix +
                            "Chapter opened: " +
                            chapter.seriesTitle +
                            " Ch. " +
                            chapter.number +
                            ": " +
                            chapter.title,
                    );
                    // get series metadata for links
                    r = await fetch("/api/v1/series/" + chapter.seriesId);
                    data = await r.json();
                    chapter.links = data.metadata.links;

                    // insert crop tool
                    const fileNamePrefix =
                        chapter.seriesTitle +
                        " - Ch. " +
                        chapter.number +
                        " - " +
                        chapter.title;
                    document.body.appendChild(new CropTool(fileNamePrefix));
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
                        ["MangaUpdates", mangaUpdates.updateSeries],
                        ["MyAnimeList", myAnimeList.updateStatus],
                        ["AniList", aniList.updateEntry],
                    ];
                    for (const [site, func] of sites) {
                        const link = chapter.links.find((i) => i.label === site);
                        if (link) {
                            try {
                                const id = urlToId(link.url);
                                const r = await func(id, chapter.number);
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
                document.querySelector("crop-tool").remove();
            }

            // preview parsed chapter number if enabled
            match = url.pathname.match(/book\/([^/]+)\/?$/);
            if (match !== null) {
                const seriesId = document
                    .querySelector("a.link-underline.text-h5")
                    ?.href.match(/series\/([^/]+)/)?.[1];
                if (seriesId !== undefined) {
                    if (
                        !chapterParsePreviewInserted &&
                        parseFileForChapterNumber(config, seriesId)
                    ) {
                        chapterParsePreviewInserted = addChapterParsePreview();
                    } else {
                        chapterParsePreviewInserted = true;
                    }
                }
            } else {
                chapterParsePreviewInserted = false;
            }
        }, 250);

        // Check if tokens are expired based on documented expiration times
        myAnimeList.checkTokenExpiration();
        aniList.checkTokenExpiration();

        // Create Shadow DOM
        const host = document.createElement("div");
        document.body.appendChild(host);
        const shadow = host.attachShadow({ mode: "open" });
        const shadowStyle = document.createElement("style");
        shadowStyle.textContent = `.modal {
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

.header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5em;
}

.header-title {
    font-size: 1.8em;
    font-weight: bold;
}

.global-conf {
    display: flex;
    gap: 3em;
}

.global-conf-title {
    font-weight: bold;
    margin: 2px;
    margin-bottom: 0.5em;
}

.global-conf input {
    margin: 2px;
}

.global-conf label {
    margin: 2px;
}

.series-conf {
    margin-bottom: 0.5em;
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
    margin-bottom: 0.5em;
}

.links label {
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

.links input,
input[type="text"],
input[type="password"] {
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

.links .search-input {
    margin-top: 16px;
}

.button-container {
    margin-top: 8px;
}

.button-note {
    font-size: 14px;
    margin: 5px 2px;
}

a {
    text-decoration: none;
    color: #ffffff;
}

.result-note {
    font-size: 14px;
    margin-bottom: 1em;
}

.result-header {
    margin-top: 1em;
    margin-bottom: 1em;
}

.result-header-with-note {
    margin-bottom: 0.25em;
}

.result-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
}

.result-card {
    border: 1px solid #000;
    background-color: #232323;
    flex-basis: 400px;
    flex-grow: 1;
}

.result-card .thumb {
    float: left;
    margin-right: 4px;
    width: 106px;
}

.result-card img {
    display: block;
    height: 150px;
    width: 106px;
    object-fit: contain;
}

.result-card details {
    margin: 5px;
}

.result-card summary {
    font-weight: bold;
}

.result-card summary span {
    text-transform: capitalize;
}

.result-card button {
    margin: 0.5em;
    padding: 3px 8px;
    border: 1px solid #404040;
    font-size: 14px;
}

.result-card ul {
    margin-top: 0.25em;
    padding-left: 10px;
    list-style: inside;
    overflow: auto;
}

.mu-login {
    z-index: 310;
    position: fixed;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
}

.mu-login form {
    width: 100%;
    max-width: 540px;
    background-color: #121212;
    border: 1px solid #696969;
    border-radius: 10px;
    padding: 1em;
}

.mu-login div {
    margin: 6px;
}

.mu-login .mu-login-title {
    font-size: 1.5em;
    font-weight: bold;
    margin-bottom: 12px;
}

.mu-login .mu-login-desc {
    font-size: smaller;
    margin-bottom: 12px;
}

#mu-login-error {
    color: #ff0000;
    font-weight: bold;
    margin-bottom: 12px;
}
`;
        shadow.appendChild(shadowStyle);

        const resultCache = {
            MangaUpdates: {},
            MyAnimeList: {},
            AniList: {},
        };

        async function createUI(seriesId) {
            // Create Modal Dialog
            const modal = document.createElement("div");
            modal.classList.add("modal");

            const content = document.createElement("div");
            content.classList.add("content");
            modal.appendChild(content);

            // Add Header
            const header = document.createElement("div");
            header.classList.add("header");
            content.appendChild(header);

            const headerTitle = document.createElement("div");
            headerTitle.classList.add("header-title");
            headerTitle.textContent = "Komga-Sync";
            header.appendChild(headerTitle);

            const headerControls = document.createElement("div");
            header.appendChild(headerControls);

            const headerClose = document.createElement("button");
            headerClose.textContent = "❌";
            headerControls.appendChild(headerClose);

            function removeWithListeners() {
                modal.remove();
                shadow.removeEventListener("click", closeModalClick);
                window.removeEventListener("keydown", closeModalKey);
            }

            function closeModalClick(e) {
                if (e.target == modal) {
                    removeWithListeners();
                }
            }

            function closeModalKey(e) {
                if (e.code === "Escape") {
                    removeWithListeners();
                }
            }

            headerClose.addEventListener("click", removeWithListeners);
            shadow.addEventListener("click", closeModalClick);
            window.addEventListener("keydown", closeModalKey);

            const confDiv = document.createElement("div");
            confDiv.classList.add("global-conf");
            content.appendChild(confDiv);

            const accounts = document.createElement("div");
            confDiv.appendChild(accounts);

            const globalConf = createGlobalConfigDOM(config);
            confDiv.appendChild(globalConf);

            // MangaUpdates login
            const muLogin = document.createElement("button");
            muLogin.textContent = "MangaUpdates Login";
            muLogin.className = "login-button";
            accounts.appendChild(muLogin);
            muLogin.addEventListener("click", () => {
                mangaUpdates.login(accounts);
            });
            if ((await mangaUpdates.getToken()) !== undefined) {
                accounts.appendChild(document.createTextNode(" Logged in ✅"));
            }
            accounts.appendChild(document.createElement("br"));

            // MyAnimeList login
            const malLogin = document.createElement("button");
            malLogin.textContent = "MyAnimeList Login";
            malLogin.className = "login-button";
            accounts.appendChild(malLogin);
            malLogin.addEventListener("click", myAnimeList.openOAuth);
            if ((await myAnimeList.getToken()) !== undefined) {
                accounts.appendChild(document.createTextNode(" Logged in ✅"));
            }
            accounts.appendChild(document.createElement("br"));

            // AniList login
            const aniListLogin = document.createElement("button");
            aniListLogin.textContent = "AniList Login";
            aniListLogin.className = "login-button";
            accounts.appendChild(aniListLogin);
            aniListLogin.addEventListener("click", aniList.openOAuth);
            if ((await aniList.getToken()) !== undefined) {
                accounts.appendChild(document.createTextNode(" Logged in ✅"));
            }

            // get series metadata
            const r = await fetch("/api/v1/series/" + seriesId);
            const series = await r.json();

            const title = document.createElement("h2");
            title.textContent = series.metadata.title ?? series.name;
            content.appendChild(title);

            const seriesConf = createSeriesConfigDOM(config, seriesId);
            seriesConf.classList.add("series-conf");
            content.appendChild(seriesConf);

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
            links.classList.add("links");

            const [muUrlInput, muButton] = urlForm("MangaUpdates", urls.mu, links);
            const [malUrlInput, malButton] = urlForm(
                "MyAnimeList",
                urls.mal,
                links,
            );
            const [alUrlInput, alButton] = urlForm("AniList", urls.al, links);

            let label = document.createElement("label");
            label.textContent = "Search Term:";
            links.appendChild(label);

            const searchInput = document.createElement("input");
            searchInput.value = series.metadata.title ?? series.name;
            searchInput.type = "text";
            searchInput.classList.add("search-input");
            links.appendChild(searchInput);

            const buttonContainer = document.createElement("div");
            buttonContainer.classList.add = "button-container";
            buttonContainer.appendChild(muButton);
            buttonContainer.appendChild(malButton);
            buttonContainer.appendChild(alButton);
            links.appendChild(buttonContainer);

            const note = document.createElement("div");
            note.classList.add("button-note");
            note.textContent =
                " Note: AniList has MyAnimeList IDs for most entries, if " +
                "MAL is still missing it will also be added if available.";
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

            const prepareAndCacheResult = (name, searchTerm, note) => {
                const resultContainer = document.createElement("div");
                resultContainer.classList.add("result-container");
                content.appendChild(resultContainer);
                // cache for 5 minutes
                resultCache[name][searchTerm] = resultContainer;
                setTimeout(() => delete resultCache[name][searchTerm], 300_000);

                const header = document.createElement("h3");
                header.textContent = name + " Results";
                header.classList.add("result-header");
                if (note !== undefined) {
                    header.classList.add("result-header-with-note");
                }
                resultContainer.appendChild(header);
                if (note !== undefined) {
                    const div = document.createElement("div");
                    div.classList.add("result-note");
                    div.textContent = note;
                    resultContainer.appendChild(div);
                }
                const list = document.createElement("div");
                list.classList.add("result-list");
                resultContainer.appendChild(list);
                return list;
            };

            const resultCard = (picture, url, title, type, date, extra) => {
                type = type.replace("_", " ").toLowerCase();
                const card = document.createElement("div");
                card.classList.add("result-card");
                const thumb = document.createElement("div");
                thumb.classList.add("thumb");
                card.appendChild(thumb);
                const img = document.createElement("img");
                img.src = picture;
                thumb.appendChild(img);
                const details = document.createElement("details");
                card.appendChild(details);
                img.addEventListener("click", () => {
                    details.toggleAttribute("open");
                });
                const summary = document.createElement("summary");
                summary.innerHTML =
                    `${title} <a href="${url}" target="_blank">🔗</a> <span>${type}</span>` +
                    (date ? ` [${date}]` : "");
                details.appendChild(summary);
                details.insertAdjacentHTML("beforeend", extra ?? "");
                const button = document.createElement("button");
                button.textContent = "Set URL";
                card.appendChild(button);
                return { card, button };
            };

            muButton.addEventListener("click", async () => {
                const searchTerm = searchInput.value.trim();
                shadow.querySelector(".result-container")?.remove();
                if (resultCache.MangaUpdates[searchTerm]) {
                    content.appendChild(resultCache.MangaUpdates[searchTerm]);
                    return;
                }

                const data = await mangaUpdates.search(searchTerm);

                const list = prepareAndCacheResult("MangaUpdates", searchTerm);
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
            });

            malButton.addEventListener("click", async () => {
                const searchTerm = searchInput.value.trim();
                shadow.querySelector(".result-container")?.remove();
                if (resultCache.MyAnimeList[searchTerm]) {
                    content.appendChild(resultCache.MyAnimeList[searchTerm]);
                    return;
                }

                const data = await myAnimeList.search(searchTerm);

                const list = prepareAndCacheResult(
                    "MyAnimeList",
                    searchTerm,
                    "Click on the series thumbnail or title to show synonyms.",
                );
                for (const { node } of data.data) {
                    const mangaUrl = "https://myanimelist.net/manga/" + node.id;
                    const titles = node.alternative_titles;
                    const { card, button } = resultCard(
                        node.main_picture.medium,
                        mangaUrl,
                        node.title,
                        node.media_type,
                        node.start_date?.slice(0, 4),
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
            });

            alButton.addEventListener("click", async () => {
                shadow.querySelector(".result-container")?.remove();
                const searchTerm = searchInput.value.trim();
                if (resultCache.AniList[searchTerm]) {
                    content.appendChild(resultCache.AniList[searchTerm]);
                    return;
                }

                const data = await aniList.search(searchTerm);

                const list = prepareAndCacheResult(
                    "AniList",
                    searchTerm,
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
            });

            shadow.appendChild(modal);
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
    })();

})();
