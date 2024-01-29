class CropTool extends HTMLElement {
    constructor(fileNamePrefix) {
        super();

        this.keyCode = "KeyX";
        this.fileNamePrefix = fileNamePrefix ?? "";
        this.isOpen = false;

        this.touch = false;
        this.longTouchTimeout = undefined;
        this.longTouchDuration = 1000;
    }

    /**
     * Event Handler as arrow function to allow this. class access without .bind
     * @param {KeyboardEvent} e
     */
    keyHandler = (e) => {
        if (e.code === "Escape" && this.isOpen) {
            e.stopPropagation();
            this.close();
        } else if (e.code === this.keyCode) {
            if (this.isOpen) {
                this.close();
            } else {
                this.open();
            }
        }
    };

    /**  @param {PointerEvent} e */
    pointerDownHandler = (e) => {
        clearTimeout(this.longTouchTimeout);
        this.longTouchTimeout = setTimeout(() => {
            if (this.isOpen) {
                this.close();
            } else {
                this.touch = e.pointerType !== "mouse";
                this.open();
            }
        }, this.longTouchDuration);
    };

    pointerUpHandler = () => {
        clearTimeout(this.longTouchTimeout);
    };

    connectedCallback() {
        this.shadow = this.attachShadow({ mode: "open" });

        const style = document.createElement("style");
        style.textContent = `<import crop-tool.css>`;
        this.shadow.appendChild(style);

        window.addEventListener("keydown", this.keyHandler, true);
        window.addEventListener("pointerdown", this.pointerDownHandler);
        window.addEventListener("pointerup", this.pointerUpHandler);
        window.addEventListener("pointercancel", this.pointerUpHandler);
    }

    disconnectedCallback() {
        window.removeEventListener("keydown", this.keyHandler, true);
        window.removeEventListener("pointerdown", this.pointerDownHandler);
        window.removeEventListener("pointerup", this.pointerUpHandler);
        window.removeEventListener("pointercancel", this.pointerUpHandler);
    }

    close() {
        if (this.isOpen) {
            this.ui.remove();
            this.isOpen = false;
        }
    }

    open() {
        this.isOpen = true;
        this.ui = document.createElement("div");
        this.ui.classList.add("ui");

        const legend = document.createElement("div");
        legend.classList.add("legend");
        this.ui.appendChild(legend);
        legend.insertAdjacentHTML(
            "afterbegin",
            `
<div class="legend-title">Crop-Tool</div>
<div><b>${this.touch ? "Touch and hold" : "Press ESC / X"}</b> to cancel.</div>
<div><b>${this.touch ? "Touch" : "Click"}</b> to set start and end point.</div>
<div><b>Drag</b> sides or corners to adjust selection.</div>
<div><b>${this.touch ? "Touch" : "Click"}</b> the selection to download.</div>
`,
        );

        const { page, imageUrl } = this.getPageAndImageUrl();

        const img = document.createElement("img");
        img.src = imageUrl.href;
        img.classList.add("page", "hide-cursor");
        this.ui.appendChild(img);

        img.addEventListener("contextmenu", (e) => {
            // prevent long touch hold context menu on android
            e.preventDefault();
        });

        const chAx = document.createElement("div");
        const chAy = document.createElement("div");
        chAx.classList.add("crosshair", "crosshair-x");
        chAy.classList.add("crosshair", "crosshair-y");

        // crosshair A follows the mouse cursor, only add it for non-touch devices
        if (!this.touch) {
            chAx.style.left = document.body.offsetWidth / 2 + "px";
            chAy.style.top = document.body.offsetHeight / 2 + "px";
            this.ui.appendChild(chAx);
            this.ui.appendChild(chAy);
        }

        const chBx = document.createElement("div");
        const chBy = document.createElement("div");
        chBx.classList.add("crosshair", "crosshair-x", "hidden");
        chBy.classList.add("crosshair", "crosshair-y", "hidden");

        this.ui.appendChild(chBx);
        this.ui.appendChild(chBy);

        const selection = {
            x: 0,
            y: 0,
            state: 0,
            dragging: false,
            dragPos: "top",
            dragBase: { x: 0, y: 0 },
        };

        this.ui.addEventListener("pointermove", (e) => {
            if (selection.state === 0) {
                chAx.style.left = e.clientX + "px";
                chAy.style.top = e.clientY + "px";
            } else if (selection.state === 1) {
                chBx.style.left = e.clientX + "px";
                chBy.style.top = e.clientY + "px";
            }

            if (selection.state === 1) {
                selDiv.style.left = Math.min(selection.x, e.clientX) + "px";
                selDiv.style.width = Math.abs(e.clientX - selection.x) + "px";
                selDiv.style.top = Math.min(selection.y, e.clientY) + "px";
                selDiv.style.height = Math.abs(e.clientY - selection.y) + "px";
            }

            if (selection.dragging) {
                const rect = selDiv.getBoundingClientRect();
                const pos = selection.dragPos;
                const eX = e.clientX;
                const eY = e.clientY;
                const diffY = eY - selection.dragBase.y;
                const diffX = eX - selection.dragBase.x;

                if (
                    (pos == "top" || pos == "tl" || pos == "tr") &&
                    rect.height - diffY >= 0
                ) {
                    selDiv.style.top = rect.top + diffY + "px";
                    selDiv.style.height = rect.height - diffY + "px";
                    selection.dragBase.y = eY;
                } else if (
                    (pos == "bottom" || pos == "bl" || pos == "br") &&
                    rect.height + diffY >= 0
                ) {
                    selDiv.style.bottom = rect.bottom - diffY + "px";
                    selDiv.style.height = rect.height + diffY + "px";
                    selection.dragBase.y = eY;
                }

                if (
                    (pos == "right" || pos == "tr" || pos == "br") &&
                    rect.width + diffX >= 0
                ) {
                    selDiv.style.right = rect.right - diffX + "px";
                    selDiv.style.width = rect.width + diffX + "px";
                    selection.dragBase.x = eX;
                }
                if (
                    (pos == "left" || pos == "tl" || pos == "bl") &&
                    rect.width - diffX >= 0
                ) {
                    selDiv.style.left = rect.left + diffX + "px";
                    selDiv.style.width = rect.width - diffX + "px";
                    selection.dragBase.x = eX;
                }
            }
        });

        const dragEnd = () => {
            if (selection.dragging) {
                selection.dragging = false;
            }
        };
        this.ui.addEventListener("pointerup", dragEnd);
        this.ui.addEventListener("pointercancel", dragEnd);

        const selDiv = document.createElement("div");
        selDiv.classList.add("selection");
        selDiv.style.left = 0;
        selDiv.style.top = 0;
        selDiv.style.width = 0;
        selDiv.style.height = 0;
        this.ui.appendChild(selDiv);

        const cropAndDownload = () => {
            const rect = selDiv.getBoundingClientRect();
            const pointA = this.getClickedPixel(img, rect.left, rect.top);
            const pointB = this.getClickedPixel(img, rect.right, rect.bottom);
            const cropped = this.cropImage(img, pointA, pointB);
            this.downloadImage(
                cropped,
                `${this.fileNamePrefix} - ${page} crop.png`,
            );
            this.close();
        };

        const createSaveButton = () => {
            const btn = document.createElement("button");
            btn.classList.add("save");
            btn.tabIndex = -1;
            selDiv.appendChild(btn);
            btn.addEventListener("click", cropAndDownload);
        };

        function createDragControls() {
            const make = (pos) => {
                const el = document.createElement("div");
                el.classList.add("drag", pos);
                selDiv.appendChild(el);
                el.addEventListener("pointerdown", (e) => {
                    e.stopPropagation();
                    selection.dragging = true;
                    selection.dragPos = pos;
                    selection.dragBase.x = e.clientX;
                    selection.dragBase.y = e.clientY;
                });
                return el;
            };
            return [
                "top",
                "right",
                "bottom",
                "left",
                "tl",
                "tr",
                "bl",
                "br",
            ].map(make);
        }

        img.addEventListener("click", (e) => {
            if (selection.state === 0) {
                selection.state = 1;
                selection.x = e.clientX;
                selection.y = e.clientY;
                selDiv.style.left = e.clientX + "px";
                selDiv.style.top = e.clientY + "px";

                chBx.style.left = e.clientX + "px";
                chBy.style.top = e.clientY + "px";
                chBx.classList.remove("hidden");
                chBy.classList.remove("hidden");
            } else if (selection.state === 1) {
                selection.state = 2;
                selDiv.style.width = Math.abs(selection.x - e.clientX) + "px";
                selDiv.style.height = Math.abs(selection.y - e.clientY) + "px";

                chAx.classList.add("hidden");
                chAy.classList.add("hidden");
                chBx.classList.add("hidden");
                chBy.classList.add("hidden");
                img.classList.remove("hide-cursor");

                createDragControls();
                createSaveButton();
            }
        });

        this.shadow.appendChild(this.ui);
    }

    getPageAndImageUrl() {
        const url = new URL(window.location.href);
        const book = url.pathname.match(/book\/([^/]+)\/read/)[1];
        const page = url.searchParams.get("page");
        const imageUrl = new URL(
            url.origin + `/api/v1/books/${book}/pages/${page}`,
        );
        return { page, imageUrl };
    }

    cropImage(img, pointA, pointB) {
        const canvas = document.createElement("canvas");
        const width = Math.abs(pointB.x - pointA.x);
        const height = Math.abs(pointB.y - pointA.y);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
            img,
            Math.min(pointA.x, pointB.x),
            Math.min(pointA.y, pointB.y),
            width,
            height,
            0,
            0,
            width,
            height,
        );
        return canvas.toDataURL("image/png");
    }

    downloadImage(imgUrl, filename) {
        const a = document.createElement("a");
        a.href = imgUrl;
        a.download = filename;
        a.click();
    }

    /**
     * Get rendered rectangle of an image with object-fit: contain
     * @param {HTMLImageElement} img
     */
    getRenderedImageRect(img) {
        const imageRatio = img.naturalWidth / img.naturalHeight;
        const elementRatio = img.width / img.height;

        let targetWidth;
        let targetHeight;

        if (imageRatio > elementRatio) {
            targetWidth = img.width;
            targetHeight = targetWidth / imageRatio;
        } else {
            targetHeight = img.height;
            targetWidth = targetHeight * imageRatio;
        }

        return {
            width: targetWidth,
            height: targetHeight,
            x: (img.width - targetWidth) / 2,
            y: (img.height - targetHeight) / 2,
        };
    }

    /**
     * Calculate the pixel coordinates in the actual image from click on img element
     * @param {HTMLImageElement} img
     * @param {number} mouseX MouseEvent.clientX
     * @param {number} mouseY MouseEevent.clientY
     * @returns
     */
    getClickedPixel(img, mouseX, mouseY) {
        const rect = this.getRenderedImageRect(img);
        const ratioX = img.naturalWidth / rect.width;
        const ratioY = img.naturalHeight / rect.height;
        let x = Math.floor((mouseX - rect.x) * ratioX);
        let y = Math.floor((mouseY - rect.y) * ratioY);
        x = Math.max(0, Math.min(x, img.naturalWidth));
        y = Math.max(0, Math.min(y, img.naturalHeight));
        return { x, y };
    }
}

customElements.define("crop-tool", CropTool);

export default CropTool;
