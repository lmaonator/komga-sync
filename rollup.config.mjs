import terser from "@rollup/plugin-terser";
import glob from "glob";
import path from "node:path";
import postprocess from "./rollup-plugin-postprocess.mjs";

function addWatchFiles(files) {
    return {
        buildStart() {
            for (const file of files) {
                glob.sync(path.resolve(file)).forEach((filename) => {
                    this.addWatchFile(filename);
                });
            }
        },
    };
}

export default {
    input: "src/komga-sync.js",
    output: [
        {
            file: "dist/komga-sync.user.js",
            format: "iife",
            plugins: [postprocess()],
        },
        {
            file: "dist/komga-sync.min.user.js",
            format: "iife",
            plugins: [terser(), postprocess()],
        },
    ],
    plugins: [addWatchFiles(["src/header.mjs", "src/*.css"])],
};
