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

export default chapterRecognition;
