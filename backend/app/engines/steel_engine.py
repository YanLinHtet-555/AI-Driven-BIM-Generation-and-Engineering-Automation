from __future__ import annotations
import math
import uuid
from dataclasses import dataclass
from typing import List, Optional
from ..models.schemas import BuildingModel, SteelSection, SteelMember


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
    members: List[SteelMember] = []

    # ── Beams ─────────────────────────────────────────────────────────────────
    for beam in model.beams:
        span = math.hypot(beam.end.x - beam.start.x, beam.end.y - beam.start.y)
        if span < 0.5:
            continue
        w_kNm = _W_TOTAL * _TRIB          # uniform load kN/m
        demand = w_kNm * span ** 2 / 8    # kN·m

        selected: Optional[_WBeam] = None
        for s in _BEAM_DB:
            if _phi_Mp_kNm(s.Zx) >= demand:
                selected = s
                break
        if selected is None:
            selected = _BEAM_DB[-1]

        capacity = _phi_Mp_kNm(selected.Zx)
        util = demand / capacity if capacity > 0 else 9.99
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
    sg = model.structural_grid
    if sg and sg.spacings_x and sg.spacings_y:
        avg_bay_x = sum(sg.spacings_x) / len(sg.spacings_x)
        avg_bay_y = sum(sg.spacings_y) / len(sg.spacings_y)
        trib_area = avg_bay_x * avg_bay_y
    else:
        trib_area = 36.0  # default 6×6 m

    for col in model.columns:
        demand = _COL_LOAD * trib_area * floors  # kN

        selected_c: Optional[_WCol] = None
        for s in _COL_DB:
            if _phi_Pn_kN(s.area) >= demand:
                selected_c = s
                break
        if selected_c is None:
            selected_c = _COL_DB[-1]

        capacity = _phi_Pn_kN(selected_c.area)
        util = demand / capacity if capacity > 0 else 9.99
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
