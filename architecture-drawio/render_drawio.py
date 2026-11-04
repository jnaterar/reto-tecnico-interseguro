#!/usr/bin/env python3
"""Renderiza los .drawio de este directorio a PNG (2x, fondo blanco).

Se usa un renderizador propio con Pillow porque el entorno no tiene la CLI de
draw.io. Respeta la geometría, colores, estilos, flechas y etiquetas definidos
en el XML, de modo que el PNG es una vista fiel del diagrama editable.
"""
from __future__ import annotations

import math
import re
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont

SCALE = 2
BORDER = 20

FONT_REGULAR = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Helvetica.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]
FONT_BOLD = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]

REPLACEMENTS = {
    "↔": "<->",
    "→": "->",
    "←": "<-",
    "⇒": "=>",
    "≥": ">=",
    "≤": "<=",
}


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    for src, dst in REPLACEMENTS.items():
        value = value.replace(src, dst)
    return value


def parse_style(style: str | None) -> dict[str, str]:
    result: dict[str, str] = {}
    if not style:
        return result
    for part in style.split(";"):
        part = part.strip()
        if not part:
            continue
        if "=" in part:
            key, val = part.split("=", 1)
            result[key.strip()] = val.strip()
        else:
            # Palabras clave sin valor (`text`, `ellipse`, ...) se guardan como clave vacía.
            result[part] = ""
    return result


def load_font(size: int, bold: bool) -> ImageFont.FreeTypeFont:
    candidates = FONT_BOLD if bold else FONT_REGULAR
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    if not text:
        return 0, 0
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        paragraph = paragraph.strip()
        if not paragraph:
            lines.append("")
            continue
        words = paragraph.split()
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            width, _ = text_size(draw, candidate, font)
            if width <= max_width or not current:
                current = candidate
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines


def draw_text_block(
    draw: ImageDraw.ImageDraw,
    text: str,
    box: tuple[float, float, float, float],
    font: ImageFont.FreeTypeFont,
    fill: str,
    align: str,
    valign: str,
    pad_x: float,
    pad_y: float,
) -> None:
    text = clean_text(text)
    if not text:
        return
    x0, y0, x1, y1 = box
    max_width = max(1, int((x1 - x0) - 2 * pad_x))
    lines = wrap_lines(draw, text, font, max_width)
    line_height = int(font.size * 1.28)
    total_height = line_height * max(1, len(lines))
    if valign == "top":
        start_y = y0 + pad_y
    elif valign == "bottom":
        start_y = y1 - pad_y - total_height
    else:
        start_y = y0 + ((y1 - y0) - total_height) / 2
    for index, line in enumerate(lines):
        width, _ = text_size(draw, line, font)
        if align == "left":
            x = x0 + pad_x
        elif align == "right":
            x = x1 - pad_x - width
        else:
            x = x0 + ((x1 - x0) - width) / 2
        draw.text((x, start_y + index * line_height), line, font=font, fill=fill)


def draw_dashed_segment(
    draw: ImageDraw.ImageDraw,
    p1: tuple[float, float],
    p2: tuple[float, float],
    fill: str,
    width: int,
    dash: float,
    gap: float,
) -> None:
    x1, y1 = p1
    x2, y2 = p2
    length = math.hypot(x2 - x1, y2 - y1)
    if length == 0:
        return
    ux, uy = (x2 - x1) / length, (y2 - y1) / length
    distance = 0.0
    while distance < length:
        end = min(distance + dash, length)
        draw.line(
            [(x1 + ux * distance, y1 + uy * distance), (x1 + ux * end, y1 + uy * end)],
            fill=fill,
            width=width,
        )
        distance += dash + gap


def draw_path(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[float, float]],
    fill: str,
    width: int,
    dashed: bool,
) -> None:
    for index in range(len(points) - 1):
        if dashed:
            draw_dashed_segment(draw, points[index], points[index + 1], fill, width, 10 * SCALE, 6 * SCALE)
        else:
            draw.line([points[index], points[index + 1]], fill=fill, width=width, joint="curve")


def draw_arrowhead(
    draw: ImageDraw.ImageDraw,
    tip: tuple[float, float],
    previous: tuple[float, float],
    fill: str,
) -> None:
    dx = tip[0] - previous[0]
    dy = tip[1] - previous[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    arrow_len = 11 * SCALE
    arrow_half = 5 * SCALE
    base_x = tip[0] - ux * arrow_len
    base_y = tip[1] - uy * arrow_len
    p1 = (base_x + px * arrow_half, base_y + py * arrow_half)
    p2 = (base_x - px * arrow_half, base_y - py * arrow_half)
    draw.polygon([tip, p1, p2], fill=fill)


def point_at_fraction(points: list[tuple[float, float]], fraction: float) -> tuple[float, float]:
    fraction = max(0.0, min(1.0, fraction))
    lengths = [math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]) for i in range(len(points) - 1)]
    total = sum(lengths)
    if total == 0:
        return points[0]
    target = total * fraction
    walked = 0.0
    for index, seg_len in enumerate(lengths):
        if walked + seg_len >= target:
            ratio = (target - walked) / seg_len if seg_len else 0.0
            x = points[index][0] + (points[index + 1][0] - points[index][0]) * ratio
            y = points[index][1] + (points[index + 1][1] - points[index][1]) * ratio
            return x, y
        walked += seg_len
    return points[-1]


def draw_edge_label(
    draw: ImageDraw.ImageDraw,
    text: str,
    point: tuple[float, float],
    font: ImageFont.FreeTypeFont,
    fill: str,
    background: str,
) -> None:
    text = clean_text(text)
    if not text:
        return
    lines = text.split("\n")
    line_height = int(font.size * 1.25)
    widths = [text_size(draw, line, font)[0] for line in lines]
    block_width = max(widths) if widths else 0
    block_height = line_height * len(lines)
    pad = 4 * SCALE
    left = point[0] - block_width / 2 - pad
    top = point[1] - block_height / 2 - pad
    right = point[0] + block_width / 2 + pad
    bottom = point[1] + block_height / 2 + pad
    if background and background != "none":
        draw.rounded_rectangle([left, top, right, bottom], radius=3 * SCALE, fill=background)
    for index, line in enumerate(lines):
        width = widths[index]
        x = point[0] - width / 2
        y = top + pad + index * line_height
        draw.text((x, y), line, font=font, fill=fill)


def render(drawio_path: Path, png_path: Path) -> None:
    tree = ET.parse(drawio_path)
    root = tree.getroot()
    model = root.find(".//mxGraphModel")
    if model is None:
        raise ValueError(f"No mxGraphModel en {drawio_path}")
    page_width = int(model.get("pageWidth", "1200"))
    page_height = int(model.get("pageHeight", "900"))
    canvas_width = page_width * SCALE + BORDER * 2
    canvas_height = page_height * SCALE + BORDER * 2
    image = Image.new("RGB", (canvas_width, canvas_height), "#ffffff")
    draw = ImageDraw.Draw(image)

    cells = {cell.get("id"): cell for cell in model.iter("mxCell")}
    vertices: dict[str, dict] = {}
    for cell_id, cell in cells.items():
        if cell.get("vertex") != "1":
            continue
        geometry = cell.find("mxGeometry")
        if geometry is None:
            continue
        style = parse_style(cell.get("style"))
        vertices[cell_id] = {
            "x": float(geometry.get("x", 0)),
            "y": float(geometry.get("y", 0)),
            "w": float(geometry.get("width", 0)),
            "h": float(geometry.get("height", 0)),
            "style": style,
            "value": cell.get("value", ""),
        }

    edges: list[dict] = []
    for cell in cells.values():
        if cell.get("edge") != "1":
            continue
        style = parse_style(cell.get("style"))
        geometry = cell.find("mxGeometry")
        points: list[tuple[float, float]] = []
        label_x = 0.0
        if geometry is not None:
            label_x = float(geometry.get("x", 0) or 0)
            array = geometry.find("Array")
            if array is not None:
                for point in array.findall("mxPoint"):
                    points.append((float(point.get("x", 0)), float(point.get("y", 0))))
        edges.append(
            {
                "source": cell.get("source"),
                "target": cell.get("target"),
                "style": style,
                "value": cell.get("value", ""),
                "points": points,
                "label_x": label_x,
            }
        )

    # Las zonas (contenedores etiquetados) se pintan primero: son fondo, van
    # debajo de las aristas y de las cajas. Se identifican por el prefijo `zona`.
    for cell_id, vertex in vertices.items():
        if not cell_id.startswith("zona"):
            continue
        style = vertex["style"]
        fill = style.get("fillColor", "none")
        stroke = style.get("strokeColor", "#000000")
        x0 = vertex["x"] * SCALE + BORDER
        y0 = vertex["y"] * SCALE + BORDER
        x1 = (vertex["x"] + vertex["w"]) * SCALE + BORDER
        y1 = (vertex["y"] + vertex["h"]) * SCALE + BORDER
        if fill and fill != "none":
            draw.rectangle([x0, y0, x1, y1], fill=fill)
        if stroke and stroke != "none":
            stroke_width = max(1, int(round(float(style.get("strokeWidth", 1)) * SCALE)))
            if style.get("dashed") == "1":
                pattern: list[float] = []
                for part in style.get("dashPattern", "8 4").split():
                    try:
                        pattern.append(float(part))
                    except ValueError:
                        continue
                dash = (pattern[0] if pattern else 8.0) * SCALE
                gap = (pattern[1] if len(pattern) > 1 else pattern[0] if pattern else 4.0) * SCALE
                corners = ((x0, y0), (x1, y0), (x1, y1), (x0, y1))
                for index in range(4):
                    draw_dashed_segment(draw, corners[index], corners[(index + 1) % 4], stroke, stroke_width, dash, gap)
            else:
                draw.rectangle([x0, y0, x1, y1], outline=stroke, width=stroke_width)
        font_size = int(float(style.get("fontSize", 13)) * SCALE)
        font = load_font(font_size, style.get("fontStyle") == "1")
        draw_text_block(
            draw,
            vertex["value"],
            (x0, y0, x1, y1),
            font,
            style.get("fontColor", "#000000"),
            style.get("align", "left"),
            style.get("verticalAlign", "top"),
            float(style.get("spacingLeft", 8)) * SCALE,
            float(style.get("spacingTop", 6)) * SCALE,
        )

    # Draw edges first so boxes sit on top of route lines.
    for edge in edges:
        source = vertices.get(edge["source"])
        target = vertices.get(edge["target"])
        if source is None or target is None:
            continue
        style = edge["style"]
        color = style.get("strokeColor", "#000000")
        width = max(1, int(round(float(style.get("strokeWidth", 1)) * SCALE)))
        dashed = style.get("dashed") == "1"

        exit_x = style.get("exitX")
        exit_y = style.get("exitY")
        entry_x = style.get("entryX")
        entry_y = style.get("entryY")

        if exit_x is None or exit_y is None:
            scx = source["x"] + source["w"] / 2
            scy = source["y"] + source["h"] / 2
            tcx = target["x"] + target["w"] / 2
            tcy = target["y"] + target["h"] / 2
            if abs(tcx - scx) < max(source["w"], target["w"]) / 3:
                if tcy >= scy:
                    exit_x, exit_y = "0.5", "1"
                else:
                    exit_x, exit_y = "0.5", "0"
            elif tcx >= scx:
                exit_x, exit_y = "1", "0.5"
            else:
                exit_x, exit_y = "0", "0.5"
        if entry_x is None or entry_y is None:
            scx = source["x"] + source["w"] / 2
            scy = source["y"] + source["h"] / 2
            tcx = target["x"] + target["w"] / 2
            tcy = target["y"] + target["h"] / 2
            if abs(tcx - scx) < max(source["w"], target["w"]) / 3:
                if tcy >= scy:
                    entry_x, entry_y = "0.5", "0"
                else:
                    entry_x, entry_y = "0.5", "1"
            elif tcx >= scx:
                entry_x, entry_y = "0", "0.5"
            else:
                entry_x, entry_y = "1", "0.5"

        start = (
            (source["x"] + float(exit_x) * source["w"]) * SCALE + BORDER,
            (source["y"] + float(exit_y) * source["h"]) * SCALE + BORDER,
        )
        end = (
            (target["x"] + float(entry_x) * target["w"]) * SCALE + BORDER,
            (target["y"] + float(entry_y) * target["h"]) * SCALE + BORDER,
        )
        path = [start]
        for px, py in edge["points"]:
            path.append((px * SCALE + BORDER, py * SCALE + BORDER))
        if len(path) == 1:
            if abs(end[0] - start[0]) < 2 or abs(end[1] - start[1]) < 2:
                path.append(end)
            else:
                mid_x = (start[0] + end[0]) / 2
                path.extend([(mid_x, start[1]), (mid_x, end[1]), end])
        else:
            path.append(end)

        draw_path(draw, path, color, width, dashed)
        draw_arrowhead(draw, path[-1], path[-2], color)

    # Draw vertices (las zonas ya se pintaron al fondo).
    for cell_id, vertex in vertices.items():
        if cell_id.startswith("zona"):
            continue
        style = vertex["style"]
        text = vertex["value"]
        fill = style.get("fillColor", "none")
        stroke = style.get("strokeColor", "#000000")
        font_color = style.get("fontColor", "#000000")
        font_size = int(float(style.get("fontSize", 12)) * SCALE)
        bold = style.get("fontStyle") == "1"
        font = load_font(font_size, bold)
        align = style.get("align", "center")
        valign = style.get("verticalAlign", "middle")
        stroke_width = max(1, int(round(float(style.get("strokeWidth", 1)) * SCALE)))
        x0 = vertex["x"] * SCALE + BORDER
        y0 = vertex["y"] * SCALE + BORDER
        x1 = (vertex["x"] + vertex["w"]) * SCALE + BORDER
        y1 = (vertex["y"] + vertex["h"]) * SCALE + BORDER

        # `text` es una palabra clave sin valor en el estilo de draw.io; parse_style
        # la guarda como clave vacía, así que basta con comprobar su presencia.
        is_text_only = "text" in style or "text" in style.get("shape", "")
        if not is_text_only:
            if style.get("shape") == "cylinder3":
                radius_y = min(14 * SCALE, (y1 - y0) * 0.16)
                if fill and fill != "none":
                    draw.ellipse([x0, y1 - 2 * radius_y, x1, y1], fill=fill)
                    draw.rectangle([x0, y0 + radius_y, x1, y1 - radius_y], fill=fill)
                draw.arc([x0, y1 - 2 * radius_y, x1, y1], start=0, end=180, fill=stroke, width=stroke_width)
                draw.ellipse([x0, y0, x1, y0 + 2 * radius_y], fill=fill if fill != "none" else None, outline=stroke, width=stroke_width)
                draw.line([(x0, y0 + radius_y), (x0, y1 - radius_y)], fill=stroke, width=stroke_width)
                draw.line([(x1, y0 + radius_y), (x1, y1 - radius_y)], fill=stroke, width=stroke_width)
            else:
                radius = 10 * SCALE if style.get("rounded") == "1" else 0
                draw.rounded_rectangle(
                    [x0, y0, x1, y1],
                    radius=radius,
                    fill=fill if fill != "none" else None,
                    outline=stroke if stroke != "none" else None,
                    width=stroke_width,
                )

        pad_x = float(style.get("spacingLeft", 8)) * SCALE
        pad_y = float(style.get("spacingTop", 6)) * SCALE
        draw_text_block(draw, text, (x0, y0, x1, y1), font, font_color, align, valign, pad_x, pad_y)

    # Draw edge labels on top.
    for edge in edges:
        source = vertices.get(edge["source"])
        target = vertices.get(edge["target"])
        if source is None or target is None or not edge["value"]:
            continue
        style = edge["style"]
        color = style.get("fontColor", "#000000")
        background = style.get("labelBackgroundColor", "#ffffff")
        font_size = int(float(style.get("fontSize", 11)) * SCALE)
        font = load_font(font_size, False)

        exit_x = style.get("exitX", "0.5")
        exit_y = style.get("exitY", "1")
        entry_x = style.get("entryX", "0.5")
        entry_y = style.get("entryY", "0")
        start = (
            (source["x"] + float(exit_x) * source["w"]) * SCALE + BORDER,
            (source["y"] + float(exit_y) * source["h"]) * SCALE + BORDER,
        )
        end = (
            (target["x"] + float(entry_x) * target["w"]) * SCALE + BORDER,
            (target["y"] + float(entry_y) * target["h"]) * SCALE + BORDER,
        )
        path = [start]
        for px, py in edge["points"]:
            path.append((px * SCALE + BORDER, py * SCALE + BORDER))
        if len(path) == 1:
            if abs(end[0] - start[0]) < 2 or abs(end[1] - start[1]) < 2:
                path.append(end)
            else:
                mid_x = (start[0] + end[0]) / 2
                path.extend([(mid_x, start[1]), (mid_x, end[1]), end])
        else:
            path.append(end)
        fraction = (edge["label_x"] + 1) / 2
        label_point = point_at_fraction(path, fraction)
        draw_edge_label(draw, edge["value"], label_point, font, color, background)

    image.save(png_path, "PNG", optimize=True)
    print(f"OK {png_path} ({image.width}x{image.height})")


def main() -> int:
    base = Path(__file__).resolve().parent
    targets = [
        (base / "as-is.drawio", base / "as-is.png"),
        (base / "to-be.drawio", base / "to-be.png"),
    ]
    for source, output in targets:
        if source.exists():
            render(source, output)
        else:
            print(f"Falta {source}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
