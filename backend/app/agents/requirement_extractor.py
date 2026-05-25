from __future__ import annotations

import base64
import json
import os
from typing import Optional

import ollama
from anthropic import AsyncAnthropic

from ..models.schemas import (
    BuildingRequirements, RoomRequirement, OccupancyType, RoomType, StructureType,
)

OLLAMA_HOST  = os.getenv("OLLAMA_HOST",  "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gpt-oss")

_JSON_SCHEMA = """{
  "building_type": "residential|office|mixed_use|retail|commercial",
  "floors": <integer 1-50>,
  "site_width": <number in meters>,
  "site_depth": <number in meters>,
  "structure_type": "reinforced_concrete|steel_frame|timber_frame|masonry",
  "has_basement": <boolean>,
  "has_parking": <boolean>,
  "parking_spaces": <integer or null>,
  "rooms": [
    {
      "type": "living|dining|kitchen|bedroom|bathroom|toilet|office|lobby|corridor|staircase|storage|meeting_room|parking",
      "count": <integer>,
      "min_area": <number in sqm or null>
    }
  ],
  "climate": <string or null>,
  "style": <string or null>,
  "special_requirements": <string or null>
}"""

SYSTEM_PROMPT = (
    "You are an expert architectural program analyst. Extract building requirements from "
    "natural language descriptions and return ONLY a valid JSON object — no explanation, no markdown.\n\n"
    "The JSON must follow this exact schema:\n" + _JSON_SCHEMA + "\n\n"
    "Rules:\n"
    "- 'rooms' must always include necessary support spaces (corridor, staircase, bathroom)\n"
    "- Default site: small house 12x18m, medium house 15x22m, large house 20x28m, office 20x25m\n"
    "- Default structure: reinforced_concrete\n"
    "- If floors > 1, always include at least one staircase in rooms\n"
    "- Always include at least one bathroom"
)

VISION_PROMPT = (
    "You are an expert architectural analyst. Carefully study the attached sketch or drawing.\n"
    "Identify every room/space visible, approximate dimensions, number of floors, building type, "
    "structural hints, and any labels or annotations.\n"
    "Then return ONLY a valid JSON object — no explanation, no markdown.\n\n"
    "The JSON must follow this exact schema:\n" + _JSON_SCHEMA + "\n\n"
    "Rules:\n"
    "- Map each labeled space to the nearest valid room type\n"
    "- If dimensions are shown, use them; otherwise estimate from typical practice\n"
    "- If floors > 1, include at least one staircase\n"
    "- Always include at least one bathroom\n"
    "- Capture anything unusual (e.g. rooftop terrace, basement) in special_requirements"
)


# ── Shared JSON parser ────────────────────────────────────────────────────────

def _default_rooms(building_type: str) -> list:
    if building_type == "residential":
        return [
            {"type": "living",    "count": 1},
            {"type": "dining",    "count": 1},
            {"type": "kitchen",   "count": 1},
            {"type": "bedroom",   "count": 3},
            {"type": "bathroom",  "count": 2},
            {"type": "staircase", "count": 1},
        ]
    return [
        {"type": "lobby",     "count": 1},
        {"type": "office",    "count": 1},
        {"type": "bathroom",  "count": 1},
        {"type": "staircase", "count": 1},
    ]


def _parse(data: dict) -> BuildingRequirements:
    building_type = data.get("building_type", "residential")
    if building_type not in {t.value for t in OccupancyType}:
        building_type = "residential"

    raw_rooms = data.get("rooms") or _default_rooms(building_type)
    valid_types = {t.value for t in RoomType}
    rooms = [
        RoomRequirement(
            type=RoomType(r["type"]),
            count=max(1, int(r.get("count", 1))),
            min_area=r.get("min_area"),
        )
        for r in raw_rooms
        if r.get("type") in valid_types
    ]

    try:
        structure = StructureType(data.get("structure_type", "reinforced_concrete"))
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
        special_requirements=data.get("special_requirements"),
    )


def _extract_json(text: str) -> dict:
    try:
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except (json.JSONDecodeError, ValueError):
        pass
    return {}


# ── Text extraction (Ollama) ──────────────────────────────────────────────────

async def extract_requirements(prompt: str) -> BuildingRequirements:
    client = ollama.AsyncClient(host=OLLAMA_HOST)
    response = await client.chat(
        model=OLLAMA_MODEL,
        format="json",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": f"Extract building requirements from:\n\n{prompt}"},
        ],
        options={"temperature": 0.1},
    )
    try:
        data = json.loads(response.message.content)
    except (json.JSONDecodeError, KeyError):
        data = {}
    return _parse(data)


# ── Vision / PDF extraction (Claude) ─────────────────────────────────────────

async def extract_requirements_from_file(
    file_bytes: bytes,
    content_type: Optional[str],
    extra_prompt: str = "",
) -> BuildingRequirements:
    ct = (content_type or "").lower()
    b64 = base64.standard_b64encode(file_bytes).decode()

    if "pdf" in ct:
        file_block: dict = {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": b64},
        }
    else:
        if "png" in ct:
            mime = "image/png"
        elif "gif" in ct:
            mime = "image/gif"
        elif "webp" in ct:
            mime = "image/webp"
        else:
            mime = "image/jpeg"
        file_block = {
            "type": "image",
            "source": {"type": "base64", "media_type": mime, "data": b64},
        }

    user_text = VISION_PROMPT
    if extra_prompt.strip():
        user_text += f"\n\nAdditional context from the user: {extra_prompt.strip()}"

    client = AsyncAnthropic()
    response = await client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [file_block, {"type": "text", "text": user_text}],
            }
        ],
    )

    raw = response.content[0].text if response.content else ""
    return _parse(_extract_json(raw))
