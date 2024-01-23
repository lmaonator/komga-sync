import { readFileSync, writeFileSync } from "node:fs";
import header from "./src/header.mjs";

/**
 * Inserts CSS and adds userscript header to final bundle
 */
export default function postprocess() {
    return {
        name: "postprocess",
        writeBundle(options) {
            let code = readFileSync(options.file, { encoding: "utf-8" });

            // Replace `<import file.css>` with contents of file.css
            code = code.replaceAll(
                /[`"']<import ([^>]+\.css)>[`"']/g,
                (match, filename) =>
                    "`" +
                    readFileSync("./src/" + filename, {
                        encoding: "utf-8",
                    }).replaceAll(/([`$])/gm, "\\$1") +
                    "`",
            );

            // Add header
            const pkg = JSON.parse(
                readFileSync("./package.json", { encoding: "utf-8" }),
            );
            writeFileSync(options.file, header(pkg) + code, {
                encoding: "utf-8",
            });
        },
    };
}
