from __future__ import annotations

import io
import json
import os
from typing import Optional

import ollama

from ..models.schemas import (
    BuildingRequirements, RoomRequirement, OccupancyType, RoomType, StructureType,
)

OLLAMA_HOST         = os.getenv("OLLAMA_HOST",         "http://localhost:11434")
OLLAMA_MODEL        = os.getenv("OLLAMA_MODEL",        "gpt-oss")
# Vision model for image description (Pass 1). Falls back to OLLAMA_MODEL if not set.
OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", OLLAMA_MODEL)

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

# Used in pass-1 of vision: ask the model to describe the sketch in plain text
VISION_DESCRIBE_PROMPT = (
    "You are an expert architectural analyst. Study the attached architectural sketch or floor plan drawing carefully.\n\n"
    "Describe in detail everything you can see:\n"
    "- Every room and space with its label/name and approximate dimensions or relative size\n"
    "- The overall layout and arrangement of rooms on each floor\n"
    "- Number of floors or storeys shown\n"
    "- Overall building footprint dimensions if indicated\n"
    "- Building type (house, apartment, office, shop, etc.)\n"
    "- Any structural elements visible (columns, load-bearing walls, stairs, elevators)\n"
    "- All text labels, annotations, dimension strings, or notes in the drawing\n"
    "- Any special features (balcony, garage, basement, courtyard, etc.)\n\n"
    "Write a thorough paragraph description. Do NOT output JSON — just describe what you see."
)


# ── Helpers ───────────────────────────────────────────────────────────────────

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


def _safe_json(text: str) -> dict:
    try:
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except (json.JSONDecodeError, ValueError):
        pass
    return {}


def _extract_pdf_text(file_bytes: bytes) -> str:
    """Extract plain text from a PDF using pdfplumber."""
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        return "\n".join(p for p in pages if p.strip())
    except Exception:
        return ""


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


# ── Vision / PDF extraction (Ollama) ─────────────────────────────────────────

async def extract_requirements_from_file(
    file_bytes: bytes,
    content_type: Optional[str],
    extra_prompt: str = "",
) -> BuildingRequirements:
    ct = (content_type or "").lower()

    if "pdf" in ct:
        # ── PDF: extract text layer, then run through normal text pipeline ───
        pdf_text = _extract_pdf_text(file_bytes)
        if pdf_text.strip():
            description = f"This is architectural information extracted from a PDF drawing:\n\n{pdf_text[:8000]}"
        else:
            description = (
                "A scanned PDF architectural drawing was uploaded but no text could be extracted. "
                "Please generate a reasonable residential building with 2 floors, 3 bedrooms, "
                "2 bathrooms, living room, kitchen, and dining room on a 15x20m site."
            )
        if extra_prompt.strip():
            description += f"\n\nAdditional context from the user: {extra_prompt.strip()}"
        return await extract_requirements(description)

    else:
        # ── Image: two-pass pipeline ──────────────────────────────────────────
        # Pass 1: Ask the vision model to describe the sketch in natural language.
        #         This is a simpler task than producing structured JSON directly
        #         from an image, and gives much more accurate results.
        client = ollama.AsyncClient(host=OLLAMA_HOST)
        try:
            # Pass raw bytes — more compatible across Ollama versions than base64 strings
            desc_response = await client.chat(
                model=OLLAMA_VISION_MODEL,
                messages=[{
                    "role": "user",
                    "content": VISION_DESCRIBE_PROMPT,
                    "images": [file_bytes],
                }],
                options={"temperature": 0.1},
            )
            description = desc_response.message.content.strip()
        except Exception as exc:
            err = str(exc)
            print(f"[vision] raw error from Ollama: {err}", flush=True)
            if "memory" in err.lower():
                raise RuntimeError(
                    f"Not enough RAM for vision model '{OLLAMA_VISION_MODEL}' ({err}). "
                    "Try OLLAMA_VISION_MODEL=llava:7b or OLLAMA_VISION_MODEL=moondream"
                ) from exc
            raise RuntimeError(
                f"Vision model '{OLLAMA_VISION_MODEL}' failed: {err}"
            ) from exc

        if not description:
            description = "An architectural sketch was uploaded but could not be described."

        # Pass 2: Feed the plain-text description into the normal extraction pipeline.
        combined = f"Architectural description based on a sketch:\n\n{description}"
        if extra_prompt.strip():
            combined += f"\n\nAdditional context from the user: {extra_prompt.strip()}"
        return await extract_requirements(combined)
