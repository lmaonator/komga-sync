// used by rollup-plugin-postprocess.mjs
export default function (pkg) {
    return `// ==UserScript==
// @name        ${pkg.name}
// @version     ${pkg.version}
// @author      ${pkg.author}
// @description ${pkg.description}
// @license     ${pkg.license}
// @homepageURL ${pkg.homepage}
// @downloadURL ${pkg.homepage}komga-sync.user.js
// @supportURL  ${pkg.repository}/issues
// @namespace   ${pkg.repository}
// @match       http*://komga.*/*
// @match       http*://*/komga/*
// @match       ${pkg.homepage}auth-*.html*
// @grant       GM.xmlHttpRequest
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.deleteValue
// @grant       GM.openInTab
// ==/UserScript==
`;
}
