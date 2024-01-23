import chapterRecognition from "./chapter-recognition.mjs";

/**
 * Adds a row displaying the parsed chapter number to the book DOM.
 *
 * @returns {boolean} Success
 */
export default function addChapterParsePreview() {
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
