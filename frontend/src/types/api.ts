export interface Point2D { x: number; y: number }

export interface Room {
  id: string; type: string; name: string
  floor: number; polygon: Point2D[]; area: number
}

export interface Wall {
  id: string; start: Point2D; end: Point2D; floor: number
  thickness: number; height: number; is_external: boolean
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

export interface BuildingModel {
  id: string
  requirements: BuildingRequirements
  rooms: Room[]
  walls: Wall[]
  floor_height: number
  quantity_takeoff: QuantityTakeoff | null
}

export interface GenerationResponse {
  model_id: string
  requirements: BuildingRequirements
  building_model: BuildingModel
  floor_plan_svg: string
  ifc_available: boolean
  message: string
}
