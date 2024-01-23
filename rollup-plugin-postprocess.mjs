import MagicString from "magic-string";
import { readFileSync } from "node:fs";
import header from "./src/header.mjs";

/**
 * Inserts CSS and adds userscript header to final bundle
 */
export default function postprocess({
    addHeader = true,
    importCss = true,
} = {}) {
    return {
        name: "postprocess",
        renderChunk(code, renderedChunk, outputOptions) {
            const magicString = new MagicString(code);

            if (importCss) {
                // Replace `<import file.css>` with contents of file.css
                magicString.replaceAll(
                    /[`"']<import ([^>]+\.css)>[`"']/g,
                    (match, filename) =>
                        "`" +
                        readFileSync("./src/" + filename, {
                            encoding: "utf-8",
                        }).replaceAll(/([`$])/gm, "\\$1") +
                        "`",
                );
            }

            if (addHeader) {
                // Add header
                const pkg = JSON.parse(
                    readFileSync("./package.json", { encoding: "utf-8" }),
                );
                magicString.prepend(header(pkg));
            }

            const result = { code: magicString.toString() };
            if (outputOptions.sourcemap !== false) {
                result.map = magicString.generateMap({ hires: true });
            }
            return result;
        },
    };
}
