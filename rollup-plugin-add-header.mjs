import { readFileSync, writeFileSync } from "node:fs";
import header from "./src/header.mjs";

/**
 * Add userscript header to final bundle
 */
export default function addHeader() {
    return {
        name: "add-header",
        writeBundle(options) {
            const code = readFileSync(options.file, { encoding: "utf-8" });
            const pkg = JSON.parse(
                readFileSync("./package.json", { encoding: "utf-8" }),
            );
            writeFileSync(options.file, header(pkg) + code, {
                encoding: "utf-8",
            });
        },
    };
}
