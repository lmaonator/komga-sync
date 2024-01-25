const MAL_OAUTH = "https://myanimelist.net/v1/oauth2";
const MAL_API = "https://api.myanimelist.net/v2";
const DICLAM = "ZjE4NDIxNGY4MTg4Y2RmNzEwZmM4N2MwMzMzYzhlMGM";

export function randStr(length) {
    const chars =
        "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = length; i > 0; --i) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

export async function getMalToken() {
    return await GM.getValue("mal_access_token");
}

export async function checkMalTokenExpiration() {
    const malTokenExpiresAt = await GM.getValue("mal_expires_at", null);
    if (malTokenExpiresAt !== null) {
        if (malTokenExpiresAt <= Date.now()) {
            await GM.deleteValue("mal_access_token");
            await GM.deleteValue("mal_expires_at");
            alert("MyAnimeList session has expired, please login again.");
        }
    }
}

async function malToken(code, code_verifier) {
    const params = {
        client_id: atob(DICLAM),
        client_secret: "",
    };
    if (code !== undefined && code_verifier !== undefined) {
        Object.assign(params, {
            grant_type: "authorization_code",
            code,
            code_verifier,
        });
    } else {
        Object.assign(params, {
            grant_type: "refresh_token",
            refresh_token: await GM.getValue("mal_refresh_token"),
        });
    }
    const data = new URLSearchParams(params).toString();
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            url: MAL_OAUTH + "/token",
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data,
            onload: (r) => {
                if (r.status === 200) {
                    const data = JSON.parse(r.responseText);
                    GM.setValue("mal_access_token", data.access_token);
                    GM.setValue("mal_refresh_token", data.refresh_token);
                    // MAL refresh tokens are valid for 1 month
                    GM.setValue("mal_expires_at", Date.now() + 2592000_000);
                    return resolve(true);
                }
                alert("MyAnimeList session expired, please login again.");
                console.error(r);
                return resolve(false);
            },
            onerror: (e) => {
                console.error(e);
                return reject(false);
            },
        });
    });
}

async function malRequest(endpoint, method, params) {
    const access_token = await GM.getValue("mal_access_token");
    let data = params;
    if (data !== undefined) {
        data = new URLSearchParams(data).toString();
    }
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            url: MAL_API + endpoint,
            method,
            headers: {
                Authorization: "Bearer " + access_token,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data,
            onload: async (r) => {
                if (r.status === 401) {
                    if (await malToken()) {
                        return malRequest(endpoint, method, params);
                    }
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

export async function updateMalListStatus(malId, chapterNum) {
    chapterNum = Math.floor(chapterNum);

    let r = await malRequest(
        "/manga/" + malId + "?fields=my_list_status,num_chapters,status",
        "GET",
    );
    const data = JSON.parse(r.responseText);
    const status = data.my_list_status ?? {
        is_rereading: false,
        num_chapters_read: 0,
        status: "plan_to_read",
    };

    if (status.num_chapters_read >= chapterNum) {
        return true;
    }

    const update = {
        num_chapters_read: chapterNum,
    };

    const date = new Date().toISOString().substring(0, 10);

    if (status.status === "plan_to_read") {
        update.status = "reading";
        if (status.start_date === undefined) {
            update.start_date = date;
        }
    } else if (
        status.status === "reading" &&
        chapterNum >= data.num_chapters &&
        data.status === "finished"
    ) {
        update.status = "completed";
        if (status.finish_date === undefined) {
            update.finish_date = date;
        }
    }

    r = await malRequest(
        "/manga/" + malId + "/my_list_status",
        "PATCH",
        update,
    );
    if (r.status === 200) {
        return true;
    } else {
        return false;
    }
}

export async function openMalOAuth() {
    const state = randStr(16);
    const code_challenge = randStr(64);
    await GM.setValue("mal_state", state);
    await GM.setValue("mal_challenge", code_challenge);
    const params = new URLSearchParams({
        response_type: "code",
        client_id: atob(DICLAM),
        state,
        code_challenge,
        code_challenge_method: "plain",
    });
    GM.openInTab(MAL_OAUTH + "/authorize?" + params.toString());
}

export async function handleMalOAuthRedirect() {
    const url = new URL(window.location.href);
    const state = await GM.getValue("mal_state");
    if (url.searchParams.get("state") !== state) {
        document.body.appendChild(
            document.createTextNode(
                "Error: Authorization state does not match",
            ),
        );
        return;
    }
    const challenge = await GM.getValue("mal_challenge");
    const code = url.searchParams.get("code");
    const r = await malToken(code, challenge).catch(() => false);
    if (r) {
        document.body.appendChild(
            document.createTextNode(
                "Successfully authenticated with MyAnimeList ✅. You can now close this window.",
            ),
        );
    } else {
        document.body.appendChild(
            document.createTextNode(
                "Failed to authenticate with MyAnimeList ⚠️. Error details were logged to console.",
            ),
        );
    }
    GM.deleteValue("mal_state");
    GM.deleteValue("mal_challenge");
}

export async function searchMAL(searchTerm) {
    const url = new URL(MAL_API + "/manga");
    url.searchParams.set("q", searchTerm);
    url.searchParams.set(
        "fields",
        "start_date, media_type, alternative_titles",
    );
    url.searchParams.set("nsfw", "true");
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            url: url.toString(),
            method: "GET",
            headers: {
                "X-MAL-CLIENT-ID": atob(DICLAM),
            },
            onload: (r) => resolve(JSON.parse(r.responseText)),
            onerror: reject,
        });
    });
}

const myAnimeList = {
    getToken: getMalToken,
    checkTokenExpiration: checkMalTokenExpiration,
    openOAuth: openMalOAuth,
    handleOAuthRedirect: handleMalOAuthRedirect,
    updateStatus: updateMalListStatus,
    search: searchMAL,
    randStr,
};

export default myAnimeList;
