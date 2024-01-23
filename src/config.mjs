function seriesDefault() {
    return {
        parseFileForChapterNumber: null,
    };
}

export async function loadConfig() {
    const config = {
        parseFileForChapterNumber: false,
        series: {},
    };
    Object.assign(config, JSON.parse(await GM.getValue("config", "{}")));
    return config;
}

export async function saveConfig(config) {
    await GM.setValue("config", JSON.stringify(config));
}

export function parseFileForChapterNumber(config, seriesId) {
    const seriesConfig = config.series[seriesId];
    if (seriesConfig === undefined) {
        return config.parseFileForChapterNumber;
    }
    if (seriesConfig.parseFileForChapterNumber === null) {
        return config.parseFileForChapterNumber;
    }
    return seriesConfig.parseFileForChapterNumber;
}

export function createGlobalConfigDOM(config) {
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

export function createSeriesConfigDOM(config, seriesId) {
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
