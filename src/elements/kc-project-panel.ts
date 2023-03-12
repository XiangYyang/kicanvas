/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { WithContext } from "../dom/context";
import { CustomElement, html } from "../dom/custom-elements";
import type { Project } from "../project";

import "./kc-ui/kc-ui";

export class KCProjectPanelElement extends WithContext(CustomElement) {
    static override useShadowRoot = false;
    #toggle_btn: HTMLButtonElement;
    #panel_elm: HTMLElement;

    project: Project;

    override connectedCallback() {
        (async () => {
            this.project = await this.requestContext("project");
            super.connectedCallback();
        })();
    }

    override initialContentCallback() {
        super.initialContentCallback();

        this.#toggle_btn.addEventListener("click", () => {
            console.log("clicked");
            this.open = !this.open;
        });

        this.renderRoot.addEventListener("click", (e) => {
            const li = (e.target as HTMLElement).closest(
                "li[data-filename]",
            ) as HTMLElement;
            if (!li) {
                return;
            }

            e.stopPropagation();

            this.dispatchEvent(
                new CustomEvent("file:select", {
                    detail: {
                        filename: li.dataset["filename"],
                        type: li.dataset["type"],
                    },
                    bubbles: true,
                    composed: true,
                }),
            );
        });
    }

    set open(val: boolean) {
        if (val) {
            this.#panel_elm.removeAttribute("closed");
        } else {
            this.#panel_elm.setAttribute("closed", "");
        }
    }

    get open() {
        return !this.#panel_elm.hasAttribute("closed");
    }

    override render() {
        const file_btn_elms = [];

        console.log("rendering", this.project);

        for (const board of this.project.list_boards()) {
            file_btn_elms.push(
                html`<li
                    aria-role="button"
                    data-filename="${board}"
                    data-type="board">
                    <kc-ui-icon>plagiarism</kc-ui-icon>
                    ${board}
                </li>`,
            );
        }

        for (const schematic of this.project.list_schematics()) {
            file_btn_elms.push(
                html`<li
                    aria-role="button"
                    data-filename="${schematic}"
                    data-type="schematic">
                    <kc-ui-icon>description</kc-ui-icon>
                    ${schematic}
                </li>`,
            );
        }

        if (!this.#toggle_btn) {
            this.#toggle_btn = html`<button
                name="toggle"
                type="button"
                title="Project">
                <kc-ui-icon>folder</kc-ui-icon>
                <span>Project</span>
            </button>` as HTMLButtonElement;
        }

        this.#panel_elm = html`<kc-ui-floating-panel closed>
            <kc-ui-floating-panel-header>
                ${this.#toggle_btn}
            </kc-ui-floating-panel-header>
            <kc-ui-floating-panel-body>
                <ul class="item-list no-bg">
                    ${file_btn_elms}
                    <li aria-role="button">
                        <kc-ui-icon>receipt</kc-ui-icon>
                        Bill of materials
                    </li>
                </ul>
            </kc-ui-floating-panel-body>
        </kc-ui-floating-panel>` as HTMLElement;

        return this.#panel_elm;
    }
}

window.customElements.define("kc-project-panel", KCProjectPanelElement);