import uuid
from typing import List
from ..models.schemas import (
    BuildingModel, Beam, Slab, StructuralGrid, Point2D
)

BEAM_WIDTH = 0.3
BEAM_DEPTH = 0.5
SLAB_THICKNESS = 0.2


def _uid() -> str:
    return str(uuid.uuid4())


def _unique_sorted(values: List[float], tol: float = 0.05) -> List[float]:
    buckets: dict[int, float] = {}
    for v in values:
        key = round(v / tol)
        buckets[key] = v
    return [buckets[k] for k in sorted(buckets)]


def _alpha_labels(n: int) -> List[str]:
    out = []
    for i in range(n):
        if i < 26:
            out.append(chr(65 + i))
        else:
            out.append(chr(64 + i // 26) + chr(65 + i % 26))
    return out


def generate_structural_elements(model: BuildingModel) -> BuildingModel:
    reqs = model.requirements
    floor_count = reqs.floors
    floor_height = model.floor_height

    xs = _unique_sorted([c.position.x for c in model.columns])
    ys = _unique_sorted([c.position.y for c in model.columns])

    if len(xs) < 2 or len(ys) < 2:
        return model

    col_labels = _alpha_labels(len(xs))
    row_labels = [str(i + 1) for i in range(len(ys))]

    structural_grid = StructuralGrid(
        column_labels=col_labels,
        row_labels=row_labels,
        origin_x=xs[0],
        origin_y=ys[0],
        spacings_x=[round(xs[i + 1] - xs[i], 3) for i in range(len(xs) - 1)],
        spacings_y=[round(ys[i + 1] - ys[i], 3) for i in range(len(ys) - 1)],
    )

    beams: List[Beam] = []
    for fl in range(floor_count):
        # X-direction beams
        for j, y in enumerate(ys):
            for i in range(len(xs) - 1):
                beams.append(Beam(
                    id=_uid(),
                    start=Point2D(x=xs[i], y=y),
                    end=Point2D(x=xs[i + 1], y=y),
                    floor=fl,
                    width=BEAM_WIDTH,
                    depth=BEAM_DEPTH,
                    grid_ref=f"{col_labels[i]}{row_labels[j]}-{col_labels[i+1]}{row_labels[j]}"
                ))
        # Y-direction beams
        for i, x in enumerate(xs):
            for j in range(len(ys) - 1):
                beams.append(Beam(
                    id=_uid(),
                    start=Point2D(x=x, y=ys[j]),
                    end=Point2D(x=x, y=ys[j + 1]),
                    floor=fl,
                    width=BEAM_WIDTH,
                    depth=BEAM_DEPTH,
                    grid_ref=f"{col_labels[i]}{row_labels[j]}-{col_labels[i]}{row_labels[j+1]}"
                ))

    # Slabs: one per floor + roof
    from .spatial_planner import SETBACK_FRONT, SETBACK_BACK, SETBACK_SIDE
    ox = SETBACK_SIDE
    oy = SETBACK_FRONT
    bw = reqs.site_width - SETBACK_SIDE * 2
    bd = reqs.site_depth - SETBACK_FRONT - SETBACK_BACK

    footprint = [
        Point2D(x=ox, y=oy),
        Point2D(x=ox + bw, y=oy),
        Point2D(x=ox + bw, y=oy + bd),
        Point2D(x=ox, y=oy + bd),
    ]

    slabs: List[Slab] = []
    for fl in range(floor_count):
        slabs.append(Slab(
            id=_uid(), floor=fl, polygon=footprint,
            thickness=SLAB_THICKNESS, is_roof=False
        ))
    slabs.append(Slab(
        id=_uid(), floor=floor_count, polygon=footprint,
        thickness=SLAB_THICKNESS, is_roof=True
    ))

    model.beams = beams
    model.slabs = slabs
    model.structural_grid = structural_grid
    return model
