from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from ...models.schemas import GenerationRequest, GenerationResponse
from ...agents.requirement_extractor import extract_requirements
from ...engines.spatial_planner import generate_building_model
from ...engines.structural_engine import generate_structural_elements
from ...engines.mep_engine import generate_mep_systems
from ...engines.quantity_takeoff import generate_quantity_takeoff
from ...engines.ifc_engine import generate_ifc
from ...engines.svg_renderer import render_floor_plan
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
