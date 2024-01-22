import terser from "@rollup/plugin-terser";
import addHeader from "./rollup-plugin-add-header.mjs";

export default {
    input: "src/komga-sync.js",
    output: [
        {
            file: "dist/komga-sync.user.js",
            format: "iife",
            plugins: [addHeader()],
        },
        {
            file: "dist/komga-sync.min.user.js",
            format: "iife",
            plugins: [terser(), addHeader()],
        },
    ],
    plugins: [],
};
