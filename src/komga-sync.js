import addChapterParsePreview from "./add-chapter-parse-preview.mjs";
import aniList from "./anilist.mjs";
import chapterRecognition from "./chapter-recognition.mjs";
import {
    createGlobalConfigDOM,
    createSeriesConfigDOM,
    loadConfig,
    parseFileForChapterNumber,
} from "./config.mjs";
import CropTool from "./crop-tool.mjs";
import mangaUpdates from "./mangaupdates.mjs";
import myAnimeList from "./myanimelist.mjs";

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
    shadowStyle.textContent = `<import style.css>`;
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
