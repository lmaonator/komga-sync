import terser from "@rollup/plugin-terser";
import postprocess from "./rollup-plugin-postprocess.mjs";

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
    plugins: [],
};
