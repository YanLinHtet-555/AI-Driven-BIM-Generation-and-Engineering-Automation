import math
from typing import List
from ..models.schemas import BuildingModel, QuantityItem, QuantityTakeoff


def _seg_len(s, e) -> float:
    return math.hypot(e.x - s.x, e.y - s.y)


def _poly_area(polygon) -> float:
    n = len(polygon)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += polygon[i].x * polygon[j].y
        area -= polygon[j].x * polygon[i].y
    return abs(area) / 2.0


def generate_quantity_takeoff(model: BuildingModel) -> BuildingModel:
    items: List[QuantityItem] = []
    fl_h = model.floor_height
    fl_n = model.requirements.floors

    def add(cat: str, item: str, unit: str, qty: float):
        items.append(QuantityItem(category=cat, item=item, unit=unit, quantity=round(qty, 2)))

    # Structure — columns
    col_n = len(model.columns)
    col_vol = sum(c.width * c.depth * fl_h * fl_n for c in model.columns)
    add("Structure", "Columns", "nr", col_n)
    add("Structure", "Column concrete", "m³", col_vol)

    # Structure — beams
    beam_len = sum(_seg_len(b.start, b.end) for b in model.beams)
    beam_vol = sum(_seg_len(b.start, b.end) * b.width * b.depth for b in model.beams)
    add("Structure", "Beams", "m", beam_len)
    add("Structure", "Beam concrete", "m³", beam_vol)

    # Structure — slabs
    slab_area = sum(_poly_area(s.polygon) for s in model.slabs)
    slab_vol = sum(_poly_area(s.polygon) * s.thickness for s in model.slabs)
    add("Structure", "Slabs", "m²", slab_area)
    add("Structure", "Slab concrete", "m³", slab_vol)

    # Envelope — walls
    ext_walls = [w for w in model.walls if w.is_external]
    int_walls = [w for w in model.walls if not w.is_external]
    add("Envelope", "External walls", "m²", sum(_seg_len(w.start, w.end) * w.height for w in ext_walls))
    add("Envelope", "Internal walls", "m²", sum(_seg_len(w.start, w.end) * w.height for w in int_walls))
    add("Envelope", "Doors", "nr", len(model.doors))
    add("Envelope", "Windows", "nr", len(model.windows))
    add("Envelope", "Window glazing", "m²", sum(w.width * w.height for w in model.windows))

    # HVAC
    add("HVAC", "Ductwork", "m", sum(_seg_len(d.start, d.end) for d in model.duct_segments))
    add("HVAC", "Air terminals", "nr", len(model.air_terminals))

    # Plumbing
    add("Plumbing", "Pipework", "m", sum(_seg_len(p.start, p.end) for p in model.pipe_segments))
    add("Plumbing", "Fixtures", "nr", len(model.plumbing_fixtures))

    # Electrical
    add("Electrical", "Cable runs", "m", sum(_seg_len(c.start, c.end) for c in model.cable_segments))
    add("Electrical", "Light fixtures", "nr", len(model.light_fixtures))
    add("Electrical", "Distribution boards", "nr", len(model.distribution_boards))
    add("Electrical", "Lighting load", "W", sum(l.wattage for l in model.light_fixtures))

    gf_area = sum(r.area for r in model.rooms if r.floor == 0)
    gross = sum(r.area for r in model.rooms) / max(1, fl_n)

    model.quantity_takeoff = QuantityTakeoff(
        items=items,
        total_floor_area=round(gf_area, 1),
        total_gross_area=round(gross, 1),
    )
    return model
