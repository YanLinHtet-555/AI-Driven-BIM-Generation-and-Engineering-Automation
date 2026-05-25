import uuid as _uuid
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from ...models.schemas import (
    GenerationRequest, GenerationResponse, ModelEditRequest,
    Room, RoomType, Wall, Door, Window, Point2D, Column,
)
from ...agents.requirement_extractor import extract_requirements
from ...engines.spatial_planner import generate_building_model, SETBACK_SIDE, SETBACK_FRONT
from ...engines.structural_engine import generate_structural_elements
from ...engines.mep_engine import generate_mep_systems
from ...engines.quantity_takeoff import generate_quantity_takeoff
from ...engines.ifc_engine import generate_ifc
from ...engines.svg_renderer import render_floor_plan
from ...engines.steel_engine import generate_steel_members
from ...engines.cost_engine import generate_cost_estimate
from ... import state

router = APIRouter()


@router.post("/generate", response_model=GenerationResponse)
async def generate_building(request: GenerationRequest) -> GenerationResponse:
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    requirements = await extract_requirements(request.prompt)

    model = generate_building_model(requirements)
    model = generate_structural_elements(model)
    model = generate_mep_systems(model)
    model = generate_quantity_takeoff(model)
    model = generate_steel_members(model)
    model = generate_cost_estimate(model)

    ifc_text = generate_ifc(model)
    svg = render_floor_plan(model, target_floor=0)

    state.save_model(model)
    state.save_ifc(model.id, ifc_text)

    return GenerationResponse(
        model_id=model.id,
        requirements=requirements,
        building_model=model,
        floor_plan_svg=svg,
        ifc_available=True,
        message="Building generated successfully"
    )


@router.patch("/models/{model_id}", response_model=GenerationResponse)
async def update_model(model_id: str, edit: ModelEditRequest) -> GenerationResponse:
    model = state.get_model(model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")

    if edit.floor_height is not None:
        model.floor_height = edit.floor_height

    if edit.rooms is not None:
        other = [r for r in model.rooms if r.floor != edit.floor]
        new_rooms = []
        for re in edit.rooms:
            rid = re.id if not re.id.startswith("new-") else str(_uuid.uuid4())
            new_rooms.append(Room(
                id=rid,
                type=RoomType(re.type),
                name=re.name,
                floor=edit.floor,
                polygon=[
                    Point2D(x=re.x,          y=re.y),
                    Point2D(x=re.x + re.w,   y=re.y),
                    Point2D(x=re.x + re.w,   y=re.y + re.h),
                    Point2D(x=re.x,          y=re.y + re.h),
                ],
                area=round(re.w * re.h, 2),
            ))
        model.rooms = other + new_rooms

    if edit.walls is not None:
        other_walls = [w for w in model.walls if w.floor != edit.floor]
        new_walls = []
        for we in edit.walls:
            wid = we.id if not we.id.startswith("new-") else str(_uuid.uuid4())
            new_walls.append(Wall(
                id=wid,
                start=Point2D(x=we.start_x, y=we.start_y),
                end=Point2D(x=we.end_x,   y=we.end_y),
                floor=edit.floor,
                thickness=we.thickness,
                height=we.height,
                is_external=we.is_external,
            ))
        model.walls = other_walls + new_walls

    if edit.doors is not None:
        other_doors = [d for d in model.doors if d.floor != edit.floor]
        new_doors = []
        for de in edit.doors:
            did = de.id if not de.id.startswith("new-") else str(_uuid.uuid4())
            new_doors.append(Door(
                id=did,
                wall_id=de.wall_id,
                position=Point2D(x=de.position_x, y=de.position_y),
                width=de.width,
                height=de.height,
                floor=edit.floor,
            ))
        model.doors = other_doors + new_doors

    if edit.windows is not None:
        other_windows = [w for w in model.windows if w.floor != edit.floor]
        new_windows = []
        for we in edit.windows:
            wid = we.id if not we.id.startswith("new-") else str(_uuid.uuid4())
            new_windows.append(Window(
                id=wid,
                wall_id=we.wall_id,
                position=Point2D(x=we.position_x, y=we.position_y),
                width=we.width,
                height=we.height,
                sill_height=we.sill_height,
                floor=edit.floor,
            ))
        model.windows = other_windows + new_windows

    regen_structural = (
        edit.structural_spacings_x is not None or
        edit.structural_spacings_y is not None
    )
    if regen_structural:
        sx = edit.structural_spacings_x or (model.structural_grid.spacings_x if model.structural_grid else [])
        sy = edit.structural_spacings_y or (model.structural_grid.spacings_y if model.structural_grid else [])
        xs = [SETBACK_SIDE]
        for s in sx:
            xs.append(round(xs[-1] + s, 4))
        ys = [SETBACK_FRONT]
        for s in sy:
            ys.append(round(ys[-1] + s, 4))
        model.columns = [
            Column(id=str(_uuid.uuid4()), position=Point2D(x=x, y=y), width=0.5, depth=0.5)
            for x in xs for y in ys
        ]
        model = generate_structural_elements(model)

    model = generate_mep_systems(model)
    model = generate_quantity_takeoff(model)
    model = generate_steel_members(model)
    model = generate_cost_estimate(model)
    ifc_text = generate_ifc(model)
    svg = render_floor_plan(model, target_floor=edit.floor)

    state.save_model(model)
    state.save_ifc(model.id, ifc_text)

    return GenerationResponse(
        model_id=model.id,
        requirements=model.requirements,
        building_model=model,
        floor_plan_svg=svg,
        ifc_available=True,
        message="Model updated successfully",
    )


@router.get("/models/{model_id}/ifc")
async def download_ifc(model_id: str) -> Response:
    data = state.get_ifc(model_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Model not found")
    return Response(
        content=data,
        media_type="application/x-step",
        headers={"Content-Disposition": f'attachment; filename="{model_id}.ifc"'}
    )


@router.get("/models/{model_id}/floorplan")
async def get_floorplan(model_id: str, floor: int = 0) -> Response:
    model = state.get_model(model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    svg = render_floor_plan(model, target_floor=floor)
    return Response(content=svg, media_type="image/svg+xml")


@router.get("/models/{model_id}/qto")
async def get_qto_csv(model_id: str) -> Response:
    model = state.get_model(model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    if model.quantity_takeoff is None:
        raise HTTPException(status_code=404, detail="QTO not available")

    rows = ["Category,Item,Unit,Quantity"]
    for item in model.quantity_takeoff.items:
        rows.append(f"{item.category},{item.item},{item.unit},{item.quantity}")
    csv = "\n".join(rows)

    return Response(
        content=csv.encode(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{model_id}_qto.csv"'}
    )
