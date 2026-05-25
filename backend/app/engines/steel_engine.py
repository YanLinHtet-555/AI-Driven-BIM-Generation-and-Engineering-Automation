from __future__ import annotations
import math
import uuid
from dataclasses import dataclass
from typing import List, Optional
from ..models.schemas import (
    BuildingModel, SteelSection, SteelMember,
    Column, Beam, Point2D, SteelOverride,
)


# ── W-shape beam database (CISC metric) ───────────────────────────────────────
@dataclass
class _WBeam:
    desig: str; weight: float; area: float; depth: float; Zx: float

_BEAM_DB: List[_WBeam] = [
    _WBeam("W150x14",   14,  17.9, 150,  105),
    _WBeam("W200x22",   22,  28.5, 206,  214),
    _WBeam("W200x36",   36,  45.7, 201,  351),
    _WBeam("W250x25",   25,  32.1, 257,  276),
    _WBeam("W250x49",   49,  63.0, 247,  560),
    _WBeam("W310x39",   39,  49.4, 310,  623),
    _WBeam("W310x60",   60,  75.9, 303,  977),
    _WBeam("W360x39",   39,  49.9, 353,  663),
    _WBeam("W360x64",   64,  81.3, 347, 1180),
    _WBeam("W410x54",   54,  68.5, 403, 1060),
    _WBeam("W460x68",   68,  86.1, 459, 1470),
    _WBeam("W530x82",   82, 104.0, 528, 2080),
    _WBeam("W610x101", 101, 129.0, 603, 2910),
]

# ── W-shape column database ───────────────────────────────────────────────────
@dataclass
class _WCol:
    desig: str; weight: float; area: float; depth: float

_COL_DB: List[_WCol] = [
    _WCol("W150x22",  22,  28.5, 155),
    _WCol("W200x27",  27,  34.9, 207),
    _WCol("W200x52",  52,  66.4, 206),
    _WCol("W250x45",  45,  57.4, 266),
    _WCol("W250x73",  73,  92.9, 253),
    _WCol("W310x52",  52,  66.1, 317),
    _WCol("W310x97",  97, 123.0, 308),
    _WCol("W360x57",  57,  72.2, 358),
    _WCol("W360x110",110, 140.0, 360),
]

_Fy       = 345.0   # MPa
_phi      = 0.9
_DL       = 3.5     # kPa (dead + superimposed dead)
_LL       = 2.5     # kPa (live)
_W_TOTAL  = _DL + _LL   # = 6.0 kPa
_TRIB     = 3.0     # m  (assumed tributary width per beam)
_COL_LOAD = 7.5     # kPa total factored load per floor


def _phi_Mp_kNm(Zx_cm3: float) -> float:
    # Mp = Fy * Zx  →  345 N/mm² × Zx cm³ × (1000 mm³/cm³) × (1 kN/1000 N) × (1 m / 1000 mm) = 0.345 × Zx kN·m
    return _phi * 0.345 * Zx_cm3


def _phi_Pn_kN(area_cm2: float) -> float:
    # Pn = Fy × A  →  345 N/mm² × A cm² × (100 mm²/cm²) × (1 kN/1000 N) = 34.5 × A kN (per cm²)
    # Wait: 345 N/mm² × A cm² = 345 N/mm² × A × 100 mm² = 34500 A N = 34.5 A kN
    return _phi * 34.5 * area_cm2


def _status(util: float) -> str:
    if util <= 0.80:
        return "ok"
    if util <= 1.00:
        return "warning"
    return "overstressed"


def generate_steel_members(model: BuildingModel) -> BuildingModel:
    override_map: dict[str, str] = {o.ref_id: o.designation for o in model.steel_overrides}
    members: List[SteelMember] = []

    # ── Beams ─────────────────────────────────────────────────────────────────
    for beam in model.beams:
        span = math.hypot(beam.end.x - beam.start.x, beam.end.y - beam.start.y)
        if span < 0.5:
            continue
        w_kNm  = _W_TOTAL * _TRIB
        demand = w_kNm * span ** 2 / 8

        if beam.id in override_map:
            desig    = override_map[beam.id]
            selected: Optional[_WBeam] = next((s for s in _BEAM_DB if s.desig == desig), None)
            if selected is None:
                selected = _BEAM_DB[-1]
        else:
            selected = None
            for s in _BEAM_DB:
                if _phi_Mp_kNm(s.Zx) >= demand:
                    selected = s
                    break
            if selected is None:
                selected = _BEAM_DB[-1]

        capacity = _phi_Mp_kNm(selected.Zx)
        util     = demand / capacity if capacity > 0 else 9.99
        members.append(SteelMember(
            id=str(uuid.uuid4()),
            ref_id=beam.id,
            member_type="beam",
            floor=beam.floor,
            section=SteelSection(
                designation=selected.desig,
                weight_per_m=selected.weight,
                area_cm2=selected.area,
                depth_mm=selected.depth,
                Zx_cm3=selected.Zx,
            ),
            span_m=round(span, 2),
            demand=round(demand, 1),
            capacity=round(capacity, 1),
            utilization=round(min(util, 9.99), 3),
            status=_status(util),
        ))

    # ── Columns ───────────────────────────────────────────────────────────────
    floors = model.requirements.floors
    sg     = model.structural_grid
    if sg and sg.spacings_x and sg.spacings_y:
        avg_bay_x = sum(sg.spacings_x) / len(sg.spacings_x)
        avg_bay_y = sum(sg.spacings_y) / len(sg.spacings_y)
        trib_area = avg_bay_x * avg_bay_y
    else:
        trib_area = 36.0

    for col in model.columns:
        demand = _COL_LOAD * trib_area * floors

        if col.id in override_map:
            desig       = override_map[col.id]
            selected_c: Optional[_WCol] = next((s for s in _COL_DB if s.desig == desig), None)
            if selected_c is None:
                selected_c = _COL_DB[-1]
        else:
            selected_c = None
            for s in _COL_DB:
                if _phi_Pn_kN(s.area) >= demand:
                    selected_c = s
                    break
            if selected_c is None:
                selected_c = _COL_DB[-1]

        capacity = _phi_Pn_kN(selected_c.area)
        util     = demand / capacity if capacity > 0 else 9.99
        members.append(SteelMember(
            id=str(uuid.uuid4()),
            ref_id=col.id,
            member_type="column",
            floor=0,
            section=SteelSection(
                designation=selected_c.desig,
                weight_per_m=selected_c.weight,
                area_cm2=selected_c.area,
                depth_mm=selected_c.depth,
                Zx_cm3=0.0,
            ),
            span_m=round(model.floor_height * floors, 2),
            demand=round(demand, 1),
            capacity=round(capacity, 1),
            utilization=round(min(util, 9.99), 3),
            status=_status(util),
        ))

    model.steel_members = members
    return model


# ── Smart structural optimizer ────────────────────────────────────────────────

def _insert_intermediate_columns(
    ref_col_id: str,
    all_cols: List[Column],
    new_cols_out: List[Column],
    new_beams_out: List[Beam],
) -> None:
    """Insert new columns at mid-spans between an overloaded column and its neighbours,
    plus short beams that tie them into the structure."""
    src = next((c for c in all_cols if c.id == ref_col_id), None)
    if src is None:
        return
    ox, oy = src.position.x, src.position.y

    # Nearest neighbours in the same row (same Y) and same column (same X)
    row_nbrs = sorted(
        [c for c in all_cols if abs(c.position.y - oy) < 0.5 and c.id != ref_col_id],
        key=lambda c: abs(c.position.x - ox),
    )
    col_nbrs = sorted(
        [c for c in all_cols if abs(c.position.x - ox) < 0.5 and c.id != ref_col_id],
        key=lambda c: abs(c.position.y - oy),
    )

    def _add(mx: float, my: float) -> None:
        new_id = str(uuid.uuid4())
        new_cols_out.append(Column(
            id=new_id,
            position=Point2D(x=round(mx, 3), y=round(my, 3)),
            width=0.5, depth=0.5,
        ))
        new_beams_out.append(Beam(
            id=str(uuid.uuid4()),
            start=Point2D(x=ox, y=oy),
            end=Point2D(x=round(mx, 3), y=round(my, 3)),
            floor=0, width=0.3, depth=0.5, grid_ref="opt",
        ))

    for nbr in row_nbrs[:2]:
        _add((ox + nbr.position.x) / 2, oy)
    for nbr in col_nbrs[:2]:
        _add(ox, (oy + nbr.position.y) / 2)


def optimize_structure(model: BuildingModel) -> BuildingModel:
    """Three-tier structural optimiser:
      1. Upgrade section sizes for warning / overstressed members.
      2. Split overstressed beams in two by inserting a mid-span column.
      3. Add intermediate columns around overloaded columns.
    User section overrides that are already OK are preserved.
    """
    # ── Pass 0: establish baseline with auto-selection ────────────────
    baseline = generate_steel_members(model)

    # Keep user overrides only for already-OK members
    ok_ref_ids = {m.ref_id for m in baseline.steel_members if m.status == "ok"}
    new_overrides: dict[str, str] = {
        o.ref_id: o.designation
        for o in model.steel_overrides
        if o.ref_id in ok_ref_ids
    }

    new_cols: List[Column] = list(model.columns)
    new_beams: List[Beam] = list(model.beams)
    beams_to_split: set[str] = set()

    for mem in baseline.steel_members:
        if mem.status == "ok":
            continue

        if mem.member_type == "beam":
            # Try section upgrade to reach ≤80 % utilization
            target_cap = mem.demand / 0.80
            upgraded = next(
                (s for s in _BEAM_DB if _phi_Mp_kNm(s.Zx) >= target_cap), None
            )
            if upgraded:
                new_overrides[mem.ref_id] = upgraded.desig
            else:
                # Max section can't handle span → split the beam
                beams_to_split.add(mem.ref_id)

        else:  # column
            target_cap = mem.demand / 0.80
            upgraded_c = next(
                (s for s in _COL_DB if _phi_Pn_kN(s.area) >= target_cap), None
            )
            if upgraded_c:
                new_overrides[mem.ref_id] = upgraded_c.desig
            else:
                # Beyond max column section → add intermediate columns
                _insert_intermediate_columns(
                    mem.ref_id, new_cols, new_cols, new_beams
                )

    # ── Split beams that need a mid-span support ──────────────────────
    extra_beams: List[Beam] = []
    for bid in beams_to_split:
        beam = next((b for b in new_beams if b.id == bid), None)
        if beam is None:
            continue
        mid_x = round((beam.start.x + beam.end.x) / 2, 3)
        mid_y = round((beam.start.y + beam.end.y) / 2, 3)
        new_cols.append(Column(
            id=str(uuid.uuid4()),
            position=Point2D(x=mid_x, y=mid_y),
            width=0.5, depth=0.5,
        ))
        extra_beams.append(Beam(
            id=str(uuid.uuid4()), start=beam.start,
            end=Point2D(x=mid_x, y=mid_y),
            floor=beam.floor, width=beam.width, depth=beam.depth,
            grid_ref=beam.grid_ref,
        ))
        extra_beams.append(Beam(
            id=str(uuid.uuid4()),
            start=Point2D(x=mid_x, y=mid_y),
            end=beam.end,
            floor=beam.floor, width=beam.width, depth=beam.depth,
            grid_ref=beam.grid_ref,
        ))
        new_overrides.pop(bid, None)  # let auto-selection size the new halves

    model.beams = [b for b in new_beams if b.id not in beams_to_split] + extra_beams
    model.columns = new_cols
    model.steel_overrides = [
        SteelOverride(ref_id=k, designation=v) for k, v in new_overrides.items()
    ]

    return generate_steel_members(model)
