from __future__ import annotations
from ..models.schemas import BuildingModel, CostItem, CostEstimate

# ── Default unit rates (USD) ───────────────────────────────────────────────────
_RATES: dict[str, float] = {
    # Structural
    "m3_concrete":      220.0,   # $/m³  ready-mix + placement
    "m2_formwork":       25.0,   # $/m²
    "kg_rebar":           1.80,  # $/kg
    "kg_steel":           3.20,  # $/kg  fabricated structural steel
    # Envelope
    "m2_ext_wall":      160.0,   # $/m²  brick/block + finish
    "m2_int_wall":       55.0,   # $/m²  partition
    "m2_glazing":       380.0,   # $/m²  aluminium curtain wall
    "ea_door":          650.0,   # $/door
    "m2_roof":           90.0,   # $/m²
    # MEP  (per m² of gross floor area)
    "m2_hvac":           85.0,   # $/m² GFA
    "m2_plumbing":       42.0,   # $/m² GFA
    "m2_electrical":     55.0,   # $/m² GFA
    # Finishes  (per m² of floor area)
    "m2_floor_fin":      70.0,   # $/m²
    "m2_ceil_fin":       35.0,   # $/m²
}


def _find(items, category: str, unit: str, fallback: float = 0.0) -> float:
    for it in items:
        if it.category == category and it.unit == unit:
            return it.quantity
    return fallback


def _find_kw(items, keyword: str, unit: str) -> float:
    for it in items:
        if keyword.lower() in it.item.lower() and it.unit == unit:
            return it.quantity
    return 0.0


def generate_cost_estimate(model: BuildingModel) -> BuildingModel:
    qto = model.quantity_takeoff
    if qto is None:
        return model

    items_q = qto.items
    gfa = qto.total_gross_area or 1.0

    cost_items: list[CostItem] = []

    def add(category: str, desc: str, qty: float, unit: str, rate_key: str) -> None:
        if qty <= 0:
            return
        rate = _RATES.get(rate_key, 0.0)
        cost_items.append(CostItem(
            category=category,
            description=desc,
            quantity=round(qty, 2),
            unit=unit,
            unit_rate=rate,
            amount=round(qty * rate, 0),
        ))

    # ── Structure ─────────────────────────────────────────────────────────────
    conc = _find_kw(items_q, "concrete", "m³") + _find_kw(items_q, "slab", "m³")
    add("Structure", "Concrete (columns, beams, slabs)", conc, "m³", "m3_concrete")

    form = _find_kw(items_q, "formwork", "m²")
    add("Structure", "Formwork", form, "m²", "m2_formwork")

    rebar = _find_kw(items_q, "reinforc", "kg") + _find_kw(items_q, "rebar", "kg")
    add("Structure", "Reinforcing steel", rebar, "kg", "kg_rebar")

    # Structural steel estimate from steel_members if available
    steel_kg = sum(
        sm.section.weight_per_m * sm.span_m
        for sm in (model.steel_members or [])
    )
    add("Structure", "Structural steel sections", steel_kg, "kg", "kg_steel")

    # ── Envelope ──────────────────────────────────────────────────────────────
    ext_wall = _find_kw(items_q, "external wall", "m²")
    add("Envelope", "External walls", ext_wall, "m²", "m2_ext_wall")

    glazing = _find_kw(items_q, "glazing", "m²") + _find_kw(items_q, "window", "m²")
    add("Envelope", "Glazing / curtain wall", glazing, "m²", "m2_glazing")

    doors_ea = _find_kw(items_q, "door", "ea") + _find_kw(items_q, "door", "no.")
    add("Envelope", "Doors", doors_ea, "ea", "ea_door")

    roof_m2 = _find_kw(items_q, "roof", "m²")
    add("Envelope", "Roof", roof_m2, "m²", "m2_roof")

    # ── Interior ──────────────────────────────────────────────────────────────
    int_wall = _find_kw(items_q, "internal wall", "m²") + _find_kw(items_q, "partition", "m²")
    add("Interior", "Internal partitions", int_wall, "m²", "m2_int_wall")

    add("Interior", "Floor finishes", qto.total_floor_area, "m²", "m2_floor_fin")
    add("Interior", "Ceiling finishes", qto.total_floor_area, "m²", "m2_ceil_fin")

    # ── MEP ───────────────────────────────────────────────────────────────────
    add("MEP", "HVAC systems", gfa, "m²", "m2_hvac")
    add("MEP", "Plumbing & drainage", gfa, "m²", "m2_plumbing")
    add("MEP", "Electrical & lighting", gfa, "m²", "m2_electrical")

    grand_total = sum(ci.amount for ci in cost_items)

    model.cost_estimate = CostEstimate(
        items=cost_items,
        grand_total=round(grand_total, 0),
        currency="USD",
    )
    return model
