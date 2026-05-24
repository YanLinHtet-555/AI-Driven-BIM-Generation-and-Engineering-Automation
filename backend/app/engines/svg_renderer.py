import math
from ..models.schemas import BuildingModel, RoomType

SCALE = 20.0
PAD = 30

ROOM_FILL = {
    RoomType.LIVING:       "#e8f5e9",
    RoomType.DINING:       "#f1f8e9",
    RoomType.KITCHEN:      "#fff9c4",
    RoomType.BEDROOM:      "#e3f2fd",
    RoomType.BATHROOM:     "#e8eaf6",
    RoomType.TOILET:       "#ede7f6",
    RoomType.OFFICE:       "#fce4ec",
    RoomType.LOBBY:        "#fff3e0",
    RoomType.CORRIDOR:     "#f5f5f5",
    RoomType.STAIRCASE:    "#efebe9",
    RoomType.STORAGE:      "#fafafa",
    RoomType.MEETING_ROOM: "#f3e5f5",
    RoomType.PARKING:      "#e0f2f1",
}
ROOM_TEXT = {
    RoomType.LIVING:       "#1b5e20",
    RoomType.DINING:       "#33691e",
    RoomType.KITCHEN:      "#f57f17",
    RoomType.BEDROOM:      "#0d47a1",
    RoomType.BATHROOM:     "#1a237e",
    RoomType.TOILET:       "#4a148c",
    RoomType.OFFICE:       "#880e4f",
    RoomType.LOBBY:        "#e65100",
    RoomType.CORRIDOR:     "#616161",
    RoomType.STAIRCASE:    "#4e342e",
    RoomType.STORAGE:      "#424242",
    RoomType.MEETING_ROOM: "#6a1b9a",
    RoomType.PARKING:      "#004d40",
}


def _px(m: float) -> float:
    return m * SCALE + PAD


def _room_el(room) -> str:
    pts = " ".join(f"{_px(p.x):.1f},{_px(p.y):.1f}" for p in room.polygon)
    fill = ROOM_FILL.get(room.type, "#ffffff")
    tc = ROOM_TEXT.get(room.type, "#333")
    xs = [p.x for p in room.polygon]; ys = [p.y for p in room.polygon]
    cx = _px((min(xs) + max(xs)) / 2); cy = _px((min(ys) + max(ys)) / 2)
    pw = (max(xs) - min(xs)) * SCALE; ph = (max(ys) - min(ys)) * SCALE
    out = [f'<polygon points="{pts}" fill="{fill}" stroke="#90a4ae" stroke-width="1.5"/>']
    if pw > 28 and ph > 18:
        fs = max(7, min(10, int(min(pw, ph) / 6)))
        out.append(f'<text x="{cx:.1f}" y="{cy:.1f}" text-anchor="middle" dominant-baseline="middle" '
                   f'font-family="sans-serif" font-size="{fs}" fill="{tc}" font-weight="500">{room.name}</text>')
        if pw > 48 and ph > 30:
            out.append(f'<text x="{cx:.1f}" y="{cy + fs + 2:.1f}" text-anchor="middle" dominant-baseline="middle" '
                       f'font-family="sans-serif" font-size="{fs-1}" fill="{tc}" opacity="0.7">{room.area:.0f}m²</text>')
    return "\n".join(out)


def _wall_el(wall) -> str:
    c = "#37474f" if wall.is_external else "#78909c"
    w = 3 if wall.is_external else 1.5
    return (f'<line x1="{_px(wall.start.x):.1f}" y1="{_px(wall.start.y):.1f}" '
            f'x2="{_px(wall.end.x):.1f}" y2="{_px(wall.end.y):.1f}" stroke="{c}" stroke-width="{w}"/>')


def _door_el(door) -> str:
    cx = _px(door.position.x); cy = _px(door.position.y)
    r = door.width * SCALE / 2
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="none" stroke="#ff7043" stroke-width="1.5" stroke-dasharray="3,2"/>'


def _window_el(win) -> str:
    cx = _px(win.position.x); hw = win.width * SCALE / 2
    cy = _px(win.position.y)
    return f'<rect x="{cx-hw:.1f}" y="{cy-3:.1f}" width="{win.width*SCALE:.1f}" height="6" fill="#b3e5fc" stroke="#0288d1" stroke-width="1"/>'


def _col_el(col) -> str:
    cx = _px(col.position.x); cy = _px(col.position.y)
    hw = col.width * SCALE / 2; hd = col.depth * SCALE / 2
    return f'<rect x="{cx-hw:.1f}" y="{cy-hd:.1f}" width="{col.width*SCALE:.1f}" height="{col.depth*SCALE:.1f}" fill="#546e7a" stroke="#263238" stroke-width="1"/>'


def _beam_el(beam) -> str:
    return (f'<line x1="{_px(beam.start.x):.1f}" y1="{_px(beam.start.y):.1f}" '
            f'x2="{_px(beam.end.x):.1f}" y2="{_px(beam.end.y):.1f}" '
            f'stroke="#b0bec5" stroke-width="2" stroke-dasharray="6,3"/>')


def _grid_label(x: float, y: float, label: str, horizontal: bool = True) -> str:
    px = _px(x); py = _px(y)
    if horizontal:
        return (f'<text x="{px:.1f}" y="{py - 6:.1f}" text-anchor="middle" '
                f'font-family="sans-serif" font-size="9" fill="#78909c" font-weight="bold">{label}</text>')
    else:
        return (f'<text x="{px - 8:.1f}" y="{py:.1f}" text-anchor="end" dominant-baseline="middle" '
                f'font-family="sans-serif" font-size="9" fill="#78909c" font-weight="bold">{label}</text>')


def _duct_el(duct) -> str:
    return (f'<line x1="{_px(duct.start.x):.1f}" y1="{_px(duct.start.y):.1f}" '
            f'x2="{_px(duct.end.x):.1f}" y2="{_px(duct.end.y):.1f}" '
            f'stroke="#00838f" stroke-width="{max(2, duct.width * SCALE * 0.4):.1f}" opacity="0.8"/>')


def _terminal_el(term) -> str:
    cx = _px(term.position.x); cy = _px(term.position.y)
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="4" fill="#00bcd4" stroke="#006064" stroke-width="1"/>'
            f'<line x1="{cx-4:.1f}" y1="{cy:.1f}" x2="{cx+4:.1f}" y2="{cy:.1f}" stroke="#006064" stroke-width="0.8"/>'
            f'<line x1="{cx:.1f}" y1="{cy-4:.1f}" x2="{cx:.1f}" y2="{cy+4:.1f}" stroke="#006064" stroke-width="0.8"/>')


def _pipe_el(pipe) -> str:
    c = "#1565c0" if pipe.system == "cold_water" else "#6a1b9a"
    w = max(1, pipe.diameter * SCALE * 0.5)
    return (f'<line x1="{_px(pipe.start.x):.1f}" y1="{_px(pipe.start.y):.1f}" '
            f'x2="{_px(pipe.end.x):.1f}" y2="{_px(pipe.end.y):.1f}" '
            f'stroke="{c}" stroke-width="{w:.1f}" stroke-dasharray="4,2" opacity="0.8"/>')


def _fixture_el(fix) -> str:
    cx = _px(fix.position.x); cy = _px(fix.position.y)
    return f'<rect x="{cx-4:.1f}" y="{cy-4:.1f}" width="8" height="8" fill="#1565c0" stroke="#0d47a1" stroke-width="1" opacity="0.8"/>'


def _cable_el(cable) -> str:
    c = "#f9a825" if cable.circuit == "power" else "#ffd600"
    return (f'<line x1="{_px(cable.start.x):.1f}" y1="{_px(cable.start.y):.1f}" '
            f'x2="{_px(cable.end.x):.1f}" y2="{_px(cable.end.y):.1f}" '
            f'stroke="{c}" stroke-width="1" opacity="0.6"/>')


def _light_el(lf) -> str:
    cx = _px(lf.position.x); cy = _px(lf.position.y)
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="3" fill="#ffd600" stroke="#f57f17" stroke-width="1"/>')


def _db_el(db) -> str:
    cx = _px(db.position.x); cy = _px(db.position.y)
    return f'<rect x="{cx-5:.1f}" y="{cy-5:.1f}" width="10" height="10" fill="#e53935" stroke="#b71c1c" stroke-width="1" opacity="0.9"/>'


def render_floor_plan(model: BuildingModel, target_floor: int = 0) -> str:
    reqs = model.requirements
    total_w = reqs.site_width * SCALE + PAD * 2
    total_h = reqs.site_depth * SCALE + PAD * 2 + 20  # extra for legend

    def fl(lst):
        return [x for x in lst if x.floor == target_floor]

    def fl_col(lst):
        return list(lst)  # columns don't have floor attr

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w:.0f}" height="{total_h:.0f}" '
        f'viewBox="0 0 {total_w:.0f} {total_h:.0f}">',
        '<rect width="100%" height="100%" fill="#eceff1"/>',
        f'<rect x="{PAD}" y="{PAD}" width="{reqs.site_width*SCALE:.0f}" height="{reqs.site_depth*SCALE:.0f}" '
        f'fill="#f9fbe7" stroke="#aed581" stroke-width="2" stroke-dasharray="8,4"/>',
    ]

    # ── Layer: base (rooms) ───────────────────────────────────────────────────
    out.append('<g id="layer-base">')
    for room in fl(model.rooms):
        out.append(_room_el(room))
    out.append('</g>')

    # ── Layer: walls ─────────────────────────────────────────────────────────
    out.append('<g id="layer-walls">')
    for wall in fl(model.walls):
        out.append(_wall_el(wall))
    for win in fl(model.windows):
        out.append(_window_el(win))
    for door in fl(model.doors):
        out.append(_door_el(door))
    out.append('</g>')

    # ── Layer: structure ─────────────────────────────────────────────────────
    out.append('<g id="layer-structure">')
    for beam in fl(model.beams):
        out.append(_beam_el(beam))
    for col in model.columns:
        out.append(_col_el(col))
    # Structural grid labels
    if model.structural_grid:
        sg = model.structural_grid
        x = sg.origin_x
        for lbl in sg.column_labels:
            out.append(_grid_label(x, sg.origin_y, lbl, horizontal=True))
            if sg.spacings_x:
                x += sg.spacings_x[min(sg.column_labels.index(lbl), len(sg.spacings_x) - 1)]
        y = sg.origin_y
        for lbl in sg.row_labels:
            out.append(_grid_label(sg.origin_x, y, lbl, horizontal=False))
            if sg.spacings_y:
                y += sg.spacings_y[min(sg.row_labels.index(lbl), len(sg.spacings_y) - 1)]
    out.append('</g>')

    # ── Layer: HVAC ───────────────────────────────────────────────────────────
    out.append('<g id="layer-hvac">')
    for duct in fl(model.duct_segments):
        out.append(_duct_el(duct))
    for term in fl(model.air_terminals):
        out.append(_terminal_el(term))
    out.append('</g>')

    # ── Layer: plumbing ───────────────────────────────────────────────────────
    out.append('<g id="layer-plumbing">')
    for pipe in fl(model.pipe_segments):
        out.append(_pipe_el(pipe))
    for fix in fl(model.plumbing_fixtures):
        out.append(_fixture_el(fix))
    out.append('</g>')

    # ── Layer: electrical ─────────────────────────────────────────────────────
    out.append('<g id="layer-electrical">')
    for cable in fl(model.cable_segments):
        out.append(_cable_el(cable))
    for lf in fl(model.light_fixtures):
        out.append(_light_el(lf))
    for db in fl(model.distribution_boards):
        out.append(_db_el(db))
    out.append('</g>')

    # ── Floor label ───────────────────────────────────────────────────────────
    out.append(f'<text x="{PAD+6}" y="{PAD+16}" font-family="sans-serif" '
               f'font-size="12" fill="#455a64" font-weight="bold">Floor {target_floor+1}</text>')

    out.append("</svg>")
    return "\n".join(out)
