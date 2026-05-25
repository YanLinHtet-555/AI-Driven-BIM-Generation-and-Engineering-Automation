import math
from ..models.schemas import BuildingModel, RoomType

SCALE   = 22.0   # px per metre
PAD     = 44     # outer padding inside the translate group
DIM_L   = 56     # extra left margin for vertical dim annotations
DIM_T   = 54     # extra top  margin for horizontal dim annotations
TITLE_H = 52     # height of title block at bottom

BG_COLOR     = "#f5f4f0"
EXT_WALL_CLR = "#1c1c1c"
INT_WALL_CLR = "#4a4a4a"
COL_CLR      = "#0d0d0d"
DIM_CLR      = "#445566"

ROOM_FILL = {
    RoomType.LIVING:       "#faf9f5",
    RoomType.DINING:       "#fefdf5",
    RoomType.KITCHEN:      "#fdf8ec",
    RoomType.BEDROOM:      "#eef3fc",
    RoomType.BATHROOM:     "#eef8fd",
    RoomType.TOILET:       "#f3eefd",
    RoomType.OFFICE:       "#f4faee",
    RoomType.LOBBY:        "#fdf8ee",
    RoomType.CORRIDOR:     "#f5f5f3",
    RoomType.STAIRCASE:    "#ededf5",
    RoomType.STORAGE:      "#f3f3f1",
    RoomType.MEETING_ROOM: "#fdf0f5",
    RoomType.PARKING:      "#edf4ed",
}


def _px(m: float) -> float:
    return m * SCALE + PAD


def _build_wall_map(walls: list) -> dict:
    return {w.id: w for w in walls}


# ── Room rendering ────────────────────────────────────────────────────────────

def _room_el(room) -> str:
    pts  = " ".join(f"{_px(p.x):.1f},{_px(p.y):.1f}" for p in room.polygon)
    fill = ROOM_FILL.get(room.type, "#f8f8f5")
    xs   = [p.x for p in room.polygon]; ys = [p.y for p in room.polygon]
    cx   = _px((min(xs) + max(xs)) / 2)
    cy   = _px((min(ys) + max(ys)) / 2)
    pw   = (max(xs) - min(xs)) * SCALE
    ph   = (max(ys) - min(ys)) * SCALE

    out = [f'<polygon points="{pts}" fill="{fill}" stroke="#c8c8c4" stroke-width="0.4"/>']

    if pw > 30 and ph > 20:
        fs = max(7, min(11, int(min(pw, ph) / 5.5)))
        out.append(
            f'<text x="{cx:.1f}" y="{cy:.1f}" text-anchor="middle" dominant-baseline="middle" '
            f'font-family="Arial,Helvetica,sans-serif" font-size="{fs}" fill="#222233" '
            f'font-weight="600" letter-spacing="0.5">{room.name.upper()}</text>'
        )
        if pw > 50 and ph > 36:
            out.append(
                f'<text x="{cx:.1f}" y="{cy + fs + 3:.1f}" text-anchor="middle" '
                f'dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" '
                f'font-size="{fs - 1}" fill="#555566">{room.area:.1f} m²</text>'
            )
    return "\n".join(out)


def _staircase_el(room) -> str:
    xs = [p.x for p in room.polygon]; ys = [p.y for p in room.polygon]
    x0, x1 = min(xs), max(xs); y0, y1 = min(ys), max(ys)
    h = y1 - y0

    pts  = " ".join(f"{_px(p.x):.1f},{_px(p.y):.1f}" for p in room.polygon)
    fill = ROOM_FILL.get(RoomType.STAIRCASE, "#ededf5")
    out  = [f'<polygon points="{pts}" fill="{fill}" stroke="#c8c8c4" stroke-width="0.4"/>']

    n_treads = max(2, int(h / 0.25))
    for i in range(1, n_treads):
        y = y0 + i * h / n_treads
        py = _px(y)
        out.append(
            f'<line x1="{_px(x0+0.05):.1f}" y1="{py:.1f}" '
            f'x2="{_px(x1-0.05):.1f}" y2="{py:.1f}" '
            f'stroke="#9090a8" stroke-width="0.7"/>'
        )

    # Direction arrow
    cx   = _px((x0 + x1) / 2)
    ay0  = _px(y1 - 0.25); ay1 = _px(y0 + 0.25)
    out.append(
        f'<line x1="{cx:.1f}" y1="{ay0:.1f}" x2="{cx:.1f}" y2="{ay1:.1f}" '
        f'stroke="#5555aa" stroke-width="1.2" marker-end="url(#stair-arrow)"/>'
    )
    fs = max(6, min(9, int(min(x1 - x0, h) * SCALE / 6.5)))
    out.append(
        f'<text x="{cx:.1f}" y="{_px(y0 + h * 0.82):.1f}" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-size="{fs}" fill="#3333aa" '
        f'font-weight="700">UP</text>'
    )
    return "\n".join(out)


# ── Wall rendering ────────────────────────────────────────────────────────────

def _wall_thick_el(wall) -> str:
    dx = wall.end.x - wall.start.x
    dy = wall.end.y - wall.start.y
    lng = math.sqrt(dx * dx + dy * dy)
    if lng < 0.001:
        return ""
    ux = dx / lng; uy = dy / lng
    nx = -uy;      ny = ux
    t  = wall.thickness / 2

    p1x = wall.start.x + nx * t; p1y = wall.start.y + ny * t
    p2x = wall.end.x   + nx * t; p2y = wall.end.y   + ny * t
    p3x = wall.end.x   - nx * t; p3y = wall.end.y   - ny * t
    p4x = wall.start.x - nx * t; p4y = wall.start.y - ny * t
    pts  = (f"{_px(p1x):.1f},{_px(p1y):.1f} {_px(p2x):.1f},{_px(p2y):.1f} "
            f"{_px(p3x):.1f},{_px(p3y):.1f} {_px(p4x):.1f},{_px(p4y):.1f}")
    fill = EXT_WALL_CLR if wall.is_external else INT_WALL_CLR
    return f'<polygon points="{pts}" fill="{fill}" stroke="none"/>'


def _opening_cut(cx_m, cy_m, width_m, wall, fill="#f5f4f0") -> str:
    """Return a filled polygon that cuts an opening through a wall."""
    dx  = wall.end.x - wall.start.x
    dy  = wall.end.y - wall.start.y
    lng = math.sqrt(dx * dx + dy * dy)
    if lng < 0.001:
        return ""
    ux = dx / lng; uy = dy / lng
    nx = -uy;      ny = ux
    t2 = wall.thickness * 0.6 + 0.02   # slightly beyond wall faces
    w  = width_m / 2

    p1x = cx_m - ux*w + nx*t2; p1y = cy_m - uy*w + ny*t2
    p2x = cx_m + ux*w + nx*t2; p2y = cy_m + uy*w + ny*t2
    p3x = cx_m + ux*w - nx*t2; p3y = cy_m + uy*w - ny*t2
    p4x = cx_m - ux*w - nx*t2; p4y = cy_m - uy*w - ny*t2
    pts  = (f"{_px(p1x):.1f},{_px(p1y):.1f} {_px(p2x):.1f},{_px(p2y):.1f} "
            f"{_px(p3x):.1f},{_px(p3y):.1f} {_px(p4x):.1f},{_px(p4y):.1f}")
    return f'<polygon points="{pts}" fill="{fill}" stroke="none"/>'


def _door_opening_el(door, wall_map: dict) -> str:
    wall = wall_map.get(door.wall_id)
    if not wall:
        return ""
    return _opening_cut(door.position.x, door.position.y, door.width, wall)


def _door_symbol_el(door, wall_map: dict) -> str:
    """Quarter-circle door swing arc + leaf line."""
    wall = wall_map.get(door.wall_id)
    w    = door.width

    if not wall:
        cx = _px(door.position.x); cy = _px(door.position.y)
        r  = w * SCALE / 2
        return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" '
                f'fill="none" stroke="#1a1a1a" stroke-width="0.8" stroke-dasharray="3,2"/>')

    dx  = wall.end.x - wall.start.x
    dy  = wall.end.y - wall.start.y
    lng = math.sqrt(dx * dx + dy * dy)
    if lng < 0.001:
        return ""
    ux = dx / lng; uy = dy / lng
    nx = -uy;      ny = ux

    hx  = door.position.x - ux * w / 2; hy  = door.position.y - uy * w / 2
    fx  = door.position.x + ux * w / 2; fy  = door.position.y + uy * w / 2
    lx  = hx + nx * w;                  ly  = hy + ny * w

    phx = _px(hx); phy = _px(hy)
    pfx = _px(fx); pfy = _px(fy)
    plx = _px(lx); ply = _px(ly)
    r   = w * SCALE

    # Cross product of (leaf-hinge) × (far-hinge) is always −w² → sweep-flag=0 (CCW)
    return (
        f'<line x1="{phx:.1f}" y1="{phy:.1f}" x2="{plx:.1f}" y2="{ply:.1f}" '
        f'stroke="#1a1a1a" stroke-width="1.5"/>\n'
        f'<path d="M {plx:.1f},{ply:.1f} A {r:.1f},{r:.1f} 0 0,0 {pfx:.1f},{pfy:.1f}" '
        f'fill="none" stroke="#1a1a1a" stroke-width="0.9"/>'
    )


def _window_symbol_el(win, wall_map: dict) -> str:
    """Three parallel glazing lines + light-blue fill in window opening."""
    wall = wall_map.get(win.wall_id)
    ww   = win.width

    if not wall:
        cx = _px(win.position.x); hw = ww * SCALE / 2
        cy = _px(win.position.y)
        return (f'<rect x="{cx-hw:.1f}" y="{cy-3:.1f}" width="{ww*SCALE:.1f}" height="6" '
                f'fill="#dff0f8" stroke="#0288d1" stroke-width="1"/>')

    dx  = wall.end.x - wall.start.x
    dy  = wall.end.y - wall.start.y
    lng = math.sqrt(dx * dx + dy * dy)
    if lng < 0.001:
        return ""
    ux = dx / lng; uy = dy / lng
    nx = -uy;      ny = ux
    t  = wall.thickness
    cx = win.position.x; cy = win.position.y

    out = [_opening_cut(cx, cy, ww, wall, fill="#dff0f8")]

    # Three glazing lines: outer frame, glass, inner frame
    for frac in (-0.42, 0.0, 0.42):
        off = frac * t
        x1  = cx - ux*ww/2 + nx*off; y1 = cy - uy*ww/2 + ny*off
        x2  = cx + ux*ww/2 + nx*off; y2 = cy + uy*ww/2 + ny*off
        c   = "#0288d1" if frac == 0.0 else "#2a2a2a"
        sw  = "0.7" if frac == 0.0 else "1.4"
        out.append(
            f'<line x1="{_px(x1):.1f}" y1="{_px(y1):.1f}" '
            f'x2="{_px(x2):.1f}" y2="{_px(y2):.1f}" stroke="{c}" stroke-width="{sw}"/>'
        )
    return "\n".join(out)


# ── Structural elements ───────────────────────────────────────────────────────

def _col_el(col) -> str:
    cx = _px(col.position.x); cy = _px(col.position.y)
    hw = col.width * SCALE / 2; hd = col.depth * SCALE / 2
    x0 = cx - hw; y0 = cy - hd
    w  = col.width * SCALE; h = col.depth * SCALE
    return (
        f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{w:.1f}" height="{h:.1f}" '
        f'fill="{COL_CLR}" stroke="#000000" stroke-width="0.5"/>\n'
        f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x0+w:.1f}" y2="{y0+h:.1f}" '
        f'stroke="#ffffff" stroke-width="0.7" opacity="0.5"/>\n'
        f'<line x1="{x0+w:.1f}" y1="{y0:.1f}" x2="{x0:.1f}" y2="{y0+h:.1f}" '
        f'stroke="#ffffff" stroke-width="0.7" opacity="0.5"/>'
    )


def _beam_el(beam) -> str:
    return (f'<line x1="{_px(beam.start.x):.1f}" y1="{_px(beam.start.y):.1f}" '
            f'x2="{_px(beam.end.x):.1f}" y2="{_px(beam.end.y):.1f}" '
            f'stroke="#888899" stroke-width="1.5" stroke-dasharray="6,3" opacity="0.55"/>')


# ── MEP elements (unchanged functionality, cleaner colours) ───────────────────

def _duct_el(duct) -> str:
    return (f'<line x1="{_px(duct.start.x):.1f}" y1="{_px(duct.start.y):.1f}" '
            f'x2="{_px(duct.end.x):.1f}" y2="{_px(duct.end.y):.1f}" '
            f'stroke="#007a8a" stroke-width="{max(2, duct.width * SCALE * 0.4):.1f}" opacity="0.75"/>')


def _terminal_el(term) -> str:
    cx = _px(term.position.x); cy = _px(term.position.y)
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="4" fill="#00bcd4" stroke="#006064" stroke-width="1"/>'
            f'<line x1="{cx-4:.1f}" y1="{cy:.1f}" x2="{cx+4:.1f}" y2="{cy:.1f}" stroke="#006064" stroke-width="0.8"/>'
            f'<line x1="{cx:.1f}" y1="{cy-4:.1f}" x2="{cx:.1f}" y2="{cy+4:.1f}" stroke="#006064" stroke-width="0.8"/>')


def _pipe_el(pipe) -> str:
    c = "#1565c0" if pipe.system == "cold_water" else "#7b1fa2"
    w = max(1, pipe.diameter * SCALE * 0.5)
    return (f'<line x1="{_px(pipe.start.x):.1f}" y1="{_px(pipe.start.y):.1f}" '
            f'x2="{_px(pipe.end.x):.1f}" y2="{_px(pipe.end.y):.1f}" '
            f'stroke="{c}" stroke-width="{w:.1f}" stroke-dasharray="4,2" opacity="0.75"/>')


def _fixture_el(fix) -> str:
    cx = _px(fix.position.x); cy = _px(fix.position.y)
    return (f'<rect x="{cx-4:.1f}" y="{cy-4:.1f}" width="8" height="8" '
            f'fill="#1565c0" stroke="#0d47a1" stroke-width="1" opacity="0.75"/>')


def _cable_el(cable) -> str:
    c = "#f9a825" if cable.circuit == "power" else "#ffd600"
    return (f'<line x1="{_px(cable.start.x):.1f}" y1="{_px(cable.start.y):.1f}" '
            f'x2="{_px(cable.end.x):.1f}" y2="{_px(cable.end.y):.1f}" '
            f'stroke="{c}" stroke-width="1" opacity="0.55"/>')


def _light_el(lf) -> str:
    cx = _px(lf.position.x); cy = _px(lf.position.y)
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="3" fill="#ffd600" stroke="#f57f17" stroke-width="0.8"/>'


def _db_el(db) -> str:
    cx = _px(db.position.x); cy = _px(db.position.y)
    return (f'<rect x="{cx-5:.1f}" y="{cy-5:.1f}" width="10" height="10" '
            f'fill="#e53935" stroke="#b71c1c" stroke-width="1" opacity="0.85"/>')


# ── Reference grid ────────────────────────────────────────────────────────────

def _render_metric_grid(site_w: float, site_h: float) -> list:
    lines = []
    x = 0.0
    while x <= site_w + 0.001:
        major = abs(round(x / 5) * 5 - x) < 0.01
        c  = "#c0cad4" if major else "#dde4ea"
        sw = "0.6" if major else "0.3"
        px = _px(x)
        lines.append(
            f'<line x1="{px:.1f}" y1="{_px(0):.1f}" x2="{px:.1f}" y2="{_px(site_h):.1f}" '
            f'stroke="{c}" stroke-width="{sw}"/>')
        x = round(x + 1.0, 6)
    y = 0.0
    while y <= site_h + 0.001:
        major = abs(round(y / 5) * 5 - y) < 0.01
        c  = "#c0cad4" if major else "#dde4ea"
        sw = "0.6" if major else "0.3"
        py = _px(y)
        lines.append(
            f'<line x1="{_px(0):.1f}" y1="{py:.1f}" x2="{_px(site_w):.1f}" y2="{py:.1f}" '
            f'stroke="{c}" stroke-width="{sw}"/>')
        y = round(y + 1.0, 6)
    return lines


def _struct_grid_col_xs(sg) -> list:
    xs = [sg.origin_x]
    for sp in sg.spacings_x:
        xs.append(xs[-1] + sp)
    return xs


def _struct_grid_row_ys(sg) -> list:
    ys = [sg.origin_y]
    for sp in sg.spacings_y:
        ys.append(ys[-1] + sp)
    return ys


def _render_struct_grid_lines(model: BuildingModel, site_w: float, site_h: float) -> list:
    if not model.structural_grid:
        return []
    sg    = model.structural_grid
    lines = []
    for x in _struct_grid_col_xs(sg):
        px = _px(x)
        lines.append(
            f'<line x1="{px:.1f}" y1="{_px(0):.1f}" x2="{px:.1f}" y2="{_px(site_h):.1f}" '
            f'stroke="#8faabb" stroke-width="0.7" stroke-dasharray="9,4" opacity="0.5"/>')
    for y in _struct_grid_row_ys(sg):
        py = _px(y)
        lines.append(
            f'<line x1="{_px(0):.1f}" y1="{py:.1f}" x2="{_px(site_w):.1f}" y2="{py:.1f}" '
            f'stroke="#8faabb" stroke-width="0.7" stroke-dasharray="9,4" opacity="0.5"/>')
    return lines


# ── Dimension annotations ─────────────────────────────────────────────────────

def _tick(cx: float, cy: float) -> str:
    h = 4.5
    return (f'<line x1="{cx - h/2:.1f}" y1="{cy + h/2:.1f}" '
            f'x2="{cx + h/2:.1f}" y2="{cy - h/2:.1f}" '
            f'stroke="{DIM_CLR}" stroke-width="1.2"/>')


def _dim_h(x1_m: float, x2_m: float, y_line: float, label: str = "") -> str:
    px1 = _px(x1_m); px2 = _px(x2_m)
    if not label:
        d = abs(x2_m - x1_m)
        label = f"{d:.0f}m" if d == int(d) else f"{d:.1f}m"
    mx = (px1 + px2) / 2
    y_bldg = _px(0)
    return "\n".join([
        f'<line x1="{px1:.1f}" y1="{y_bldg:.1f}" x2="{px1:.1f}" y2="{y_line - 2:.1f}" '
        f'stroke="#9aacbc" stroke-width="0.5" stroke-dasharray="2,2"/>',
        f'<line x1="{px2:.1f}" y1="{y_bldg:.1f}" x2="{px2:.1f}" y2="{y_line - 2:.1f}" '
        f'stroke="#9aacbc" stroke-width="0.5" stroke-dasharray="2,2"/>',
        f'<line x1="{px1:.1f}" y1="{y_line:.1f}" x2="{px2:.1f}" y2="{y_line:.1f}" '
        f'stroke="{DIM_CLR}" stroke-width="0.8"/>',
        _tick(px1, y_line), _tick(px2, y_line),
        f'<text x="{mx:.1f}" y="{y_line - 3:.1f}" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-size="8" fill="{DIM_CLR}">{label}</text>',
    ])


def _dim_v(y1_m: float, y2_m: float, x_line: float, label: str = "") -> str:
    py1 = _px(y1_m); py2 = _px(y2_m)
    if not label:
        d = abs(y2_m - y1_m)
        label = f"{d:.0f}m" if d == int(d) else f"{d:.1f}m"
    my = (py1 + py2) / 2
    x_bldg = _px(0)
    return "\n".join([
        f'<line x1="{x_bldg:.1f}" y1="{py1:.1f}" x2="{x_line + 2:.1f}" y2="{py1:.1f}" '
        f'stroke="#9aacbc" stroke-width="0.5" stroke-dasharray="2,2"/>',
        f'<line x1="{x_bldg:.1f}" y1="{py2:.1f}" x2="{x_line + 2:.1f}" y2="{py2:.1f}" '
        f'stroke="#9aacbc" stroke-width="0.5" stroke-dasharray="2,2"/>',
        f'<line x1="{x_line:.1f}" y1="{py1:.1f}" x2="{x_line:.1f}" y2="{py2:.1f}" '
        f'stroke="{DIM_CLR}" stroke-width="0.8"/>',
        _tick(x_line, py1), _tick(x_line, py2),
        f'<text x="{x_line - 3:.1f}" y="{my:.1f}" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-size="8" fill="{DIM_CLR}" '
        f'transform="rotate(-90 {x_line - 3:.1f} {my:.1f})">{label}</text>',
    ])


def _render_dims(model: BuildingModel) -> list:
    reqs   = model.requirements
    site_w = reqs.site_width
    site_h = reqs.site_depth
    out    = []
    out.append(_dim_h(0, site_w, y_line=10))
    out.append(_dim_v(0, site_h, x_line=10))
    if model.structural_grid:
        sg = model.structural_grid
        xs = _struct_grid_col_xs(sg); ys = _struct_grid_row_ys(sg)
        if len(xs) > 1:
            for i in range(len(xs) - 1):
                out.append(_dim_h(xs[i], xs[i + 1], y_line=26))
        if len(ys) > 1:
            for i in range(len(ys) - 1):
                out.append(_dim_v(ys[i], ys[i + 1], x_line=26))
    return out


# ── Structural grid labels (bubble circles) ───────────────────────────────────

def _grid_bubble(x_m: float, y_m: float, label: str, axis: str) -> str:
    r   = 8
    px  = _px(x_m); py = _px(y_m)
    off = r + 6
    if axis == "h":
        bx, by = px, _px(0) - off
    else:
        bx, by = _px(0) - off, py
    return (
        f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="{r}" '
        f'fill="white" stroke="#445566" stroke-width="1.2"/>'
        f'<text x="{bx:.1f}" y="{by:.1f}" text-anchor="middle" dominant-baseline="middle" '
        f'font-family="Arial,sans-serif" font-size="7" fill="#445566" font-weight="700">{label}</text>'
    )


# ── Scale bar ─────────────────────────────────────────────────────────────────

def _scale_bar(total_w: float, total_h: float) -> str:
    bar5  = 5 * SCALE          # pixels = 5m
    bx    = DIM_L + PAD + 4    # align roughly with building left edge
    by    = total_h - TITLE_H + 10
    bar_w = bar5 * 2           # 10 m total
    return "\n".join([
        f'<rect x="{bx:.1f}"        y="{by:.1f}" width="{bar5:.1f}" height="5" fill="#333333"/>',
        f'<rect x="{bx+bar5:.1f}"   y="{by:.1f}" width="{bar5:.1f}" height="5" '
        f'fill="white" stroke="#333333" stroke-width="0.8"/>',
        f'<text x="{bx:.1f}"        y="{by+14:.1f}" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-size="7" fill="#333333">0</text>',
        f'<text x="{bx+bar5:.1f}"   y="{by+14:.1f}" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-size="7" fill="#333333">5m</text>',
        f'<text x="{bx+bar_w:.1f}"  y="{by+14:.1f}" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-size="7" fill="#333333">10m</text>',
        f'<text x="{bx+bar_w+10:.1f}" y="{by+6:.1f}" '
        f'font-family="Arial,sans-serif" font-size="7" fill="#666666" '
        f'dominant-baseline="middle">SCALE BAR</text>',
    ])


# ── Title block ───────────────────────────────────────────────────────────────

def _title_block(model: BuildingModel, target_floor: int, total_w: float, total_h: float) -> str:
    by    = total_h - TITLE_H
    reqs  = model.requirements
    btype = reqs.building_type.value.upper().replace("_", " ")
    site  = f"SITE {reqs.site_width:.0f}m × {reqs.site_depth:.0f}m"
    floor = f"FLOOR {target_floor + 1} / {reqs.floors}"
    return "\n".join([
        f'<line x1="0" y1="{by:.1f}" x2="{total_w:.1f}" y2="{by:.1f}" '
        f'stroke="#333333" stroke-width="1.2"/>',
        f'<line x1="{total_w*0.65:.1f}" y1="{by:.1f}" x2="{total_w*0.65:.1f}" y2="{total_h:.1f}" '
        f'stroke="#cccccc" stroke-width="0.8"/>',
        f'<text x="14" y="{by + 17:.1f}" font-family="Arial,sans-serif" font-size="11" '
        f'fill="#111111" font-weight="700" letter-spacing="1">AI-DRIVEN BIM GENERATION</text>',
        f'<text x="14" y="{by + 30:.1f}" font-family="Arial,sans-serif" font-size="9" '
        f'fill="#444444">{btype} · {site}</text>',
        f'<text x="14" y="{by + 43:.1f}" font-family="Arial,sans-serif" font-size="7.5" '
        f'fill="#888888">FLOOR PLAN  ·  GENERATED BY AI</text>',
        f'<text x="{total_w - 14:.1f}" y="{by + 20:.1f}" text-anchor="end" '
        f'font-family="Arial,sans-serif" font-size="16" fill="#111111" font-weight="700">{floor}</text>',
        f'<text x="{total_w - 14:.1f}" y="{by + 35:.1f}" text-anchor="end" '
        f'font-family="Arial,sans-serif" font-size="8" fill="#777777">ARCHITECTURAL FLOOR PLAN</text>',
        f'<text x="{total_w - 14:.1f}" y="{by + 46:.1f}" text-anchor="end" '
        f'font-family="Arial,sans-serif" font-size="8" fill="#aaaaaa">NTS</text>',
    ])


# ── Main renderer ─────────────────────────────────────────────────────────────

def render_floor_plan(model: BuildingModel, target_floor: int = 0) -> str:
    reqs   = model.requirements
    site_w = reqs.site_width
    site_h = reqs.site_depth

    content_w = site_w * SCALE + PAD * 2
    content_h = site_h * SCALE + PAD * 2
    total_w   = content_w + DIM_L
    total_h   = content_h + DIM_T + TITLE_H

    def fl(lst):
        return [x for x in lst if x.floor == target_floor]

    wall_map = _build_wall_map(model.walls)

    # ── SVG header + defs ─────────────────────────────────────────────────────
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w:.0f}" height="{total_h:.0f}" '
        f'viewBox="0 0 {total_w:.0f} {total_h:.0f}">',
        '<defs>',
        '  <marker id="stair-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">',
        '    <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#5555aa"/>',
        '  </marker>',
        '</defs>',
        # Background
        f'<rect width="100%" height="100%" fill="{BG_COLOR}"/>',
        # Drawing border
        f'<rect x="4" y="4" width="{total_w-8:.0f}" height="{total_h-8:.0f}" '
        f'fill="none" stroke="#888888" stroke-width="0.8"/>',
        f'<rect x="8" y="8" width="{total_w-16:.0f}" height="{total_h-16:.0f}" '
        f'fill="none" stroke="#333333" stroke-width="1.5"/>',
    ]

    # All content offset so dimension margins fit
    out.append(f'<g transform="translate({DIM_L},{DIM_T})">')

    # ── layer-grid ────────────────────────────────────────────────────────────
    # White building footprint background
    out.append(
        f'<rect x="{PAD}" y="{PAD}" width="{site_w*SCALE:.0f}" height="{site_h*SCALE:.0f}" '
        f'fill="white" stroke="none"/>')
    out.append('<g id="layer-grid">')
    out.extend(_render_metric_grid(site_w, site_h))
    out.extend(_render_struct_grid_lines(model, site_w, site_h))
    out.append('</g>')

    # Site boundary (thin dashed)
    out.append(
        f'<rect x="{PAD}" y="{PAD}" width="{site_w*SCALE:.0f}" height="{site_h*SCALE:.0f}" '
        f'fill="none" stroke="#99aa88" stroke-width="1.2" stroke-dasharray="8,4"/>')

    # ── layer-dims ────────────────────────────────────────────────────────────
    out.append('<g id="layer-dims">')
    out.extend(_render_dims(model))
    out.append('</g>')

    # ── layer-base (rooms) ────────────────────────────────────────────────────
    out.append('<g id="layer-base">')
    for room in fl(model.rooms):
        if room.type == RoomType.STAIRCASE:
            out.append(_staircase_el(room))
        else:
            out.append(_room_el(room))
    out.append('</g>')

    # ── layer-walls (thick filled) ────────────────────────────────────────────
    out.append('<g id="layer-walls">')
    for wall in fl(model.walls):
        out.append(_wall_thick_el(wall))
    # Cut door openings through walls
    for door in fl(model.doors):
        out.append(_door_opening_el(door, wall_map))
    # Window symbols (fill + glazing lines)
    for win in fl(model.windows):
        out.append(_window_symbol_el(win, wall_map))
    # Door symbols on top
    for door in fl(model.doors):
        out.append(_door_symbol_el(door, wall_map))
    out.append('</g>')

    # ── layer-structure ───────────────────────────────────────────────────────
    out.append('<g id="layer-structure">')
    for beam in fl(model.beams):
        out.append(_beam_el(beam))
    for col in model.columns:
        out.append(_col_el(col))
    # Structural grid bubbles
    if model.structural_grid:
        sg = model.structural_grid
        xs = _struct_grid_col_xs(sg); ys = _struct_grid_row_ys(sg)
        for lbl, x in zip(sg.column_labels, xs):
            out.append(_grid_bubble(x, sg.origin_y, lbl, "h"))
        for lbl, y in zip(sg.row_labels, ys):
            out.append(_grid_bubble(sg.origin_x, y, lbl, "v"))
    out.append('</g>')

    # ── layer-hvac ────────────────────────────────────────────────────────────
    out.append('<g id="layer-hvac">')
    for duct in fl(model.duct_segments):
        out.append(_duct_el(duct))
    for term in fl(model.air_terminals):
        out.append(_terminal_el(term))
    out.append('</g>')

    # ── layer-plumbing ────────────────────────────────────────────────────────
    out.append('<g id="layer-plumbing">')
    for pipe in fl(model.pipe_segments):
        out.append(_pipe_el(pipe))
    for fix in fl(model.plumbing_fixtures):
        out.append(_fixture_el(fix))
    out.append('</g>')

    # ── layer-electrical ──────────────────────────────────────────────────────
    out.append('<g id="layer-electrical">')
    for cable in fl(model.cable_segments):
        out.append(_cable_el(cable))
    for lf in fl(model.light_fixtures):
        out.append(_light_el(lf))
    for db in fl(model.distribution_boards):
        out.append(_db_el(db))
    out.append('</g>')

    out.append('</g>')  # end translate group

    # ── Title block + scale bar (outside translate, absolute coords) ──────────
    out.append(_scale_bar(total_w, total_h))
    out.append(_title_block(model, target_floor, total_w, total_h))

    out.append('</svg>')
    return "\n".join(out)
