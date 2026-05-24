import json
import os
import ollama
from ..models.schemas import (
    BuildingRequirements, RoomRequirement, OccupancyType, RoomType, StructureType
)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gpt-oss")

SYSTEM_PROMPT = """You are an expert architectural program analyst. Extract building requirements from
natural language descriptions and return ONLY a valid JSON object — no explanation, no markdown.

The JSON must follow this exact schema:
{
  "building_type": "residential" | "office" | "mixed_use" | "retail" | "commercial",
  "floors": <integer 1-50>,
  "site_width": <number in meters>,
  "site_depth": <number in meters>,
  "structure_type": "reinforced_concrete" | "steel_frame" | "timber_frame" | "masonry",
  "has_basement": <boolean>,
  "has_parking": <boolean>,
  "parking_spaces": <integer or null>,
  "rooms": [
    {
      "type": "living" | "dining" | "kitchen" | "bedroom" | "bathroom" | "toilet" |
              "office" | "lobby" | "corridor" | "staircase" | "storage" | "meeting_room" | "parking",
      "count": <integer>,
      "min_area": <number in sqm or null>
    }
  ],
  "climate": <string or null>,
  "style": <string or null>,
  "special_requirements": <string or null>
}

Rules:
- "rooms" must always include necessary support spaces (corridor, staircase, bathroom)
- Default site: small house 12x18m, medium house 15x22m, large house 20x28m, office 20x25m
- Default structure: reinforced_concrete
- If floors > 1, always include at least one staircase in rooms
- Always include at least one bathroom
"""


def _default_rooms_for_type(building_type: str) -> list:
    if building_type == "residential":
        return [
            {"type": "living", "count": 1},
            {"type": "dining", "count": 1},
            {"type": "kitchen", "count": 1},
            {"type": "bedroom", "count": 3},
            {"type": "bathroom", "count": 2},
            {"type": "staircase", "count": 1},
        ]
    return [
        {"type": "lobby", "count": 1},
        {"type": "office", "count": 1},
        {"type": "bathroom", "count": 1},
        {"type": "staircase", "count": 1},
    ]


async def extract_requirements(prompt: str) -> BuildingRequirements:
    client = ollama.AsyncClient(host=OLLAMA_HOST)

    response = await client.chat(
        model=OLLAMA_MODEL,
        format="json",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Extract building requirements from:\n\n{prompt}"}
        ],
        options={"temperature": 0.1}
    )

    try:
        data = json.loads(response.message.content)
    except (json.JSONDecodeError, KeyError):
        data = {}

    building_type = data.get("building_type", "residential")
    if building_type not in [t.value for t in OccupancyType]:
        building_type = "residential"

    raw_rooms = data.get("rooms") or _default_rooms_for_type(building_type)
    rooms = []
    valid_room_types = {t.value for t in RoomType}
    for r in raw_rooms:
        rt = r.get("type", "")
        if rt not in valid_room_types:
            continue
        rooms.append(RoomRequirement(
            type=RoomType(rt),
            count=max(1, int(r.get("count", 1))),
            min_area=r.get("min_area")
        ))

    structure_raw = data.get("structure_type", "reinforced_concrete")
    try:
        structure = StructureType(structure_raw)
    except ValueError:
        structure = StructureType.REINFORCED_CONCRETE

    return BuildingRequirements(
        building_type=OccupancyType(building_type),
        floors=max(1, min(50, int(data.get("floors", 2)))),
        site_width=max(6.0, float(data.get("site_width", 15.0))),
        site_depth=max(8.0, float(data.get("site_depth", 20.0))),
        structure_type=structure,
        has_basement=bool(data.get("has_basement", False)),
        has_parking=bool(data.get("has_parking", False)),
        parking_spaces=data.get("parking_spaces"),
        rooms=rooms,
        climate=data.get("climate"),
        style=data.get("style"),
        special_requirements=data.get("special_requirements")
    )
