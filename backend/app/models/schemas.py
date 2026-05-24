from __future__ import annotations
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class OccupancyType(str, Enum):
    RESIDENTIAL = "residential"
    OFFICE = "office"
    MIXED_USE = "mixed_use"
    RETAIL = "retail"
    COMMERCIAL = "commercial"


class RoomType(str, Enum):
    LIVING = "living"
    DINING = "dining"
    KITCHEN = "kitchen"
    BEDROOM = "bedroom"
    BATHROOM = "bathroom"
    TOILET = "toilet"
    OFFICE = "office"
    LOBBY = "lobby"
    CORRIDOR = "corridor"
    STAIRCASE = "staircase"
    STORAGE = "storage"
    MEETING_ROOM = "meeting_room"
    PARKING = "parking"


class StructureType(str, Enum):
    REINFORCED_CONCRETE = "reinforced_concrete"
    STEEL_FRAME = "steel_frame"
    TIMBER_FRAME = "timber_frame"
    MASONRY = "masonry"


class RoomRequirement(BaseModel):
    type: RoomType
    count: int = 1
    min_area: Optional[float] = None


class BuildingRequirements(BaseModel):
    building_type: OccupancyType
    floors: int = Field(ge=1, le=50, default=2)
    site_width: float = Field(gt=0, default=15.0)
    site_depth: float = Field(gt=0, default=20.0)
    structure_type: StructureType = StructureType.REINFORCED_CONCRETE
    has_basement: bool = False
    has_parking: bool = False
    parking_spaces: Optional[int] = None
    rooms: List[RoomRequirement] = []
    climate: Optional[str] = None
    style: Optional[str] = None
    special_requirements: Optional[str] = None


class Point2D(BaseModel):
    x: float
    y: float


class Room(BaseModel):
    id: str
    type: RoomType
    name: str
    floor: int
    polygon: List[Point2D]
    area: float


class Wall(BaseModel):
    id: str
    start: Point2D
    end: Point2D
    floor: int
    thickness: float = 0.2
    height: float = 3.0
    is_external: bool = False


class Door(BaseModel):
    id: str
    wall_id: str
    position: Point2D
    width: float = 0.9
    height: float = 2.1
    floor: int


class Window(BaseModel):
    id: str
    wall_id: str
    position: Point2D
    width: float = 1.2
    height: float = 1.2
    sill_height: float = 0.9
    floor: int


class Column(BaseModel):
    id: str
    position: Point2D
    width: float = 0.5
    depth: float = 0.5


# ── Structural ──────────────────────────────────────────────────────────────

class Beam(BaseModel):
    id: str
    start: Point2D
    end: Point2D
    floor: int
    width: float = 0.3
    depth: float = 0.5
    grid_ref: str = ""


class Slab(BaseModel):
    id: str
    floor: int
    polygon: List[Point2D]
    thickness: float = 0.2
    is_roof: bool = False


class StructuralGrid(BaseModel):
    column_labels: List[str]
    row_labels: List[str]
    origin_x: float
    origin_y: float
    spacings_x: List[float]
    spacings_y: List[float]


# ── MEP ─────────────────────────────────────────────────────────────────────

class DuctSegment(BaseModel):
    id: str
    start: Point2D
    end: Point2D
    floor: int
    width: float = 0.3
    height: float = 0.2
    system: str = "supply"


class AirTerminal(BaseModel):
    id: str
    position: Point2D
    floor: int
    flow_rate: float = 100.0


class PipeSegment(BaseModel):
    id: str
    start: Point2D
    end: Point2D
    floor: int
    diameter: float = 0.1
    system: str = "cold_water"


class PlumbingFixture(BaseModel):
    id: str
    position: Point2D
    floor: int
    fixture_type: str


class CableSegment(BaseModel):
    id: str
    start: Point2D
    end: Point2D
    floor: int
    circuit: str = "power"


class LightFixture(BaseModel):
    id: str
    position: Point2D
    floor: int
    wattage: float = 18.0


class DistributionBoard(BaseModel):
    id: str
    position: Point2D
    floor: int


# ── Quantity Takeoff ─────────────────────────────────────────────────────────

class QuantityItem(BaseModel):
    category: str
    item: str
    unit: str
    quantity: float


class QuantityTakeoff(BaseModel):
    items: List[QuantityItem]
    total_floor_area: float
    total_gross_area: float


# ── Building Model ───────────────────────────────────────────────────────────

class BuildingModel(BaseModel):
    id: str
    requirements: BuildingRequirements
    rooms: List[Room] = []
    walls: List[Wall] = []
    doors: List[Door] = []
    windows: List[Window] = []
    columns: List[Column] = []
    beams: List[Beam] = []
    slabs: List[Slab] = []
    structural_grid: Optional[StructuralGrid] = None
    duct_segments: List[DuctSegment] = []
    air_terminals: List[AirTerminal] = []
    pipe_segments: List[PipeSegment] = []
    plumbing_fixtures: List[PlumbingFixture] = []
    cable_segments: List[CableSegment] = []
    light_fixtures: List[LightFixture] = []
    distribution_boards: List[DistributionBoard] = []
    quantity_takeoff: Optional[QuantityTakeoff] = None
    floor_height: float = 3.2


class GenerationRequest(BaseModel):
    prompt: str


class GenerationResponse(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_id: str
    requirements: BuildingRequirements
    building_model: BuildingModel
    floor_plan_svg: str
    ifc_available: bool = True
    message: str = "Generation successful"
