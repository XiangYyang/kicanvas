/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

/**
 * Painters for drawing board items.
 *
 * Each item class has a corresponding Painter implementation.
 */

import { Angle, Arc, Matrix3, Vec2 } from "../../base/math";
import * as log from "../../base/log";
import { Circle, Color, Polygon, Polyline, Renderer } from "../../graphics";
import * as board_items from "../../kicad/board";
import { EDAText, StrokeFont, TextAttributes } from "../../kicad/text";
import { DocumentPainter, ItemPainter } from "../base/painter";
import { NetNameLayerNames, ViewLayerNames } from "../base/view-layers";
import * as Layers from "./layers";
import { ViewLayer, LayerNames } from "./layers";
import type { BoardTheme } from "../../kicad";

abstract class BoardItemPainter extends ItemPainter {
    override view_painter: BoardPainter;

    override get theme(): BoardTheme {
        return this.view_painter.theme;
    }

    /** Alias for BoardPainter.filter_net */
    get filter_net(): number | null {
        return (this.view_painter as BoardPainter).filter_net;
    }
}

/**
 * Object with netname painter
 */
abstract class BoardItemNetNamePainter<T> extends BoardItemPainter {
    /**
     * Drawing the netname on `center` in region `region`
     */
    protected paint_net_name_text(
        net_name: string,
        center: Vec2,
        region: Vec2,
        max_font_size: number,
    ) {
        const font_attr = new TextAttributes();

        // White color, with 75% opacity
        font_attr.color = Color.white.with_alpha(0.75);

        // Calcuate the font size
        // make sure that the string can be placed in the middle of the pad
        const single_width = region.x / net_name.length;
        const netname_font_size = Math.min(max_font_size, single_width * 10000);
        font_attr.size = new Vec2(netname_font_size, netname_font_size);
        font_attr.stroke_width = netname_font_size / 8;

        // Drawing the text
        StrokeFont.default().draw(this.gfx, net_name, center, font_attr);
    }

    /**
     * Drawing the element (such as pads, segments)
     */
    protected abstract paint_element(layer: ViewLayer, element: T): void;

    /**
     * Drawing the net name
     */
    protected abstract paint_net_name(
        layer: ViewLayer,
        element: T,
        region: Vec2,
    ): void;
}

class LinePainter extends BoardItemPainter {
    classes = [board_items.GrLine, board_items.FpLine];

    layers_for(item: board_items.GrLine | board_items.FpLine) {
        return [item.layer];
    }

    paint(layer: ViewLayer, s: board_items.GrLine | board_items.FpLine) {
        if (this.filter_net) return;

        const points = [s.start, s.end];
        this.gfx.line(new Polyline(points, s.width, layer.color));
    }
}

class RectPainter extends BoardItemPainter {
    classes = [board_items.GrRect, board_items.FpRect];

    layers_for(item: board_items.GrRect | board_items.FpRect) {
        return [item.layer];
    }

    paint(layer: ViewLayer, r: board_items.GrRect | board_items.FpRect) {
        if (this.filter_net) return;

        const color = layer.color;
        const points = [
            r.start,
            new Vec2(r.start.x, r.end.y),
            r.end,
            new Vec2(r.end.x, r.start.y),
            r.start,
        ];

        this.gfx.line(new Polyline(points, r.width, color));

        if (r.fill && r.fill != "none") {
            this.gfx.polygon(new Polygon(points, color));
        }
    }
}

class PolyPainter extends BoardItemPainter {
    classes = [board_items.Poly, board_items.GrPoly, board_items.FpPoly];

    layers_for(
        item: board_items.Poly | board_items.GrPoly | board_items.FpPoly,
    ) {
        return [item.layer];
    }

    paint(
        layer: ViewLayer,
        p: board_items.Poly | board_items.GrPoly | board_items.FpPoly,
    ) {
        if (this.filter_net) return;

        const color = layer.color;

        if (p.width) {
            this.gfx.line(new Polyline([...p.pts, p.pts[0]!], p.width, color));
        }

        if (p.fill && p.fill != "none") {
            this.gfx.polygon(new Polygon(p.pts, color));
        }
    }
}

class ArcPainter extends BoardItemPainter {
    classes = [board_items.GrArc, board_items.FpArc];

    layers_for(item: board_items.GrArc | board_items.FpArc) {
        return [item.layer];
    }

    paint(layer: ViewLayer, a: board_items.GrArc | board_items.FpArc) {
        if (this.filter_net) return;

        const arc = a.arc;
        const points = arc.to_polyline();
        this.gfx.line(new Polyline(points, arc.width, layer.color));
    }
}

class CirclePainter extends BoardItemPainter {
    classes = [board_items.GrCircle, board_items.FpCircle];

    layers_for(item: board_items.GrCircle | board_items.FpCircle) {
        return [item.layer];
    }

    paint(layer: ViewLayer, c: board_items.GrCircle | board_items.FpCircle) {
        if (this.filter_net) return;

        const color = layer.color;

        const radius = c.center.sub(c.end).magnitude;
        const arc = new Arc(
            c.center,
            radius,
            new Angle(0),
            new Angle(2 * Math.PI),
            c.width,
        );

        if (c.fill && c.fill != "none") {
            this.gfx.circle(
                new Circle(arc.center, arc.radius + (c.width ?? 0), color),
            );
        } else {
            const points = arc.to_polyline();
            this.gfx.line(new Polyline(points, arc.width, color));
        }
    }
}

class TraceSegmentPainter extends BoardItemNetNamePainter<board_items.LineSegment> {
    classes = [board_items.LineSegment];

    layers_for(item: board_items.LineSegment) {
        const net_name_layer = Layers.virtual_layer_for(
            item.layer,
            Layers.CopperVirtualLayerNames.copper_net_name,
        );
        if (Object.values<string>(NetNameLayerNames).includes(net_name_layer)) {
            return [net_name_layer, item.layer];
        } else {
            return [item.layer];
        }
    }

    paint(layer: ViewLayer, s: board_items.LineSegment) {
        if (layer.name.includes("NetName")) {
            const angle = TraceSegmentPainter.line_angle(s.start, s.end);
            const begin_pos = TraceSegmentPainter.line_begin(s.start, s.end);
            const line_length = TraceSegmentPainter.line_length(s.start, s.end);

            const position_mat = Matrix3.translation(begin_pos.x, begin_pos.y);
            position_mat.rotate_self(-angle);
            // The center position
            position_mat.translate_self(line_length / 2, 0);

            this.gfx.state.push();
            this.gfx.state.multiply(position_mat);

            this.paint_net_name(layer, s);

            this.gfx.state.pop();
        } else {
            this.paint_element(layer, s);
        }
    }

    paint_element(layer: ViewLayer, s: board_items.LineSegment) {
        if (this.filter_net && s.net != this.filter_net) {
            return;
        }

        const points = [s.start, s.end];
        this.gfx.line(new Polyline(points, s.width, layer.color));
    }

    paint_net_name(layer: ViewLayer, s: board_items.LineSegment) {
        const line_len = TraceSegmentPainter.line_length(s.start, s.end);
        const line_box = new Vec2(line_len, s.width);
        const net_name = `net:${s.net}`;

        if (line_len / net_name.length > s.width) {
            this.paint_net_name_text(
                net_name,
                new Vec2(0, 0),
                line_box,
                s.width * 6500,
            );
        }
    }

    /**
     * Calcuate the inclination angle of a line (start -> end)
     *
     * The angle \in [0, 180)
     */
    private static line_angle(start: Vec2, end: Vec2): number {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        if ((angle < 0 && angle > -Math.PI) || angle === Math.PI) {
            return angle + Math.PI;
        } else {
            return angle;
        }
    }

    /**
     * Calcuate beginning position
     */
    private static line_begin(start: Vec2, end: Vec2): Vec2 {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        if ((angle < 0 && angle > -Math.PI) || angle === Math.PI) {
            // end -> start
            return end;
        } else {
            // start -> end
            return start;
        }
    }

    /**
     * Calcuate the line length
     */
    private static line_length(start: Vec2, end: Vec2): number {
        const dir_vec = new Vec2(end.x - start.x, end.y - start.y);
        return dir_vec.magnitude;
    }
}

class TraceArcPainter extends BoardItemPainter {
    classes = [board_items.ArcSegment];

    layers_for(item: board_items.ArcSegment) {
        return [item.layer];
    }

    paint(layer: ViewLayer, a: board_items.ArcSegment) {
        if (this.filter_net && a.net != this.filter_net) {
            return;
        }

        const arc = Arc.from_three_points(a.start, a.mid, a.end, a.width);
        const points = arc.to_polyline();
        this.gfx.line(new Polyline(points, arc.width, layer.color));
    }
}

class ViaPainter extends BoardItemNetNamePainter<board_items.Via> {
    classes = [board_items.Via];

    layers_for(v: board_items.Via): string[] {
        if (v.layers) {
            // blind/buried vias have two layers - the start and end layer,
            // and should only be drawn on the layers they're actually on.
            const layers = [];

            for (const cu_layer of Layers.copper_layers_between(
                v.layers[0]!,
                v.layers[1]!,
            )) {
                layers.push(
                    Layers.virtual_layer_for(
                        cu_layer,
                        Layers.CopperVirtualLayerNames.bb_via_holes,
                    ),
                );
                layers.push(
                    Layers.virtual_layer_for(
                        cu_layer,
                        Layers.CopperVirtualLayerNames.bb_via_hole_walls,
                    ),
                );
            }
            // Add the netname virtual names
            if (v.type === "through-hole") {
                // For the through-hole via, add the front and the back layers
                layers.push(
                    Layers.virtual_layer_for(
                        "F.Cu",
                        Layers.CopperVirtualLayerNames.copper_net_name,
                    ),
                );
                layers.push(
                    Layers.virtual_layer_for(
                        "B.Cu",
                        Layers.CopperVirtualLayerNames.copper_net_name,
                    ),
                );
            } else {
                for (const cu_layer of Layers.copper_layers_between(
                    v.layers[0]!,
                    v.layers[1]!,
                )) {
                    layers.push(
                        Layers.virtual_layer_for(
                            cu_layer,
                            Layers.CopperVirtualLayerNames.copper_net_name,
                        ),
                    );
                }
            }
            return layers;
        } else {
            return [LayerNames.via_holes, LayerNames.via_holewalls];
        }
    }

    paint(layer: ViewLayer, v: board_items.Via) {
        if (layer.name.includes("NetName")) {
            const position_mat = Matrix3.translation(
                v.at.position.x,
                v.at.position.y,
            );

            this.gfx.state.push();
            this.gfx.state.multiply(position_mat);

            this.paint_net_name(layer, v);

            this.gfx.state.pop();
        } else {
            this.paint_element(layer, v);
        }
    }

    paint_element(layer: ViewLayer, v: board_items.Via) {
        if (this.filter_net && v.net != this.filter_net) {
            return;
        }

        const color = layer.color;
        if (
            layer.name.endsWith("HoleWalls") ||
            layer.name == ViewLayerNames.overlay
        ) {
            this.gfx.circle(new Circle(v.at.position, v.size / 2, color));
        } else if (layer.name.endsWith("Holes")) {
            this.gfx.circle(new Circle(v.at.position, v.drill / 2, color));

            // Draw start and end layer markers
            if ((v.type == "blind" || v.type == "micro") && v.layers) {
                this.gfx.arc(
                    v.at.position,
                    v.size / 2 - v.size / 8,
                    Angle.from_degrees(180 + 70),
                    Angle.from_degrees(360 - 70),
                    v.size / 4,
                    layer.layer_set.by_name(v.layers[0]!)?.color ??
                        Color.transparent_black,
                );
                this.gfx.arc(
                    v.at.position,
                    v.size / 2 - v.size / 8,
                    Angle.from_degrees(70),
                    Angle.from_degrees(180 - 70),
                    v.size / 4,
                    layer.layer_set.by_name(v.layers[1]!)?.color ??
                        Color.transparent_black,
                );
            }
        }
    }

    paint_net_name(layer: ViewLayer, v: board_items.Via) {
        const via_box = new Vec2(v.size, v.size);
        const net_name = `net:${v.net}`;

        this.paint_net_name_text(
            net_name,
            new Vec2(0, 0),
            via_box,
            via_box.x * 6500,
        );
    }
}

class ZonePainter extends BoardItemPainter {
    classes = [board_items.Zone];

    layers_for(z: board_items.Zone): string[] {
        const layers = z.layers ?? [z.layer];

        if (layers.length && layers[0] == "F&B.Cu") {
            layers.shift();
            layers.push("F.Cu", "B.Cu");
        }

        return layers.map((l) => {
            if (Layers.CopperLayerNames.includes(l as LayerNames)) {
                return Layers.virtual_layer_for(
                    l,
                    Layers.CopperVirtualLayerNames.zones,
                );
            } else {
                return l;
            }
        });
    }

    paint(layer: ViewLayer, z: board_items.Zone) {
        if (!z.filled_polygons) {
            return;
        }

        if (this.filter_net && z.net != this.filter_net) {
            return;
        }

        for (const p of z.filled_polygons) {
            if (
                !layer.name.includes(p.layer) &&
                layer.name != ViewLayerNames.overlay
            ) {
                continue;
            }

            this.gfx.polygon(new Polygon(p.pts, layer.color));
        }
    }
}

class PadPainter extends BoardItemNetNamePainter<board_items.Pad> {
    classes = [board_items.Pad];

    layers_for(pad: board_items.Pad): string[] {
        // TODO: Port KiCAD's logic over.
        const layers: string[] = [];

        if (pad.type === "thru_hole") {
            // Add the netname
            layers.push(LayerNames.net_name_hole);
        }

        for (const layer of pad.layers) {
            if (layer == "*.Cu") {
                layers.push(LayerNames.pads_front);
                layers.push(LayerNames.pads_back);
            } else if (layer == "F.Cu") {
                layers.push(LayerNames.net_name_front);
                layers.push(LayerNames.pads_front);
            } else if (layer == "B.Cu") {
                layers.push(LayerNames.net_name_back);
                layers.push(LayerNames.pads_back);
            } else if (layer == "*.Mask") {
                layers.push(LayerNames.f_mask);
                layers.push(LayerNames.b_mask);
            } else if (layer == "*.Paste") {
                layers.push(LayerNames.f_paste);
                layers.push(LayerNames.b_paste);
            } else {
                layers.push(layer);
            }
        }

        switch (pad.type) {
            case "thru_hole":
                layers.push(LayerNames.pad_holewalls);
                layers.push(LayerNames.pad_holes);
                break;
            case "np_thru_hole":
                layers.push(LayerNames.non_plated_holes);
                break;
            case "smd":
            case "connect":
                break;
            default:
                log.warn(`Unhandled pad type "${pad.type}"`);
                break;
        }

        return layers;
    }

    paint(layer: ViewLayer, pad: board_items.Pad) {
        if (this.filter_net && pad.net?.number != this.filter_net) {
            return;
        }

        const position_mat = Matrix3.translation(
            pad.at.position.x,
            pad.at.position.y,
        );

        this.gfx.state.push();

        if (layer.name.includes("NetName")) {
            const mirror = layer.name.startsWith(":B");
            const [text_angle, text_region] = PadPainter.text_rotating_tactics(
                mirror,
                pad.parent.at.rotation,
                pad.at.rotation,
                pad.size,
            );

            position_mat.rotate_self(Angle.deg_to_rad(text_angle));

            this.gfx.state.multiply(position_mat);

            this.paint_net_name(layer, pad, text_region);
        } else {
            // Rotating the pads
            position_mat.rotate_self(-Angle.deg_to_rad(pad.parent.at.rotation));
            position_mat.rotate_self(Angle.deg_to_rad(pad.at.rotation));

            this.gfx.state.multiply(position_mat);

            this.paint_element(layer, pad);
        }

        this.gfx.state.pop();
    }

    /**
     * Drawing the pad shape
     */
    paint_element(layer: ViewLayer, pad: board_items.Pad) {
        const color = layer.color;

        const center = new Vec2(0, 0);

        const is_hole_layer =
            layer.name == LayerNames.pad_holes ||
            layer.name == LayerNames.non_plated_holes;

        if (is_hole_layer && pad.drill != null) {
            if (!pad.drill.oval) {
                const drill_pos = center.add(pad.drill.offset);
                this.gfx.circle(
                    new Circle(drill_pos, pad.drill.diameter / 2, color),
                );
            } else {
                const half_size = new Vec2(
                    pad.drill.diameter / 2,
                    (pad.drill.width ?? 0) / 2,
                );

                const half_width = Math.min(half_size.x, half_size.y);

                const half_len = new Vec2(
                    half_size.x - half_width,
                    half_size.y - half_width,
                );

                const drill_pos = center.add(pad.drill.offset);
                const drill_start = drill_pos.sub(half_len);
                const drill_end = drill_pos.add(half_len);

                this.gfx.line(
                    new Polyline(
                        [drill_start, drill_end],
                        half_width * 2,
                        color,
                    ),
                );
            }
        } else {
            let shape = pad.shape;
            if (shape == "custom" && pad.options?.anchor) {
                shape = pad.options.anchor;
            }

            if (pad.drill?.offset) {
                this.gfx.state.matrix.translate_self(
                    pad.drill.offset.x,
                    pad.drill.offset.y,
                );
            }

            switch (shape) {
                case "circle":
                    this.gfx.circle(new Circle(center, pad.size.x / 2, color));
                    break;
                case "rect":
                    {
                        const rect_points = [
                            new Vec2(-pad.size.x / 2, -pad.size.y / 2),
                            new Vec2(pad.size.x / 2, -pad.size.y / 2),
                            new Vec2(pad.size.x / 2, pad.size.y / 2),
                            new Vec2(-pad.size.x / 2, pad.size.y / 2),
                        ];
                        this.gfx.polygon(new Polygon(rect_points, color));
                    }
                    break;
                case "roundrect":
                case "trapezoid":
                    // KiCAD approximates rounded rectangle using four line segments
                    // with their width set to the round radius. Clever bastards.
                    // Since our polylines aren't filled, we'll add both a polygon
                    // and a polyline.
                    {
                        const rounding =
                            Math.min(pad.size.x, pad.size.y) *
                            (pad.roundrect_rratio ?? 0);
                        let half_size = new Vec2(
                            pad.size.x / 2,
                            pad.size.y / 2,
                        );
                        half_size = half_size.sub(new Vec2(rounding, rounding));

                        let trap_delta = pad.rect_delta
                            ? pad.rect_delta.copy()
                            : new Vec2(0, 0);
                        trap_delta = trap_delta.multiply(0.5);

                        const rect_points = [
                            new Vec2(
                                -half_size.x - trap_delta.y,
                                half_size.y + trap_delta.x,
                            ),
                            new Vec2(
                                half_size.x + trap_delta.y,
                                half_size.y - trap_delta.x,
                            ),
                            new Vec2(
                                half_size.x - trap_delta.y,
                                -half_size.y + trap_delta.x,
                            ),
                            new Vec2(
                                -half_size.x + trap_delta.y,
                                -half_size.y - trap_delta.x,
                            ),
                        ];

                        // this.gfx.push_transform(offset_mat);
                        this.gfx.polygon(new Polygon(rect_points, color));
                        this.gfx.line(
                            new Polyline(
                                [...rect_points, rect_points[0]!],
                                rounding * 2,
                                color,
                            ),
                        );
                        // this.gfx.pop_transform();
                    }
                    break;

                case "oval":
                    {
                        const half_size = new Vec2(
                            pad.size.x / 2,
                            pad.size.y / 2,
                        );
                        const half_width = Math.min(half_size.x, half_size.y);
                        const half_len = new Vec2(
                            half_size.x - half_width,
                            half_size.y - half_width,
                        );

                        const pad_pos = center.add(
                            pad.drill?.offset || new Vec2(0, 0),
                        );
                        const pad_start = pad_pos.sub(half_len);
                        const pad_end = pad_pos.add(half_len);

                        if (pad_start.equals(pad_end)) {
                            this.gfx.circle(
                                new Circle(pad_pos, half_width, color),
                            );
                        } else {
                            this.gfx.line(
                                new Polyline(
                                    [pad_start, pad_end],
                                    half_width * 2,
                                    color,
                                ),
                            );
                        }
                    }
                    break;

                default:
                    log.warn(`Unknown pad shape "${pad.shape}"`);
                    break;
            }

            if (pad.shape == "custom" && pad.primitives) {
                for (const prim of pad.primitives) {
                    this.view_painter.paint_item(layer, prim);
                }
            }
        }
    }

    /**
     * Drawing the net name and pin number on the pad
     */
    paint_net_name(layer: ViewLayer, pad: board_items.Pad, region: Vec2) {
        // Scale to 10000 times the size.
        const pad_min_size_scale = region.y * 10000;

        // Calculate the middle position of the network name and the pin number
        const net_name_center = new Vec2(
            0,
            pad.net ? -(pad_min_size_scale / 6) : 0,
        );

        // The pin number font size
        const pin_font_size = pad_min_size_scale / (pad.net ? 3 : 2);

        // Drawing the pin number
        this.paint_net_name_text(
            pad.number,
            net_name_center,
            region,
            pin_font_size,
        );

        // Drawing the net name
        if (pad.net) {
            let net_name: string;
            if (pad.pintype.indexOf("no_connect") !== -1) {
                // The pin is no connection
                net_name = "X";
            } else {
                // Split the network name, and only display the last one
                const level_names = pad.net.name.split("/");
                net_name = level_names.slice(-1)[0]!;
            }

            this.paint_net_name_text(
                net_name,
                new Vec2(0, pin_font_size * 0.7),
                region,
                pin_font_size * 0.9,
            );
        }
    }

    /**
     * Calcuating the rotating angle for the text, to keep that display is easier to read.
     *
     */
    private static text_rotating_tactics(
        mirror: boolean,
        body_rotating: number,
        pad_rotating: number,
        rect: Vec2,
    ): [number, Vec2] {
        let angle = -body_rotating + pad_rotating;

        const pad_angle = pad_rotating < 0 ? 360 + pad_rotating : pad_rotating;

        if (rect.x < rect.y) {
            angle += 90;
            if (pad_angle > 0 && pad_angle <= 180) {
                angle += mirror ? 180 : -180;
            }
        } else {
            if (pad_angle > 90 && pad_angle <= 270) {
                angle += mirror ? 180 : -180;
            }
        }

        // make sure that the long side is the X-axis
        if (rect.y > rect.x) {
            return [angle % 360, new Vec2(rect.y, rect.x)];
        } else {
            return [angle % 360, new Vec2(rect.x, rect.y)];
        }
    }
}

class GrTextPainter extends BoardItemPainter {
    classes = [board_items.GrText];

    layers_for(t: board_items.GrText) {
        return [t.layer.name];
    }

    paint(layer: ViewLayer, t: board_items.GrText) {
        if (this.filter_net) return;

        if (t.hide || !t.shown_text) {
            return;
        }

        if (t.render_cache) {
            for (const poly of t.render_cache.polygons) {
                this.view_painter.paint_item(layer, poly);
            }
            return;
        }

        const edatext = new EDAText(t.shown_text);

        edatext.apply_effects(t.effects);
        edatext.apply_at(t.at);

        edatext.attributes.color = layer.color;

        this.gfx.state.push();
        StrokeFont.default().draw(
            this.gfx,
            edatext.shown_text,
            edatext.text_pos,
            edatext.attributes,
        );
        this.gfx.state.pop();
    }
}

class FpTextPainter extends BoardItemPainter {
    classes = [board_items.FpText];

    layers_for(t: board_items.FpText) {
        if (t.hide) {
            return [];
        } else {
            return [t.layer.name];
        }
    }

    paint(layer: ViewLayer, t: board_items.FpText) {
        if (this.filter_net) return;

        if (t.hide || !t.shown_text) {
            return;
        }

        if (t.render_cache) {
            this.gfx.state.push();
            this.gfx.state.matrix = Matrix3.identity();
            for (const poly of t.render_cache.polygons) {
                this.view_painter.paint_item(layer, poly);
            }
            this.gfx.state.pop();
            return;
        }

        const edatext = new EDAText(t.shown_text);

        edatext.apply_effects(t.effects);
        edatext.apply_at(t.at);

        edatext.attributes.keep_upright = !t.at.unlocked;
        edatext.attributes.color = layer.color;

        if (t.parent) {
            const rot = Angle.from_degrees(t.parent.at.rotation);
            let pos = edatext.text_pos;
            pos = rot.rotate_point(pos, new Vec2(0, 0));
            pos = pos.add(t.parent.at.position.multiply(10000));
            edatext.text_pos.set(pos);
        }

        if (edatext.attributes.keep_upright) {
            while (edatext.text_angle.degrees > 90) {
                edatext.text_angle.degrees -= 180;
            }
            while (edatext.text_angle.degrees <= -90) {
                edatext.text_angle.degrees += 180;
            }
        }

        this.gfx.state.push();
        this.gfx.state.matrix = Matrix3.identity();

        StrokeFont.default().draw(
            this.gfx,
            edatext.shown_text,
            edatext.text_pos,
            edatext.attributes,
        );
        this.gfx.state.pop();
    }
}

class DimensionPainter extends BoardItemPainter {
    classes = [board_items.Dimension];

    layers_for(d: board_items.Dimension): string[] {
        return [d.layer];
    }

    paint(layer: ViewLayer, d: board_items.Dimension) {
        switch (d.type) {
            case "orthogonal":
            case "aligned":
                this.paint_linear(layer, d);
                break;
            case "center":
                this.paint_center(layer, d);
                break;
            case "radial":
                this.paint_radial(layer, d);
                break;
            case "leader":
                this.paint_leader(layer, d);
                break;
        }
    }

    paint_center(layer: ViewLayer, d: board_items.Dimension) {
        const thickness = d.style.thickness ?? 0.2;

        let arm = d.end.sub(d.start);
        this.gfx.line(
            [d.start.sub(arm), d.start.add(arm)],
            thickness,
            layer.color,
        );

        arm = Angle.from_degrees(90).rotate_point(arm);
        this.gfx.line(
            [d.start.sub(arm), d.start.add(arm)],
            thickness,
            layer.color,
        );
    }

    paint_radial(layer: ViewLayer, d: board_items.Dimension) {
        const thickness = d.style.thickness ?? 0.2;

        const center = d.start.copy();
        let center_arm = new Vec2(0, d.style.arrow_length);

        // Cross shape
        this.gfx.line(
            [center.sub(center_arm), center.add(center_arm)],
            thickness,
            layer.color,
        );

        center_arm = Angle.from_degrees(90).rotate_point(center_arm);
        this.gfx.line(
            [center.sub(center_arm), center.add(center_arm)],
            thickness,
            layer.color,
        );

        // Line from center to text.
        let radial = d.end.sub(d.start);
        radial = radial.resize(d.leader_length);

        const text = this.make_text(layer, d);
        const text_bbox = text.get_text_box().scale(1 / 10000);

        const line_segs = [d.end, d.end.add(radial), d.gr_text.at.position];

        const textbox_pt = text_bbox.intersect_segment(
            line_segs[1]!,
            line_segs[2]!,
        );

        if (textbox_pt) {
            line_segs[2] = textbox_pt;
        }

        this.gfx.line(line_segs, thickness, layer.color);

        // Arrows
        const arrow_angle = Angle.from_degrees(27.5);
        const inv_radial_angle = radial.angle.negative();
        const arrow_seg = new Vec2(d.style.arrow_length, 0);
        const arrow_end_pos = inv_radial_angle
            .add(arrow_angle)
            .rotate_point(arrow_seg);
        const arrow_end_neg = inv_radial_angle
            .sub(arrow_angle)
            .rotate_point(arrow_seg);

        this.gfx.line(
            [d.end.add(arrow_end_neg), d.end, d.end.add(arrow_end_pos)],
            thickness,
            layer.color,
        );

        // Text
        this.paint_text(text);
    }

    paint_leader(layer: ViewLayer, d: board_items.Dimension) {
        const thickness = d.style.thickness ?? 0.2;

        // Line from center to text.
        const text = this.make_text(layer, d);
        const text_bbox = text
            .get_text_box()
            .grow(text.text_width / 2, text.get_effective_text_thickness() * 2)
            .scale(1 / 10000);

        const start = d.start.add(
            d.end.sub(d.start).resize(d.style.extension_offset),
        );
        const line_segs = [start, d.end, d.gr_text.at.position];

        const textbox_pt = text_bbox.intersect_segment(
            line_segs[1]!,
            line_segs[2]!,
        );

        if (textbox_pt) {
            line_segs[2] = textbox_pt;
        }

        this.gfx.line(line_segs, thickness, layer.color);

        // Outline
        if (d.style.text_frame == 1) {
            this.gfx.line(
                Polyline.from_BBox(text_bbox, thickness, layer.color),
            );
        }
        if (d.style.text_frame == 2) {
            const radius =
                text_bbox.w / 2 -
                text.get_effective_text_thickness() / 10000 / 2;
            this.gfx.arc(
                text_bbox.center,
                radius,
                Angle.from_degrees(0),
                Angle.from_degrees(360),
                thickness,
                layer.color,
            );
        }

        // Arrows
        const radial = d.end.sub(d.start);
        const arrow_angle = Angle.from_degrees(27.5);
        const inv_radial_angle = radial.angle.negative();
        const arrow_seg = new Vec2(d.style.arrow_length, 0);
        const arrow_end_pos = inv_radial_angle
            .add(arrow_angle)
            .rotate_point(arrow_seg);
        const arrow_end_neg = inv_radial_angle
            .sub(arrow_angle)
            .rotate_point(arrow_seg);

        this.gfx.line(
            [start.add(arrow_end_neg), start, start.add(arrow_end_pos)],
            thickness,
            layer.color,
        );

        // Text
        this.paint_text(text);
    }

    paint_linear(layer: ViewLayer, d: board_items.Dimension) {
        const thickness = d.style.thickness ?? 0.2;

        let extension = new Vec2();
        let xbar_start = new Vec2();
        let xbar_end = new Vec2();

        // See PCB_DIM_ORTHOGONAL::updateGeometry
        if (d.type == "orthogonal") {
            if (d.orientation == 0) {
                extension = new Vec2(0, d.height);
                xbar_start = d.start.add(extension);
                xbar_end = new Vec2(d.end.x, xbar_start.y);
            } else {
                extension = new Vec2(d.height, 0);
                xbar_start = d.start.add(extension);
                xbar_end = new Vec2(xbar_start.x, d.end.y);
            }
        }
        // See PCB_DIM_ALIGNED::updateGeometry
        else {
            const dimension = d.end.sub(d.start);
            if (d.height > 0) {
                extension = new Vec2(-dimension.y, dimension.x);
            } else {
                extension = new Vec2(dimension.y, -dimension.x);
            }

            const xbar_distance = extension
                .resize(d.height)
                .multiply(Math.sign(d.height));

            xbar_start = d.start.add(xbar_distance);
            xbar_end = d.end.add(xbar_distance);
        }

        // Draw extensions
        const extension_height =
            Math.abs(d.height) -
            d.style.extension_offset +
            d.style.extension_height;

        // First extension line
        let ext_start = d.start.add(extension.resize(d.style.extension_offset));
        let ext_end = ext_start.add(extension.resize(extension_height));
        this.gfx.line([ext_start, ext_end], thickness, layer.color);

        // Second extension line
        ext_start = d.end.add(extension.resize(d.style.extension_offset));
        ext_end = ext_start.add(extension.resize(extension_height));
        this.gfx.line([ext_start, ext_end], thickness, layer.color);

        // Draw crossbar
        // TODO: KiCAD checks to see if the text overlaps the crossbar and
        // conditionally splits or hides the crossbar.
        this.gfx.line([xbar_start, xbar_end], thickness, layer.color);

        // Arrows
        const xbar_angle = xbar_end.sub(xbar_start).angle.negative();
        const arrow_angle = Angle.from_degrees(27.5);
        const arrow_end_pos = xbar_angle
            .add(arrow_angle)
            .rotate_point(new Vec2(d.style.arrow_length, 0));
        const arrow_end_neg = xbar_angle
            .sub(arrow_angle)
            .rotate_point(new Vec2(d.style.arrow_length, 0));

        this.gfx.line(
            [
                xbar_start.add(arrow_end_neg),
                xbar_start,
                xbar_start.add(arrow_end_pos),
            ],
            thickness,
            layer.color,
        );
        this.gfx.line(
            [
                xbar_end.sub(arrow_end_neg),
                xbar_end,
                xbar_end.sub(arrow_end_pos),
            ],
            thickness,
            layer.color,
        );

        // Text
        this.paint_text(this.make_text(layer, d));
    }

    make_text(layer: ViewLayer, d: board_items.Dimension) {
        const pcbtext = new EDAText(d.gr_text.shown_text);
        pcbtext.apply_effects(d.gr_text.effects);
        pcbtext.apply_at(d.gr_text.at);
        pcbtext.attributes.color = layer.color;

        return pcbtext;
    }

    paint_text(text: EDAText) {
        this.gfx.state.push();
        StrokeFont.default().draw(
            this.gfx,
            text.shown_text,
            text.text_pos,
            text.attributes,
        );
        this.gfx.state.pop();
    }
}

class FootprintPainter extends BoardItemPainter {
    classes = [board_items.Footprint];

    layers_for(fp: board_items.Footprint): string[] {
        const layers = new Set();
        for (const item of fp.items()) {
            const item_layers = this.view_painter.layers_for(item);
            for (const layer of item_layers) {
                layers.add(layer);
            }
        }
        return Array.from(layers.values()) as string[];
    }

    paint(layer: ViewLayer, fp: board_items.Footprint) {
        const matrix = Matrix3.translation(
            fp.at.position.x,
            fp.at.position.y,
        ).rotate_self(Angle.deg_to_rad(fp.at.rotation));

        this.gfx.state.push();
        this.gfx.state.multiply(matrix);

        for (const item of fp.items()) {
            const item_layers = this.view_painter.layers_for(item);
            if (
                layer.name == ViewLayerNames.overlay ||
                item_layers.includes(layer.name)
            ) {
                this.view_painter.paint_item(layer, item);
            }
        }

        this.gfx.state.pop();
    }
}

export class BoardPainter extends DocumentPainter {
    override theme: BoardTheme;

    constructor(gfx: Renderer, layers: Layers.LayerSet, theme: BoardTheme) {
        super(gfx, layers, theme);
        this.painter_list = [
            new LinePainter(this, gfx),
            new RectPainter(this, gfx),
            new PolyPainter(this, gfx),
            new ArcPainter(this, gfx),
            new CirclePainter(this, gfx),
            new TraceSegmentPainter(this, gfx),
            new TraceArcPainter(this, gfx),
            new ViaPainter(this, gfx),
            new ZonePainter(this, gfx),
            new PadPainter(this, gfx),
            new FootprintPainter(this, gfx),
            new GrTextPainter(this, gfx),
            new FpTextPainter(this, gfx),
            new DimensionPainter(this, gfx),
        ];
    }

    // Used to filter out items by net when highlighting nets. Painters
    // should use this to determine whether to draw or skip the current item.
    filter_net: number | null = null;

    paint_net(board: board_items.KicadPCB, net: number) {
        const layer = this.layers.overlay;

        this.filter_net = net;

        layer.clear();
        layer.color = Color.white;
        this.gfx.start_layer(layer.name);

        for (const item of board.items()) {
            const painter = this.painter_for(item);

            if (!painter) {
                continue;
            }

            this.paint_item(layer, item);
        }

        layer.graphics = this.gfx.end_layer();
        layer.graphics.composite_operation = "overlay";
        this.filter_net = null;
    }
}
