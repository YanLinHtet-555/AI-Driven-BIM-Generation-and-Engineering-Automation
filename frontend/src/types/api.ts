export interface Point2D { x: number; y: number }

export interface Room {
  id: string; type: string; name: string
  floor: number; polygon: Point2D[]; area: number
}

export interface Wall {
  id: string; start: Point2D; end: Point2D; floor: number
  thickness: number; height: number; is_external: boolean
}

export interface Door {
  id: string; wall_id: string; position: Point2D
  width: number; height: number; floor: number
}

export interface WindowElement {
  id: string; wall_id: string; position: Point2D
  width: number; height: number; sill_height: number; floor: number
}

export interface Column {
  id: string; position: Point2D; width: number; depth: number
}

export interface Beam {
  id: string; start: Point2D; end: Point2D; floor: number
  width: number; depth: number
}

export interface Slab {
  id: string; floor: number; polygon: Point2D[]
  thickness: number; is_roof: boolean
}

export interface DuctSegment {
  id: string; start: Point2D; end: Point2D; floor: number
  width: number; height: number; system: string
}

export interface PipeSegment {
  id: string; start: Point2D; end: Point2D; floor: number
  diameter: number; system: string
}

export interface CableSegment {
  id: string; start: Point2D; end: Point2D; floor: number; circuit: string
}

export interface LightFixture {
  id: string; position: Point2D; floor: number; wattage: number
}

export interface BuildingRequirements {
  building_type: string; floors: number
  site_width: number; site_depth: number
  structure_type: string; has_basement: boolean; has_parking: boolean
  parking_spaces: number | null
  climate: string | null; style: string | null; special_requirements: string | null
}

export interface QuantityItem {
  category: string; item: string; unit: string; quantity: number
}

export interface QuantityTakeoff {
  items: QuantityItem[]
  total_floor_area: number
  total_gross_area: number
}

export interface SteelSection {
  designation: string
  weight_per_m: number
  area_cm2: number
  depth_mm: number
  Zx_cm3: number
}

export interface SteelMember {
  id: string
  ref_id: string
  member_type: 'beam' | 'column'
  floor: number
  section: SteelSection
  span_m: number
  demand: number
  capacity: number
  utilization: number
  status: 'ok' | 'warning' | 'overstressed'
}

export interface CostItem {
  category: string
  description: string
  quantity: number
  unit: string
  unit_rate: number
  amount: number
}

export interface CostEstimate {
  items: CostItem[]
  grand_total: number
  currency: string
}

export interface StructuralGrid {
  column_labels: string[]; row_labels: string[]
  origin_x: number; origin_y: number
  spacings_x: number[]; spacings_y: number[]
}

export interface BuildingModel {
  id: string
  requirements: BuildingRequirements
  rooms: Room[]
  walls: Wall[]
  doors: Door[]
  windows: WindowElement[]
  columns: Column[]
  beams: Beam[]
  slabs: Slab[]
  duct_segments: DuctSegment[]
  pipe_segments: PipeSegment[]
  cable_segments: CableSegment[]
  light_fixtures: LightFixture[]
  floor_height: number
  structural_grid: StructuralGrid | null
  quantity_takeoff: QuantityTakeoff | null
  steel_members: SteelMember[]
  cost_estimate: CostEstimate | null
}

export interface RoomEdit {
  id: string; name: string; type: string
  x: number; y: number; w: number; h: number
}

export interface WallEdit {
  id: string
  start_x: number; start_y: number
  end_x: number;   end_y: number
  thickness: number; height: number; is_external: boolean
}

export interface DoorEdit {
  id: string; wall_id: string
  position_x: number; position_y: number
  width: number; height: number; floor: number
}

export interface WindowEdit {
  id: string; wall_id: string
  position_x: number; position_y: number
  width: number; height: number; sill_height: number; floor: number
}

export interface ModelEditRequest {
  floor: number
  rooms?: RoomEdit[]
  walls?: WallEdit[]
  doors?: DoorEdit[]
  windows?: WindowEdit[]
  structural_spacings_x?: number[]
  structural_spacings_y?: number[]
  floor_height?: number
}

export interface GenerationResponse {
  model_id: string
  requirements: BuildingRequirements
  building_model: BuildingModel
  floor_plan_svg: string
  ifc_available: boolean
  message: string
}
