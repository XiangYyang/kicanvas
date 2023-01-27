/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { SchematicViewer } from "../sch/viewer";

class KiCanvasSchematicElement extends HTMLElement {
    #canvas: HTMLCanvasElement;
    viewer: SchematicViewer;
    selected = [];

    constructor() {
        super();
    }

    get loaded() {
        return this.hasAttribute("loaded");
    }

    set loaded(value) {
        if (value) {
            this.setAttribute("loaded", "");
        } else {
            this.removeAttribute("loaded");
        }
    }

    async connectedCallback() {
        this.#renderShadowDOM();

        this.viewer = new SchematicViewer(this.#canvas);
        await this.viewer.setup();
        await this.viewer.load(this.getAttribute("src"));

        this.loaded = true;
        this.dispatchEvent(new CustomEvent("kicad-schematic:loaded"));

        this.viewer.draw_soon();
    }

    #renderShadowDOM() {
        const template = document.createElement("template");
        template.innerHTML = `
            <style>
                :host {
                    display: block;
                }

                canvas {
                    width: 100%;
                    height: 100%;
                }
            </style>
            <canvas></canvas>
        `;

        const root = this.attachShadow({ mode: "open" });
        root.appendChild(template.content.cloneNode(true));
        this.#canvas = root.querySelector("canvas");
    }
}

window.customElements.define("kicanvas-schematic", KiCanvasSchematicElement);
