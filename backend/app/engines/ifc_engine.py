"""
Pure-Python IFC4 STEP generator.
Covers: Architecture (walls, doors, windows), Structure (columns, beams, slabs),
        MEP (ducts, pipes, cables, terminals, fixtures).
"""
import math
import uuid
from typing import List, Optional
from ..models.schemas import BuildingModel

IFC_GUID_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"


def ifc_guid() -> str:
    uid = uuid.uuid4().int
    chars = []
    for _ in range(22):
        chars.append(IFC_GUID_CHARS[uid % 64])
        uid //= 64
    return "".join(reversed(chars))


class _G:
    def __init__(self): self._n = 1
    def __call__(self) -> int:
        n = self._n; self._n += 1; return n


def _seg(s, e):
    dx = e.x - s.x; dy = e.y - s.y
    ln = math.hypot(dx, dy)
    if ln < 0.01:
        return 1.0, 0.0, 0.0
    return dx / ln, dy / ln, ln


def generate_ifc(model: BuildingModel) -> str:
    g = _G()
    lines: List[str] = []

    def W(s: str):
        lines.append(s)

    # ── HEADER ────────────────────────────────────────────────────────────────
    W("ISO-10303-21;")
    W("HEADER;")
    W("FILE_DESCRIPTION(('AI-Generated BIM — Architecture + Structure + MEP'),'2;1');")
    W("FILE_NAME('model.ifc','2024-01-01T00:00:00',('AI-BIM'),('AI-BIM'),'AI-BIM Generator','','');")
    W("FILE_SCHEMA(('IFC4'));")
    W("ENDSEC;")
    W("DATA;")

    # ── Ownership ─────────────────────────────────────────────────────────────
    per = g(); org = g(); ow = g()
    W(f"#{per}=IFCPERSON($,'AI-BIM',$,$,$,$,$,$);")
    W(f"#{org}=IFCORGANIZATION($,'AI-BIM Generator',$,$,$);")
    W(f"#{ow}=IFCOWNERHISTORY(#{per},#{org},$,.ADDED.,$,$,$,0);")

    # ── Units ─────────────────────────────────────────────────────────────────
    u1=g(); u2=g(); u3=g(); u4=g(); units=g()
    W(f"#{u1}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);")
    W(f"#{u2}=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);")
    W(f"#{u3}=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);")
    W(f"#{u4}=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);")
    W(f"#{units}=IFCUNITASSIGNMENT((#{u1},#{u2},#{u3},#{u4}));")

    # ── Geometric context ─────────────────────────────────────────────────────
    wp=g(); wz=g(); wx=g(); wax=g(); ctx=g()
    W(f"#{wp}=IFCCARTESIANPOINT((0.,0.,0.));")
    W(f"#{wz}=IFCDIRECTION((0.,0.,1.));")
    W(f"#{wx}=IFCDIRECTION((1.,0.,0.));")
    W(f"#{wax}=IFCAXIS2PLACEMENT3D(#{wp},#{wz},#{wx});")
    W(f"#{ctx}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#{wax},$);")

    # ── Geometry helpers ──────────────────────────────────────────────────────

    def _ax3d(ox: float, oy: float, oz: float, dx: float = 1.0, dy: float = 0.0) -> int:
        pt=g(); zd=g(); xd=g(); ax=g()
        W(f"#{pt}=IFCCARTESIANPOINT(({ox:.4f},{oy:.4f},{oz:.4f}));")
        W(f"#{zd}=IFCDIRECTION((0.,0.,1.));")
        W(f"#{xd}=IFCDIRECTION(({dx:.6f},{dy:.6f},0.));")
        W(f"#{ax}=IFCAXIS2PLACEMENT3D(#{pt},#{zd},#{xd});")
        return ax

    def _lp(parent: int, ax: int) -> int:
        lp = g()
        W(f"#{lp}=IFCLOCALPLACEMENT(#{parent},#{ax});")
        return lp

    def _lp_root(ax: int) -> int:
        lp = g()
        W(f"#{lp}=IFCLOCALPLACEMENT($,#{ax});")
        return lp

    def _rect_solid(ax: int, cx: float, cy: float, xs: float, ys: float, depth: float) -> int:
        cp=g(); a2=g(); pr=g(); ez=g(); sol=g()
        W(f"#{cp}=IFCCARTESIANPOINT(({cx:.4f},{cy:.4f}));")
        W(f"#{a2}=IFCAXIS2PLACEMENT2D(#{cp},$);")
        W(f"#{pr}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#{a2},{xs:.4f},{ys:.4f});")
        W(f"#{ez}=IFCDIRECTION((0.,0.,1.));")
        W(f"#{sol}=IFCEXTRUDEDAREASOLID(#{pr},#{ax},#{ez},{depth:.4f});")
        return sol

    def _spd(solid: int) -> int:
        rp=g(); pd=g()
        W(f"#{rp}=IFCSHAPEREPRESENTATION(#{ctx},'Body','SweptSolid',(#{solid}));")
        W(f"#{pd}=IFCPRODUCTDEFINITIONSHAPE($,$,(#{rp}));")
        return pd

    def _linear(spl: int, ox: float, oy: float, oz: float,
                dx: float, dy: float, length: float,
                cross_w: float, cross_h: float):
        """Wall-type linear element: profile in plan, extruded vertically."""
        if length < 0.05:
            return None, None
        ax = _ax3d(ox, oy, oz, dx, dy)
        lp = _lp(spl, ax)
        sol = _rect_solid(ax, length / 2, 0.0, length, cross_w, cross_h)
        pd = _spd(sol)
        return lp, pd

    def _box(spl: int, ox: float, oy: float, oz: float,
             bw: float, bd: float, bh: float):
        """Axis-aligned box element at (ox, oy, oz)."""
        ax = _ax3d(ox, oy, oz, 1.0, 0.0)
        lp = _lp(spl, ax)
        sol = _rect_solid(ax, bw / 2, bd / 2, bw, bd, bh)
        pd = _spd(sol)
        return lp, pd

    # ── Project / Site / Building ─────────────────────────────────────────────
    proj = g()
    W(f"#{proj}=IFCPROJECT('{ifc_guid()}',#{ow},'AI-BIM Project',$,$,$,$,(#{ctx}),#{units});")
    site_pl = _lp_root(_ax3d(0, 0, 0))
    site = g()
    W(f"#{site}=IFCSITE('{ifc_guid()}',#{ow},'Site',$,$,#{site_pl},$,$,.ELEMENT.,$,$,$,$,$);")
    bldg_pl = _lp(site_pl, _ax3d(0, 0, 0))
    bldg = g()
    W(f"#{bldg}=IFCBUILDING('{ifc_guid()}',#{ow},'Building',$,$,#{bldg_pl},$,$,.ELEMENT.,$,$,$);")
    W(f"#{g()}=IFCRELAGGREGATES('{ifc_guid()}',#{ow},'ProjectSite',$,#{proj},(#{site}));")
    W(f"#{g()}=IFCRELAGGREGATES('{ifc_guid()}',#{ow},'SiteBuilding',$,#{site},(#{bldg}));")

    # ── Storeys ───────────────────────────────────────────────────────────────
    fh = model.floor_height
    fl_n = model.requirements.floors
    storey_ids: List[int] = []
    storey_pls: List[int] = []
    for fl in range(fl_n):
        elev = fl * fh
        spl = _lp(bldg_pl, _ax3d(0, 0, elev))
        sid = g()
        W(f"#{sid}=IFCBUILDINGSTOREY('{ifc_guid()}',#{ow},'Level {fl+1}',$,$,#{spl},$,$,.ELEMENT.,{elev:.3f});")
        storey_ids.append(sid)
        storey_pls.append(spl)
    sl_str = ",".join(f"#{s}" for s in storey_ids)
    W(f"#{g()}=IFCRELAGGREGATES('{ifc_guid()}',#{ow},'BuildingStoreys',$,#{bldg},({sl_str}));")

    # ── Per-storey elements ───────────────────────────────────────────────────
    storey_elems: dict[int, List[int]] = {fl: [] for fl in range(fl_n)}

    def _register(fl: int, eid: int):
        if fl in storey_elems:
            storey_elems[fl].append(eid)
        elif storey_elems:
            storey_elems[max(storey_elems)].append(eid)

    # ── Architecture: Walls ───────────────────────────────────────────────────
    walls_by_floor: dict[int, list] = {fl: [] for fl in range(fl_n)}
    for w in model.walls:
        if w.floor < fl_n:
            walls_by_floor[w.floor].append(w)

    for fl, walls in walls_by_floor.items():
        elev = fl * fh
        spl = storey_pls[fl]
        for wall in walls:
            dx, dy, ln = _seg(wall.start, wall.end)
            lp, pd = _linear(spl, wall.start.x, wall.start.y, elev,
                             dx, dy, ln, wall.thickness, wall.height)
            if lp is None:
                continue
            eid = g()
            W(f"#{eid}=IFCWALL('{ifc_guid()}',#{ow},'Wall',$,$,#{lp},#{pd},$,.SOLIDWALL.);")
            _register(fl, eid)

    # ── Architecture: Columns ─────────────────────────────────────────────────
    col_height = fh * fl_n
    spl0 = storey_pls[0]
    for col in model.columns:
        lp, pd = _box(spl0, col.position.x, col.position.y, 0.0,
                      col.width, col.depth, col_height)
        eid = g()
        W(f"#{eid}=IFCCOLUMN('{ifc_guid()}',#{ow},'Column',$,$,#{lp},#{pd},$,$);")
        _register(0, eid)

    # ── Structure: Beams ─────────────────────────────────────────────────────
    for beam in model.beams:
        fl = beam.floor
        if fl >= fl_n:
            continue
        spl = storey_pls[fl]
        elev = fl * fh + (fh - beam.depth)
        dx, dy, ln = _seg(beam.start, beam.end)
        lp, pd = _linear(spl, beam.start.x, beam.start.y, elev,
                         dx, dy, ln, beam.width, beam.depth)
        if lp is None:
            continue
        eid = g()
        W(f"#{eid}=IFCBEAM('{ifc_guid()}',#{ow},'Beam {beam.grid_ref}',$,$,#{lp},#{pd},$,$);")
        _register(fl, eid)

    # ── Structure: Slabs ─────────────────────────────────────────────────────
    for slab in model.slabs:
        fl_target = min(slab.floor, fl_n - 1)
        spl = storey_pls[fl_target]
        xs = [p.x for p in slab.polygon]
        ys = [p.y for p in slab.polygon]
        ox = min(xs); oy = min(ys)
        bw = max(xs) - ox; bd_s = max(ys) - oy
        oz = slab.floor * fh
        lp, pd = _box(spl, ox, oy, oz, bw, bd_s, slab.thickness)
        stype = ".ROOF." if slab.is_roof else ".FLOOR."
        eid = g()
        W(f"#{eid}=IFCSLAB('{ifc_guid()}',#{ow},'Slab',$,$,#{lp},#{pd},$,{stype});")
        _register(fl_target, eid)

    # ── MEP: HVAC Duct Segments ───────────────────────────────────────────────
    for duct in model.duct_segments:
        fl = duct.floor
        if fl >= fl_n:
            continue
        spl = storey_pls[fl]
        elev = fl * fh + fh - 0.5
        dx, dy, ln = _seg(duct.start, duct.end)
        lp, pd = _linear(spl, duct.start.x, duct.start.y, elev,
                         dx, dy, ln, duct.width, duct.height)
        if lp is None:
            continue
        eid = g()
        W(f"#{eid}=IFCDUCTSEGMENT('{ifc_guid()}',#{ow},'Duct',$,$,#{lp},#{pd},$,.RIGIDSEGMENT.);")
        _register(fl, eid)

    # ── MEP: Air Terminals ────────────────────────────────────────────────────
    for term in model.air_terminals:
        fl = term.floor
        if fl >= fl_n:
            continue
        spl = storey_pls[fl]
        elev = fl * fh + fh - 0.35
        lp, pd = _box(spl, term.position.x - 0.15, term.position.y - 0.15, elev,
                      0.3, 0.3, 0.05)
        eid = g()
        W(f"#{eid}=IFCAIRTERMINAL('{ifc_guid()}',#{ow},'Air Terminal',$,$,#{lp},#{pd},$,.SUPPLYAIR.);")
        _register(fl, eid)

    # ── MEP: Pipe Segments ────────────────────────────────────────────────────
    for pipe in model.pipe_segments:
        fl = pipe.floor
        if fl >= fl_n:
            continue
        spl = storey_pls[fl]
        elev = fl * fh + 0.3
        dx, dy, ln = _seg(pipe.start, pipe.end)
        lp, pd = _linear(spl, pipe.start.x, pipe.start.y, elev,
                         dx, dy, ln, pipe.diameter, pipe.diameter)
        if lp is None:
            continue
        eid = g()
        W(f"#{eid}=IFCPIPESEGMENT('{ifc_guid()}',#{ow},'Pipe ({pipe.system})',$,$,#{lp},#{pd},$,.RIGIDSEGMENT.);")
        _register(fl, eid)

    # ── MEP: Plumbing Fixtures ────────────────────────────────────────────────
    for fix in model.plumbing_fixtures:
        fl = fix.floor
        if fl >= fl_n:
            continue
        spl = storey_pls[fl]
        elev = fl * fh
        lp, pd = _box(spl, fix.position.x - 0.2, fix.position.y - 0.2, elev,
                      0.4, 0.6, 0.85)
        eid = g()
        W(f"#{eid}=IFCSANITARYTERMINAL('{ifc_guid()}',#{ow},'{fix.fixture_type.title()}',$,$,#{lp},#{pd},$,.{fix.fixture_type.upper()}.);")
        _register(fl, eid)

    # ── MEP: Cable Segments ───────────────────────────────────────────────────
    for cable in model.cable_segments:
        fl = cable.floor
        if fl >= fl_n:
            continue
        spl = storey_pls[fl]
        elev = fl * fh + fh - 0.1
        dx, dy, ln = _seg(cable.start, cable.end)
        lp, pd = _linear(spl, cable.start.x, cable.start.y, elev,
                         dx, dy, ln, 0.02, 0.02)
        if lp is None:
            continue
        eid = g()
        W(f"#{eid}=IFCCABLESEGMENT('{ifc_guid()}',#{ow},'Cable ({cable.circuit})',$,$,#{lp},#{pd},$,.RIGIDSEGMENT.);")
        _register(fl, eid)

    # ── MEP: Light Fixtures ───────────────────────────────────────────────────
    for lf in model.light_fixtures:
        fl = lf.floor
        if fl >= fl_n:
            continue
        spl = storey_pls[fl]
        elev = fl * fh + fh - 0.15
        lp, pd = _box(spl, lf.position.x - 0.1, lf.position.y - 0.1, elev,
                      0.2, 0.2, 0.1)
        eid = g()
        W(f"#{eid}=IFCLIGHTFIXTURE('{ifc_guid()}',#{ow},'Light Fixture',$,$,#{lp},#{pd},$,.POINTSOURCE.);")
        _register(fl, eid)

    # ── MEP: Distribution Boards ──────────────────────────────────────────────
    for db in model.distribution_boards:
        fl = db.floor
        if fl >= fl_n:
            continue
        spl = storey_pls[fl]
        elev = fl * fh + 1.2
        lp, pd = _box(spl, db.position.x - 0.2, db.position.y - 0.1, elev,
                      0.4, 0.15, 0.5)
        eid = g()
        W(f"#{eid}=IFCELECTRICDISTRIBUTIONBOARD('{ifc_guid()}',#{ow},'Distribution Board',$,$,#{lp},#{pd},$,$);")
        _register(fl, eid)

    # ── ContainedInSpatialStructure ───────────────────────────────────────────
    for fl in range(fl_n):
        elems = storey_elems[fl]
        if not elems:
            continue
        el_str = ",".join(f"#{e}" for e in elems)
        W(f"#{g()}=IFCRELCONTAINEDINSPATIALSTRUCTURE('{ifc_guid()}',#{ow},'Elements',$,({el_str}),#{storey_ids[fl]});")

    W("ENDSEC;")
    W("END-ISO-10303-21;")
    return "\n".join(lines)
