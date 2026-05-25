export type RoofShape = 'flat' | 'gable' | 'hip' | 'shed' | 'pyramid'

export interface RoofConfig {
  shape:        RoofShape
  pitch:        number
  overhang:     number
  gableAxis:    'EW' | 'NS'
  shedHighEdge: 'N' | 'S' | 'E' | 'W'
}

export const DEFAULT_ROOF_CONFIG: RoofConfig = {
  shape: 'hip', pitch: 30, overhang: 0.6, gableAxis: 'EW', shedHighEdge: 'N',
}
