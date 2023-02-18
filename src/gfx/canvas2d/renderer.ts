/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Renderer, RenderLayer, RenderStateStack } from "../renderer";
import { Matrix3 } from "../../math/matrix3";
import { Arc, Circle, Polygon, Polyline } from "../shapes";
import { Color } from "../color";
import { Vec2 } from "../../math/vec2";
import { Angle } from "../../math/angle";

/**
 * Canvas2d-based renderer.
 *
 * This renderer works by turning draw calls into DrawCommands - basically
 * serializing them as Path2D + state. These DrawCommands are combined into
 * multiple Layers. When the layers are later drawn, the draw commands are
 * stepped through and draw onto the canvas.
 *
 * This is similar to generating old-school display lists.
 *
 */
export class Canvas2DRenderer extends Renderer {
    /** Graphics layers */
    #layers: Canvas2dRenderLayer[] = [];

    /** The layer currently being drawn to. */
    #active_layer: Canvas2dRenderLayer | null;

    /** State */
    override state: RenderStateStack = new RenderStateStack();

    ctx2d?: CanvasRenderingContext2D;

    /**
     * Create a new Canvas2DRenderer
     */
    constructor(canvas: HTMLCanvasElement) {
        super(canvas);
    }

    /**
     * Create and configure the 2D Canvas context.
     */
    override async setup() {
        // just in case the browser still gives us a backbuffer with alpha,
        // set the background color of the canvas to black so that it behaves
        // correctly.
        this.canvas.style.backgroundColor = this.background_color.to_css();

        const ctx2d = this.canvas.getContext("2d", {
            alpha: false,
            desynchronized: true,
        });

        if (ctx2d == null) {
            throw new Error("Unable to create Canvas2d context");
        }

        this.ctx2d = ctx2d;
        this.update_viewport();
    }

    override dispose() {
        this.ctx2d = undefined;
    }

    override update_viewport() {
        const dpr = window.devicePixelRatio;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = Math.round(rect.width * dpr);
        this.canvas.height = Math.round(rect.height * dpr);
        this.ctx2d!.setTransform();
    }

    override clear_canvas() {
        this.ctx2d!.setTransform();
        this.ctx2d!.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.ctx2d!.fillStyle = this.background_color.to_css();
        this.ctx2d!.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx2d!.lineCap = "round";
        this.ctx2d!.lineJoin = "round";
    }

    override start_layer(name: string) {
        this.#active_layer = new Canvas2dRenderLayer(this, name);
    }

    override end_layer(): RenderLayer {
        if (!this.#active_layer) {
            throw new Error("No active layer");
        }

        this.#layers.push(this.#active_layer);
        this.#active_layer = null;

        return this.#layers.at(-1)!;
    }

    override arc(
        arc_or_center: Arc | Vec2,
        radius?: number,
        start_angle?: Angle,
        end_angle?: Angle,
        width?: number,
        color?: Color,
    ): void {
        super.prep_arc(
            arc_or_center,
            radius,
            start_angle,
            end_angle,
            width,
            color,
        );
    }

    override circle(
        circle_or_center: Circle | Vec2,
        radius?: number,
        color?: Color,
    ): void {
        const circle = super.prep_circle(circle_or_center, radius, color);

        if (!circle.color || circle.color.is_transparent_black) {
            return;
        }

        const css_color = (circle.color as Color).to_css();

        const path = new Path2D();
        path.arc(
            circle.center.x,
            circle.center.y,
            circle.radius,
            0,
            Math.PI * 2,
        );

        this.#active_layer!.commands.push(
            new DrawCommand(path, css_color, null, 0),
        );
    }

    override line(
        line_or_points: Polyline | Vec2[],
        width?: number,
        color?: Color,
    ): void {
        const line = super.prep_line(line_or_points, width, color);

        if (!line.color || line.color.is_transparent_black) {
            return;
        }

        const css_color = (line.color as Color).to_css();

        const path = new Path2D();
        let started = false;

        for (const point of line.points) {
            if (!started) {
                path.moveTo(point.x, point.y);
                started = true;
            } else {
                path.lineTo(point.x, point.y);
            }
        }

        this.#active_layer!.commands.push(
            new DrawCommand(path, null, css_color, line.width),
        );
    }

    override polygon(polygon_or_points: Polygon | Vec2[], color?: Color): void {
        const polygon = super.prep_polygon(polygon_or_points, color);

        if (!polygon.color || polygon.color.is_transparent_black) {
            return;
        }

        const css_color = (polygon.color as Color).to_css();

        const path = new Path2D();
        let started = false;

        for (const point of polygon.points) {
            if (!started) {
                path.moveTo(point.x, point.y);
                started = true;
            } else {
                path.lineTo(point.x, point.y);
            }
        }
        path.closePath();

        this.#active_layer!.commands.push(
            new DrawCommand(path, css_color, null, 0),
        );
    }

    override get layers() {
        const layers = this.#layers;
        return {
            *[Symbol.iterator]() {
                for (const layer of layers) {
                    yield layer;
                }
            },
        };
    }
}

class DrawCommand {
    public path_count = 1;

    constructor(
        public path: Path2D,
        public fill: string | null,
        public stroke: string | null,
        public stroke_width: number,
    ) {}

    render(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = this.fill ?? "black";
        ctx.strokeStyle = this.stroke ?? "black";
        ctx.lineWidth = this.stroke_width;
        if (this.fill) {
            ctx.fill(this.path);
        }
        if (this.stroke) {
            ctx.stroke(this.path);
        }
    }
}

class Canvas2dRenderLayer extends RenderLayer {
    constructor(
        public override readonly renderer: Renderer,
        public override readonly name: string,
        public commands: DrawCommand[] = [],
    ) {
        super(renderer, name);
    }

    dispose(): void {
        this.clear();
    }

    clear() {
        this.commands = [];
    }

    push_path(
        path: Path2D,
        fill: string | null,
        stroke: string | null,
        stroke_width: number,
    ) {
        const last_command = this.commands.at(-1);

        if (
            last_command &&
            (last_command.path_count < 20,
            last_command.fill == fill &&
                last_command.stroke == stroke &&
                last_command.stroke_width == stroke_width)
        ) {
            last_command.path.addPath(path);
            last_command.path_count++;
        } else {
            this.commands.push(
                new DrawCommand(path, fill, stroke, stroke_width),
            );
        }
    }

    render(transform: Matrix3) {
        const ctx = (this.renderer as Canvas2DRenderer).ctx2d;

        if (!ctx) {
            throw new Error("No CanvasRenderingContext2D!");
        }

        ctx.save();

        ctx.globalCompositeOperation = this.composite_operation;

        const accumulated_transform = Matrix3.from_DOMMatrix(
            ctx.getTransform(),
        );
        accumulated_transform.multiply_self(transform);
        ctx.setTransform(accumulated_transform.to_DOMMatrix());

        for (const command of this.commands) {
            command.render(ctx);
        }

        ctx.globalCompositeOperation = "source-over";
        ctx.restore();
    }
}
