const ANILIST_OAUTH = "https://anilist.co/api/v2/oauth";
const ANILIST_API = "https://graphql.anilist.co";
const DICLA = "MTYzNDc";

export async function getAniListToken() {
    return await GM.getValue("anilist_access_token");
}

async function aniListRequest(query, variables) {
    const accessToken = await GM.getValue("anilist_access_token");
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            url: ANILIST_API,
            method: "POST",
            headers: {
                Authorization: "Bearer " + accessToken,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            data: JSON.stringify({
                query: query,
                variables: variables,
            }),
            onload: async (r) => {
                if (
                    r.status === 400 &&
                    r.responseText.includes("Invalid token")
                ) {
                    await GM.deleteValue("anilist_access_token");
                    await GM.deleteValue("anilist_expires_at");
                    alert("AniList session has expired, please login again.");
                }
                return resolve(r);
            },
            onerror: (e) => {
                console.error(e);
                return reject(e);
            },
        });
    });
}

export async function updateAniListEntry(aniListId, chapterNum) {
    chapterNum = Math.floor(chapterNum);

    let r = await aniListRequest(
        `
query ($id: Int) {
    Media(id: $id, type: MANGA) {
        id
        chapters
        mediaListEntry {
            id
            status
            progress
            repeat
            startedAt {
                year
                month
                day
            }
            completedAt {
                year
                month
                day
            }
        }
    }
}
`,
        { id: aniListId },
    );
    let data = JSON.parse(r.responseText);
    if (data.errors?.length > 0) {
        console.error(data.errors);
        return false;
    }
    const manga = data.data.Media;
    const mle = manga.mediaListEntry;

    if (mle.progress >= chapterNum) {
        return true;
    }

    const date = new Date();
    const currentDate = {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
    };
    const vars = {
        progress: chapterNum,
    };
    if (manga.chapters == chapterNum) {
        vars.status = "COMPLETED";
        vars.completedAt = currentDate;
    } else {
        vars.status = "CURRENT";
    }

    if (mle === undefined) {
        // create new mediaListEntry
        vars.mediaId = aniListId;
        vars.startedAt = currentDate;
    } else if (
        ["CURRENT", "DROPPED", "PAUSED", "PLANNING"].includes(mle.status)
    ) {
        // update mediaListEntry
        vars.id = mle.id;
    } else {
        // already completed, do nothing
        return true;
    }
    r = await aniListRequest(
        `
mutation (
    $id: Int, $mediaId: Int,
    $status: MediaListStatus, $progress: Int, $repeat: Int,
    $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput
) {
    SaveMediaListEntry (
        id: $id, mediaId: $mediaId,
        status: $status, progress: $progress, repeat: $repeat,
        startedAt: $startedAt, completedAt: $completedAt
    ) {
        id
        mediaId
        status
        progress
        repeat
        startedAt {
            year
            month
            day
        }
        completedAt {
            year
            month
            day
        }
    }
}
`,
        vars,
    );
    data = JSON.parse(r.responseText);
    if (data.errors?.length > 0) {
        console.error(data.errors);
        return false;
    } else {
        return true;
    }
}

export function openAniListOAuth() {
    const params = new URLSearchParams({
        client_id: atob(DICLA),
        response_type: "token",
    });
    GM.openInTab(ANILIST_OAUTH + "/authorize?" + params.toString());
}

export async function handleAniListOAuthRedirect() {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.hash.slice(1));
    const access_token = params.get("access_token");
    if (access_token !== null) {
        await GM.setValue("anilist_access_token", access_token);
        await GM.setValue(
            "anilist_expires_at",
            parseInt(params.get("expires_in"), 10) * 1000 + Date.now(),
        );
        document.body.appendChild(
            document.createTextNode(
                "Successfully authenticated with AniList ✅. You can now close this window.",
            ),
        );
    } else {
        document.body.appendChild(
            document.createTextNode(
                "Failed to authenticate with AniList ⚠️. Please try again.",
            ),
        );
    }
}

export async function checkAniListTokenExpiration() {
    const alTokenExpiresAt = await GM.getValue("anilist_expires_at", null);
    if (alTokenExpiresAt !== null) {
        if (alTokenExpiresAt <= Date.now()) {
            await GM.deleteValue("anilist_access_token");
            await GM.deleteValue("anilist_expires_at");
            alert("AniList session has expired, please login again.");
        } else if (alTokenExpiresAt - 604800_000 <= Date.now()) {
            // 1 week before expiration
            alert("AniList session will expire soon, please login again.");
        }
    }
}

export async function searchAniList(searchTerm) {
    const data = {
        query: `
query ($search: String) {
    Page {
        media(search: $search, type: MANGA) {
        id
        idMal
        title {
            romaji
            english
            native
        }
        format
        startDate {
            year
        }
        coverImage {
            medium
        }
        synonyms
        siteUrl
        }
    }
}
`,
        variables: {
            search: searchTerm,
        },
    };
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            url: ANILIST_API,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            data: JSON.stringify(data),
            onload: (r) => resolve(JSON.parse(r.responseText)),
            onerror: reject,
        });
    });
}

const aniList = {
    getToken: getAniListToken,
    checkTokenExpiration: checkAniListTokenExpiration,
    openOAuth: openAniListOAuth,
    handleOAuthRedirect: handleAniListOAuthRedirect,
    updateEntry: updateAniListEntry,
    search: searchAniList,
};

export default aniList;
