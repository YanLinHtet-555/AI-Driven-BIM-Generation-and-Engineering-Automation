import uuid
from typing import List, Optional, Tuple
from ..models.schemas import (
    BuildingModel, Room, RoomType,
    DuctSegment, AirTerminal,
    PipeSegment, PlumbingFixture,
    CableSegment, LightFixture, DistributionBoard,
    Point2D,
)

WET_ROOMS = {RoomType.BATHROOM, RoomType.TOILET, RoomType.KITCHEN}
FIXTURE_MAP = {
    RoomType.BATHROOM: ["toilet", "sink", "shower"],
    RoomType.TOILET: ["toilet", "sink"],
    RoomType.KITCHEN: ["sink"],
}


def _uid() -> str:
    return str(uuid.uuid4())


def _center(room: Room) -> Point2D:
    xs = [p.x for p in room.polygon]
    ys = [p.y for p in room.polygon]
    return Point2D(x=sum(xs) / len(xs), y=sum(ys) / len(ys))


def _bounds(room: Room) -> Tuple[float, float, float, float]:
    xs = [p.x for p in room.polygon]
    ys = [p.y for p in room.polygon]
    return min(xs), min(ys), max(xs), max(ys)


# ── HVAC ─────────────────────────────────────────────────────────────────────

def _hvac_floor(
    rooms: List[Room], floor: int,
    ox: float, oy: float, bw: float, bd: float
) -> Tuple[List[DuctSegment], List[AirTerminal]]:
    ducts: List[DuctSegment] = []
    terminals: List[AirTerminal] = []

    spine_y = oy + bd / 2
    ducts.append(DuctSegment(
        id=_uid(),
        start=Point2D(x=ox, y=spine_y),
        end=Point2D(x=ox + bw, y=spine_y),
        floor=floor, width=0.4, height=0.25, system="supply"
    ))

    for room in rooms:
        if room.type in (RoomType.STAIRCASE, RoomType.CORRIDOR):
            continue
        c = _center(room)
        ducts.append(DuctSegment(
            id=_uid(),
            start=Point2D(x=c.x, y=spine_y),
            end=Point2D(x=c.x, y=c.y),
            floor=floor, width=0.2, height=0.15, system="supply"
        ))
        terminals.append(AirTerminal(
            id=_uid(),
            position=Point2D(x=c.x, y=c.y),
            floor=floor,
            flow_rate=max(50.0, room.area * 2.0)
        ))
    return ducts, terminals


# ── Plumbing ─────────────────────────────────────────────────────────────────

def _plumbing_floor(
    rooms: List[Room], floor: int, stack_x: float, stack_y: float
) -> Tuple[List[PipeSegment], List[PlumbingFixture]]:
    pipes: List[PipeSegment] = []
    fixtures: List[PlumbingFixture] = []

    for room in rooms:
        if room.type not in WET_ROOMS:
            continue
        c = _center(room)
        minx, miny, maxx, _ = _bounds(room)

        pipes.append(PipeSegment(
            id=_uid(),
            start=Point2D(x=stack_x, y=stack_y),
            end=Point2D(x=c.x, y=c.y),
            floor=floor, diameter=0.025, system="cold_water"
        ))
        pipes.append(PipeSegment(
            id=_uid(),
            start=Point2D(x=c.x, y=c.y),
            end=Point2D(x=stack_x, y=stack_y),
            floor=floor, diameter=0.05, system="waste"
        ))

        ftypes = FIXTURE_MAP.get(room.type, ["sink"])
        n = len(ftypes)
        for i, ftype in enumerate(ftypes):
            fx = minx + (maxx - minx) * (i + 1) / (n + 1)
            fixtures.append(PlumbingFixture(
                id=_uid(),
                position=Point2D(x=fx, y=miny + 0.5),
                floor=floor, fixture_type=ftype
            ))
    return pipes, fixtures


# ── Electrical ────────────────────────────────────────────────────────────────

def _electrical_floor(
    rooms: List[Room], floor: int, ox: float, oy: float
) -> Tuple[List[CableSegment], List[LightFixture], Optional[DistributionBoard]]:
    cables: List[CableSegment] = []
    lights: List[LightFixture] = []

    stair = next((r for r in rooms if r.type == RoomType.STAIRCASE), None)
    db_pos = _center(stair) if stair else Point2D(x=ox + 1.0, y=oy + 1.0)
    db = DistributionBoard(id=_uid(), position=db_pos, floor=floor)

    for room in rooms:
        if room.type == RoomType.STAIRCASE:
            continue
        c = _center(room)
        cables.append(CableSegment(
            id=_uid(), start=db_pos, end=c, floor=floor, circuit="power"
        ))
        cables.append(CableSegment(
            id=_uid(), start=db_pos, end=c, floor=floor, circuit="lighting"
        ))

        minx, miny, maxx, maxy = _bounds(room)
        rw, rh = maxx - minx, maxy - miny
        nx = max(1, round(rw / 3.0))
        ny = max(1, round(rh / 3.0))
        for ix in range(nx):
            for iy in range(ny):
                lights.append(LightFixture(
                    id=_uid(),
                    position=Point2D(
                        x=minx + (ix + 0.5) * rw / nx,
                        y=miny + (iy + 0.5) * rh / ny
                    ),
                    floor=floor, wattage=18.0
                ))
    return cables, lights, db


# ── Entry point ───────────────────────────────────────────────────────────────

def generate_mep_systems(model: BuildingModel) -> BuildingModel:
    from .spatial_planner import SETBACK_FRONT, SETBACK_BACK, SETBACK_SIDE
    reqs = model.requirements
    ox = SETBACK_SIDE
    oy = SETBACK_FRONT
    bw = reqs.site_width - SETBACK_SIDE * 2
    bd = reqs.site_depth - SETBACK_FRONT - SETBACK_BACK

    first_wet = next((r for r in model.rooms if r.type in WET_ROOMS), None)
    if first_wet:
        c = _center(first_wet)
        stack_x, stack_y = c.x, c.y
    else:
        stack_x, stack_y = ox + bw * 0.8, oy + bd * 0.7

    all_ducts: List[DuctSegment] = []
    all_terminals: List[AirTerminal] = []
    all_pipes: List[PipeSegment] = []
    all_fixtures: List[PlumbingFixture] = []
    all_cables: List[CableSegment] = []
    all_lights: List[LightFixture] = []
    all_dbs: List[DistributionBoard] = []

    for fl in range(reqs.floors):
        floor_rooms = [r for r in model.rooms if r.floor == fl]
        d, t = _hvac_floor(floor_rooms, fl, ox, oy, bw, bd)
        all_ducts.extend(d)
        all_terminals.extend(t)
        p, pf = _plumbing_floor(floor_rooms, fl, stack_x, stack_y)
        all_pipes.extend(p)
        all_fixtures.extend(pf)
        c, lf, db = _electrical_floor(floor_rooms, fl, ox, oy)
        all_cables.extend(c)
        all_lights.extend(lf)
        if db:
            all_dbs.append(db)

    model.duct_segments = all_ducts
    model.air_terminals = all_terminals
    model.pipe_segments = all_pipes
    model.plumbing_fixtures = all_fixtures
    model.cable_segments = all_cables
    model.light_fixtures = all_lights
    model.distribution_boards = all_dbs
    return model
