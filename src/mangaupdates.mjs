const MU_API = "https://api.mangaupdates.com/v1";

async function getToken() {
    return await GM.getValue("mu_session_token");
}

async function request(endpoint, method, data) {
    const token = await GM.getValue("mu_session_token");
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            url: MU_API + endpoint,
            method,
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/json",
            },
            data: data !== undefined ? JSON.stringify(data) : undefined,
            onload: (response) => {
                if (response.status === 401) {
                    GM.deleteValue("mu_session_token");
                    alert("MangaUpdates session expired, please login again.");
                }
                return resolve(response);
            },
            onerror: (error) => {
                console.error(error);
                return reject(error);
            },
        });
    });
}

async function updateSeries(mangaUpdatesId, chapterNum) {
    chapterNum = Math.floor(chapterNum);

    const token = await GM.getValue("mu_session_token", "");
    if (token === "") {
        return false;
    }

    const update = {
        series: {
            id: mangaUpdatesId,
        },
        status: {
            chapter: chapterNum,
        },
    };
    let endpoint = "/lists/series";

    let r = await request("/lists/series/" + mangaUpdatesId, "GET");
    if (r.status === 404) {
        update.list_id = 0; // add to reading list
    } else {
        const current = JSON.parse(r.responseText);
        if (current.status.chapter >= chapterNum) {
            return true;
        }
        endpoint += "/update";
    }

    r = await request(endpoint, "POST", [update]);
    if (r.status === 200) {
        return true;
    } else {
        return false;
    }
}

async function login(rootElement) {
    const prefix = "[komga-sync] ";

    const muModal = document.createElement("div");
    muModal.classList.add("mu-login");
    rootElement.appendChild(muModal);

    const muForm = document.createElement("form");
    muModal.appendChild(muForm);
    muForm.insertAdjacentHTML(
        "afterbegin",
        `
<div class="mu-login-title">MangaUpdates Login</div>
<div class="mu-login-desc">
Note: The MangaUpdates API does not support OAuth.
Username and password are required to create a session token.
</div>
<div id="mu-login-error"></div>
<div>
<label for="mu-username">Username:</label>
<input type="text" id="mu-username" name="username" required>
</div>
<div>
<label for="mu-password">Password:</label>
<input type="password" id="mu-password" name="password" required>
</div>
<div>
<button type="submit">Login</button>
<button type="button">Cancel</button>
</div>`,
    );

    muForm
        .querySelector("button:nth-child(2)")
        .addEventListener("click", () => muModal.remove());

    muForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const formData = new FormData(muForm);

        GM.xmlHttpRequest({
            url: MU_API + "/account/login",
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
                username: formData.get("username"),
                password: formData.get("password"),
            }),
            onload: async (response) => {
                const data = JSON.parse(response.responseText);
                if (data.status === "success") {
                    await GM.setValue(
                        "mu_session_token",
                        data.context.session_token,
                    );
                    await GM.setValue("mu_uid", data.context.uid);
                    console.log(prefix + "MangaUpdates login successful");
                    muModal.remove();
                } else {
                    muForm.querySelector("#mu-login-error").textContent =
                        "⚠️" + data.reason;
                    console.error(
                        prefix + "MangaUpdates login failed:",
                        data.reason,
                    );
                }
            },
            onerror: (e) =>
                console.error(prefix + "MangaUpdates login error", e),
        });
    });
}

async function search(searchTerm) {
    return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
            url: MU_API + "/series/search",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
                search: searchTerm,
            }),
            onload: (r) => resolve(JSON.parse(r.responseText)),
            onerror: reject,
        });
    });
}

const mangaUpdates = {
    login,
    getToken,
    updateSeries,
    search,
};

export default mangaUpdates;
