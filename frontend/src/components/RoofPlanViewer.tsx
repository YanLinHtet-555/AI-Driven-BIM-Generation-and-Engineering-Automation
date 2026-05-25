import type { GenerationResponse } from '../types/api'
import type { RoofConfig } from '../types/viewer'

// ── Constants (must match backend spatial_planner.py) ──────────────────────
const SETBACK_FRONT = 4.0
const SETBACK_BACK  = 3.0
const SETBACK_SIDE  = 2.0
const SCALE = 20
const PAD   = 34
const DIM_L = 54
const DIM_T = 52

interface Props {
  result: GenerationResponse
  config: RoofConfig
  onConfigChange: (c: RoofConfig) => void
}

type RoofShape = RoofConfig['shape']

const SHAPES: { id: RoofShape; label: string; icon: string }[] = [
  { id: 'flat',    label: 'Flat',    icon: '▬' },
  { id: 'gable',   label: 'Gable',   icon: '⌂' },
  { id: 'hip',     label: 'Hip',     icon: '◇' },
  { id: 'shed',    label: 'Shed',    icon: '◺' },
  { id: 'pyramid', label: 'Pyramid', icon: '△' },
]

// ── SVG helpers (group-local pixels, same origin as svg_renderer.py) ────────
function px(m: number): number { return m * SCALE + PAD }

function tick(cx: number, cy: number): string {
  const h = 4.5
  return `<line x1="${(cx-h/2).toFixed(1)}" y1="${(cy+h/2).toFixed(1)}" x2="${(cx+h/2).toFixed(1)}" y2="${(cy-h/2).toFixed(1)}" stroke="#445566" stroke-width="1.2"/>`
}

function dimH(x1m: number, x2m: number, yLine: number): string {
  const p1 = px(x1m), p2 = px(x2m)
  const d = Math.abs(x2m - x1m)
  const lbl = d % 1 === 0 ? `${d}m` : `${d.toFixed(1)}m`
  const mx = (p1 + p2) / 2, yb = px(0)
  return [
    `<line x1="${p1}" y1="${yb}" x2="${p1}" y2="${yLine-2}" stroke="#90a4ae" stroke-width="0.5" stroke-dasharray="2,2"/>`,
    `<line x1="${p2}" y1="${yb}" x2="${p2}" y2="${yLine-2}" stroke="#90a4ae" stroke-width="0.5" stroke-dasharray="2,2"/>`,
    `<line x1="${p1}" y1="${yLine}" x2="${p2}" y2="${yLine}" stroke="#546e7a" stroke-width="0.8"/>`,
    tick(p1, yLine), tick(p2, yLine),
    `<text x="${mx}" y="${yLine-3}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#445566">${lbl}</text>`,
  ].join('\n')
}

function dimV(y1m: number, y2m: number, xLine: number): string {
  const p1 = px(y1m), p2 = px(y2m)
  const d = Math.abs(y2m - y1m)
  const lbl = d % 1 === 0 ? `${d}m` : `${d.toFixed(1)}m`
  const my = (p1 + p2) / 2, xb = px(0)
  return [
    `<line x1="${xb}" y1="${p1}" x2="${xLine+2}" y2="${p1}" stroke="#90a4ae" stroke-width="0.5" stroke-dasharray="2,2"/>`,
    `<line x1="${xb}" y1="${p2}" x2="${xLine+2}" y2="${p2}" stroke="#90a4ae" stroke-width="0.5" stroke-dasharray="2,2"/>`,
    `<line x1="${xLine}" y1="${p1}" x2="${xLine}" y2="${p2}" stroke="#546e7a" stroke-width="0.8"/>`,
    tick(xLine, p1), tick(xLine, p2),
    `<text x="${xLine-3}" y="${my}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#445566" transform="rotate(-90 ${xLine-3} ${my})">${lbl}</text>`,
  ].join('\n')
}

// Small downhill-pointing triangle arrow at pixel (cx, cy) toward angleDeg
// SVG angles: 0=east 90=south 180=west 270=north
function arrow(cx: number, cy: number, angleDeg: number, size = 7): string {
  const r = (angleDeg * Math.PI) / 180
  const tx = cx + Math.cos(r) * size, ty = cy + Math.sin(r) * size
  const bx = cx - Math.cos(r) * size * 0.45, by = cy - Math.sin(r) * size * 0.45
  const wx = -Math.sin(r) * size * 0.32, wy = Math.cos(r) * size * 0.32
  return `<polygon points="${tx.toFixed(1)},${ty.toFixed(1)} ${(bx+wx).toFixed(1)},${(by+wy).toFixed(1)} ${(bx-wx).toFixed(1)},${(by-wy).toFixed(1)}" fill="#546e7a" opacity="0.55"/>`
}

// Regular grid of slope arrows covering a metre-space rectangle
function arrowGrid(x1m: number, y1m: number, x2m: number, y2m: number, angleDeg: number, step = 2.5): string {
  const cols = Math.max(1, Math.round((x2m - x1m) / step))
  const rows = Math.max(1, Math.round((y2m - y1m) / step))
  const out: string[] = []
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++)
      out.push(arrow(
        px(x1m + (c + 0.5) * (x2m - x1m) / cols),
        px(y1m + (r + 0.5) * (y2m - y1m) / rows),
        angleDeg,
      ))
  return out.join('\n')
}

// ── SVG generator ────────────────────────────────────────────────────────────
function buildRoofSVG(siteW: number, siteH: number, cfg: RoofConfig): string {
  const { shape, pitch, overhang: o, gableAxis, shedHighEdge } = cfg
  const ox = SETBACK_SIDE, oy = SETBACK_FRONT
  const bw = siteW - SETBACK_SIDE * 2
  const bd = siteH - SETBACK_FRONT - SETBACK_BACK
  const deg2rad = (d: number) => d * Math.PI / 180

  const totalW = siteW * SCALE + PAD * 2 + DIM_L
  const totalH = siteH * SCALE + PAD * 2 + DIM_T + 60
  const L: string[] = []

  L.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`)
  L.push(`<rect width="100%" height="100%" fill="#f5f4f0"/>`)
  // Drawing border
  L.push(`<rect x="4" y="4" width="${totalW-8}" height="${totalH-8}" fill="none" stroke="#999999" stroke-width="0.8"/>`)
  L.push(`<rect x="8" y="8" width="${totalW-16}" height="${totalH-16}" fill="none" stroke="#333333" stroke-width="1.5"/>`)
  L.push(`<g transform="translate(${DIM_L},${DIM_T})">`)

  // Building footprint white background
  L.push(`<rect x="${px(0)}" y="${px(0)}" width="${siteW*SCALE}" height="${siteH*SCALE}" fill="white" stroke="none"/>`)
  // Site boundary
  L.push(`<rect x="${px(0)}" y="${px(0)}" width="${siteW*SCALE}" height="${siteH*SCALE}" fill="none" stroke="#99aa88" stroke-width="1.2" stroke-dasharray="8,4"/>`)

  // ── FLAT ─────────────────────────────────────────────────────────────────
  if (shape === 'flat') {
    const pi = 0.25
    L.push(`<rect x="${px(ox)}" y="${px(oy)}" width="${bw*SCALE}" height="${bd*SCALE}" fill="#d8d2c8" opacity="0.7" stroke="#333333" stroke-width="2"/>`)
    L.push(`<rect x="${px(ox+pi)}" y="${px(oy+pi)}" width="${(bw-2*pi)*SCALE}" height="${(bd-2*pi)*SCALE}" fill="none" stroke="#546e7a" stroke-width="1" stroke-dasharray="4,2"/>`)
    // Central drain
    const cx = px(ox + bw/2), cy = px(oy + bd/2)
    L.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="#1565c0" stroke-width="1.5"/>`)
    L.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="#1565c0"/>`)
    L.push(`<text x="${cx}" y="${cy+20}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#1565c0">Drain</text>`)
    // Drain slope arrows from each side toward center
    ;[0, 90, 180, 270].forEach(a => {
      const d = 22
      L.push(arrow(cx + Math.cos(a*Math.PI/180)*d, cy + Math.sin(a*Math.PI/180)*d, a + 180))
    })
    L.push(`<text x="${px(ox+bw/2)}" y="${px(oy)-6}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" fill="#546e7a" font-weight="600">FLAT ROOF</text>`)
  }

  // ── GABLE ────────────────────────────────────────────────────────────────
  else if (shape === 'gable') {
    const ridgeAlongX = gableAxis === 'EW'   // ridge runs left-right = slope goes N/S
    const ex1 = ox - o, ey1 = oy - o, ex2 = ox + bw + o, ey2 = oy + bd + o

    if (ridgeAlongX) {
      const ry = oy + bd / 2
      // Two faces
      L.push(`<rect x="${px(ex1)}" y="${px(ey1)}" width="${(bw+2*o)*SCALE}" height="${(bd/2+o)*SCALE}" fill="#dbd5cc" opacity="0.5"/>`)
      L.push(`<rect x="${px(ex1)}" y="${px(ry)}"  width="${(bw+2*o)*SCALE}" height="${(bd/2+o)*SCALE}" fill="#c8c0b4" opacity="0.5"/>`)
      // Eave outline
      L.push(`<rect x="${px(ex1)}" y="${px(ey1)}" width="${(bw+2*o)*SCALE}" height="${(bd+2*o)*SCALE}" fill="none" stroke="#333333" stroke-width="2"/>`)
      // Ridge
      L.push(`<line x1="${px(ex1)}" y1="${px(ry)}" x2="${px(ex2)}" y2="${px(ry)}" stroke="#1565c0" stroke-width="2.5"/>`)
      L.push(`<text x="${px(ox+bw/2)}" y="${px(ry)-4}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#1565c0" font-weight="700">RIDGE</text>`)
      // Slope arrows (270=north, 90=south in SVG)
      L.push(arrowGrid(ex1+0.3, ey1+0.3, ex2-0.3, ry-0.3, 270))
      L.push(arrowGrid(ex1+0.3, ry+0.3,  ex2-0.3, ey2-0.3, 90))
      const h = (bd/2 * Math.tan(deg2rad(pitch))).toFixed(1)
      L.push(`<text x="${px(ox+0.3)}" y="${px(oy+bd*0.22)}" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#333333">${pitch}°  h=${h}m</text>`)
    } else {
      const rx = ox + bw / 2
      L.push(`<rect x="${px(ex1)}" y="${px(ey1)}" width="${(bw/2+o)*SCALE}" height="${(bd+2*o)*SCALE}" fill="#dbd5cc" opacity="0.5"/>`)
      L.push(`<rect x="${px(rx)}"  y="${px(ey1)}" width="${(bw/2+o)*SCALE}" height="${(bd+2*o)*SCALE}" fill="#c8c0b4" opacity="0.5"/>`)
      L.push(`<rect x="${px(ex1)}" y="${px(ey1)}" width="${(bw+2*o)*SCALE}" height="${(bd+2*o)*SCALE}" fill="none" stroke="#333333" stroke-width="2"/>`)
      L.push(`<line x1="${px(rx)}" y1="${px(ey1)}" x2="${px(rx)}" y2="${px(ey2)}" stroke="#1565c0" stroke-width="2.5"/>`)
      L.push(`<text x="${px(rx)+5}" y="${px(oy+bd*0.38)}" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#1565c0" font-weight="700" transform="rotate(90 ${px(rx)+5} ${px(oy+bd*0.38)})">RIDGE</text>`)
      L.push(arrowGrid(ex1+0.3, ey1+0.3, rx-0.3, ey2-0.3, 180))
      L.push(arrowGrid(rx+0.3,  ey1+0.3, ex2-0.3, ey2-0.3, 0))
      const h = (bw/2 * Math.tan(deg2rad(pitch))).toFixed(1)
      L.push(`<text x="${px(ox+0.3)}" y="${px(oy+bd*0.5)}" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#333333">${pitch}°  h=${h}m</text>`)
    }
  }

  // ── HIP ──────────────────────────────────────────────────────────────────
  else if (shape === 'hip') {
    const ex1 = ox - o, ey1 = oy - o, ex2 = ox + bw + o, ey2 = oy + bd + o
    const eW = bw + 2*o, eD = bd + 2*o

    L.push(`<rect x="${px(ex1)}" y="${px(ey1)}" width="${eW*SCALE}" height="${eD*SCALE}" fill="#dbd5cc" opacity="0.3" stroke="#333333" stroke-width="2"/>`)

    if (eW >= eD) {
      // Ridge runs E-W
      const hd = eD / 2
      const rx1 = ex1 + hd, rx2 = ex2 - hd, ry = ey1 + hd
      if (rx2 > rx1) {
        L.push(`<line x1="${px(rx1)}" y1="${px(ry)}" x2="${px(rx2)}" y2="${px(ry)}" stroke="#1565c0" stroke-width="2.5"/>`)
        L.push(`<text x="${px((rx1+rx2)/2)}" y="${px(ry)-4}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#1565c0" font-weight="700">RIDGE</text>`)
      } else {
        // Near-square: treat as single apex
        const ax = (ex1+ex2)/2, ay = (ey1+ey2)/2
        L.push(`<circle cx="${px(ax)}" cy="${px(ay)}" r="4" fill="#1565c0" stroke="white" stroke-width="1"/>`)
      }
      // Hip lines NW, NE, SW, SE
      L.push(`<line x1="${px(ex1)}" y1="${px(ey1)}" x2="${px(rx1)}"              y2="${px(ry)}" stroke="#546e7a" stroke-width="1.5"/>`)
      L.push(`<line x1="${px(ex2)}" y1="${px(ey1)}" x2="${px(Math.max(rx1,rx2))}" y2="${px(ry)}" stroke="#546e7a" stroke-width="1.5"/>`)
      L.push(`<line x1="${px(ex1)}" y1="${px(ey2)}" x2="${px(rx1)}"              y2="${px(ry)}" stroke="#546e7a" stroke-width="1.5"/>`)
      L.push(`<line x1="${px(ex2)}" y1="${px(ey2)}" x2="${px(Math.max(rx1,rx2))}" y2="${px(ry)}" stroke="#546e7a" stroke-width="1.5"/>`)
      // Arrows on each face
      L.push(arrowGrid(ex1+0.3, ey1+0.3, ex2-0.3, ry-0.3, 270))
      L.push(arrowGrid(ex1+0.3, ry+0.3,  ex2-0.3, ey2-0.3, 90))
      if (rx1 > ex1 + 0.5) L.push(arrowGrid(ex1+0.3, ey1+0.3, rx1-0.3, ey2-0.3, 180))
      if (rx2 < ex2 - 0.5) L.push(arrowGrid(Math.max(rx1,rx2)+0.3, ey1+0.3, ex2-0.3, ey2-0.3, 0))
    } else {
      // Ridge runs N-S
      const hw = eW / 2
      const ry1 = ey1 + hw, ry2 = ey2 - hw, rx = ex1 + hw
      if (ry2 > ry1) {
        L.push(`<line x1="${px(rx)}" y1="${px(ry1)}" x2="${px(rx)}" y2="${px(ry2)}" stroke="#1565c0" stroke-width="2.5"/>`)
      }
      L.push(`<line x1="${px(ex1)}" y1="${px(ey1)}" x2="${px(rx)}" y2="${px(ry1)}" stroke="#546e7a" stroke-width="1.5"/>`)
      L.push(`<line x1="${px(ex2)}" y1="${px(ey1)}" x2="${px(rx)}" y2="${px(ry1)}" stroke="#546e7a" stroke-width="1.5"/>`)
      L.push(`<line x1="${px(ex1)}" y1="${px(ey2)}" x2="${px(rx)}" y2="${px(ry2)}" stroke="#546e7a" stroke-width="1.5"/>`)
      L.push(`<line x1="${px(ex2)}" y1="${px(ey2)}" x2="${px(rx)}" y2="${px(ry2)}" stroke="#546e7a" stroke-width="1.5"/>`)
      L.push(arrowGrid(ex1+0.3, ey1+0.3, rx-0.3, ey2-0.3, 180))
      L.push(arrowGrid(rx+0.3,  ey1+0.3, ex2-0.3, ey2-0.3, 0))
      if (ry1 > ey1 + 0.5) L.push(arrowGrid(ex1+0.3, ey1+0.3, ex2-0.3, ry1-0.3, 270))
      if (ry2 < ey2 - 0.5) L.push(arrowGrid(ex1+0.3, Math.max(ry1,ry2)+0.3, ex2-0.3, ey2-0.3, 90))
    }
    const h = (Math.min(eW, eD) / 2 * Math.tan(deg2rad(pitch))).toFixed(1)
    L.push(`<text x="${px(ox+0.3)}" y="${px(oy+bd*0.88)}" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#333333">${pitch}°  h=${h}m</text>`)
  }

  // ── SHED ─────────────────────────────────────────────────────────────────
  else if (shape === 'shed') {
    const ex1 = ox - o, ey1 = oy - o, ex2 = ox + bw + o, ey2 = oy + bd + o
    L.push(`<rect x="${px(ex1)}" y="${px(ey1)}" width="${(bw+2*o)*SCALE}" height="${(bd+2*o)*SCALE}" fill="#dbd5cc" opacity="0.4" stroke="#333333" stroke-width="2"/>`)

    // High edge + slope angles
    type EdgeDef = { x1: number; y1: number; x2: number; y2: number; ang: number }
    const edges: Record<string, EdgeDef> = {
      N: { x1: ex1, y1: ey1, x2: ex2, y2: ey1, ang: 90  },
      S: { x1: ex1, y1: ey2, x2: ex2, y2: ey2, ang: 270 },
      E: { x1: ex2, y1: ey1, x2: ex2, y2: ey2, ang: 180 },
      W: { x1: ex1, y1: ey1, x2: ex1, y2: ey2, ang: 0   },
    }
    const { x1: hx1, y1: hy1, x2: hx2, y2: hy2, ang } = edges[shedHighEdge]
    L.push(`<line x1="${px(hx1)}" y1="${px(hy1)}" x2="${px(hx2)}" y2="${px(hy2)}" stroke="#1565c0" stroke-width="3"/>`)
    L.push(`<text x="${px((hx1+hx2)/2)}" y="${px((hy1+hy2)/2)-6}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#1565c0">HIGH EDGE</text>`)
    L.push(arrowGrid(ex1+0.3, ey1+0.3, ex2-0.3, ey2-0.3, ang))
    const pct = Math.round(Math.tan(deg2rad(pitch)) * 100)
    L.push(`<text x="${px(ox+bw/2)}" y="${px(oy+bd/2)}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="9" fill="#333333" font-weight="600">${pitch}°  (${pct}%)</text>`)
  }

  // ── PYRAMID ──────────────────────────────────────────────────────────────
  else if (shape === 'pyramid') {
    const ex1 = ox - o, ey1 = oy - o, ex2 = ox + bw + o, ey2 = oy + bd + o
    const ax = (ex1 + ex2) / 2, ay = (ey1 + ey2) / 2
    // Four shaded faces (N lighter, S darker, W/E mid)
    L.push(`<polygon points="${px(ex1)},${px(ey1)} ${px(ex2)},${px(ey1)} ${px(ax)},${px(ay)}" fill="#c8c0b4" opacity="0.55"/>`)
    L.push(`<polygon points="${px(ex2)},${px(ey1)} ${px(ex2)},${px(ey2)} ${px(ax)},${px(ay)}" fill="#90a4ae" opacity="0.55"/>`)
    L.push(`<polygon points="${px(ex1)},${px(ey2)} ${px(ex2)},${px(ey2)} ${px(ax)},${px(ay)}" fill="#667788" opacity="0.55"/>`)
    L.push(`<polygon points="${px(ex1)},${px(ey1)} ${px(ex1)},${px(ey2)} ${px(ax)},${px(ay)}" fill="#dbd5cc" opacity="0.55"/>`)
    // Eave outline
    L.push(`<rect x="${px(ex1)}" y="${px(ey1)}" width="${(bw+2*o)*SCALE}" height="${(bd+2*o)*SCALE}" fill="none" stroke="#333333" stroke-width="2"/>`)
    // Hip lines to apex
    L.push(`<line x1="${px(ex1)}" y1="${px(ey1)}" x2="${px(ax)}" y2="${px(ay)}" stroke="#546e7a" stroke-width="1.5"/>`)
    L.push(`<line x1="${px(ex2)}" y1="${px(ey1)}" x2="${px(ax)}" y2="${px(ay)}" stroke="#546e7a" stroke-width="1.5"/>`)
    L.push(`<line x1="${px(ex1)}" y1="${px(ey2)}" x2="${px(ax)}" y2="${px(ay)}" stroke="#546e7a" stroke-width="1.5"/>`)
    L.push(`<line x1="${px(ex2)}" y1="${px(ey2)}" x2="${px(ax)}" y2="${px(ay)}" stroke="#546e7a" stroke-width="1.5"/>`)
    // Apex marker
    L.push(`<circle cx="${px(ax)}" cy="${px(ay)}" r="4.5" fill="#1565c0" stroke="white" stroke-width="1.5"/>`)
    L.push(`<text x="${px(ax)}" y="${px(ay)-8}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="7" fill="#1565c0" font-weight="700">APEX</text>`)
    // Slope arrows — point away from apex toward each corner (NW=225°, NE=315°, SW=135°, SE=45°)
    L.push(arrowGrid(ex1+0.3, ey1+0.3, ax-0.3, ay-0.3, 225))
    L.push(arrowGrid(ax+0.3,  ey1+0.3, ex2-0.3, ay-0.3, 315))
    L.push(arrowGrid(ex1+0.3, ay+0.3,  ax-0.3, ey2-0.3, 135))
    L.push(arrowGrid(ax+0.3,  ay+0.3,  ex2-0.3, ey2-0.3, 45))
    const h = (Math.min(bw+2*o, bd+2*o) / 2 * Math.tan(deg2rad(pitch))).toFixed(1)
    L.push(`<text x="${px(ex1+0.2)}" y="${px(ey2)-4}" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#333333">${pitch}°  h=${h}m</text>`)
  }

  // Building footprint overlay (dashed, on top of roof fill)
  L.push(`<rect x="${px(ox)}" y="${px(oy)}" width="${bw*SCALE}" height="${bd*SCALE}" fill="none" stroke="#333333" stroke-width="1.5" stroke-dasharray="6,3"/>`)

  // Dimension annotations (same positions as svg_renderer.py)
  L.push(dimH(0, siteW, 10))          // overall site width
  L.push(dimV(0, siteH, 10))          // overall site depth
  L.push(dimH(ox, ox + bw, 23))       // building width
  L.push(dimV(oy, oy + bd, 23))       // building depth

  // Title block (outside the translate group — appended after </g>)
  const shapeLabel = SHAPES.find(s => s.id === shape)?.label ?? shape
  const pitchStr   = shape !== 'flat' ? `  ·  PITCH ${cfg.pitch}°  ·  OVERHANG ${o.toFixed(1)}m` : ''
  L.push('</g>')

  // Title block line
  const tbY = totalH - 50
  L.push(`<line x1="0" y1="${tbY}" x2="${totalW}" y2="${tbY}" stroke="#333333" stroke-width="1.2"/>`)
  L.push(`<line x1="${totalW*0.65}" y1="${tbY}" x2="${totalW*0.65}" y2="${totalH}" stroke="#cccccc" stroke-width="0.8"/>`)
  L.push(`<text x="14" y="${tbY+17}" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="#111111" font-weight="700" letter-spacing="1">AI-DRIVEN BIM GENERATION</text>`)
  L.push(`<text x="14" y="${tbY+30}" font-family="Arial,Helvetica,sans-serif" font-size="9" fill="#444444">ROOF PLAN — ${shapeLabel.toUpperCase()}${pitchStr}</text>`)
  L.push(`<text x="14" y="${tbY+43}" font-family="Arial,Helvetica,sans-serif" font-size="7.5" fill="#888888">SITE ${siteW}m × ${siteH}m  ·  GENERATED BY AI</text>`)
  L.push(`<text x="${totalW-14}" y="${tbY+20}" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="#111111" font-weight="700">ROOF PLAN</text>`)
  L.push(`<text x="${totalW-14}" y="${tbY+35}" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#777777">ARCHITECTURAL</text>`)
  L.push(`<text x="${totalW-14}" y="${tbY+47}" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="8" fill="#aaaaaa">NTS</text>`)

  L.push('</svg>')
  return L.join('\n')
}

// ── React component ──────────────────────────────────────────────────────────
export default function RoofPlanViewer({ result, config: cfg, onConfigChange }: Props) {
  const set = (p: Partial<RoofConfig>) => onConfigChange({ ...cfg, ...p })

  const { site_width: siteW, site_depth: siteH } = result.requirements
  const svg = buildRoofSVG(siteW, siteH, cfg)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Roof Plan</h2>

      {/* Shape selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {SHAPES.map(({ id, label, icon }) => (
          <button key={id} onClick={() => set({ shape: id })}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
              cfg.shape === id
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* Parameter controls */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4 p-3 bg-slate-50 rounded-xl">

        {/* Pitch */}
        {cfg.shape !== 'flat' && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">Pitch</span>
              <span className="font-mono text-blue-600 font-semibold">{cfg.pitch}°</span>
            </div>
            <input type="range" min={5} max={60} step={1} value={cfg.pitch}
              onChange={e => set({ pitch: +e.target.value })}
              className="w-full accent-blue-600 h-1.5"/>
            <div className="flex justify-between text-xs text-slate-300"><span>5°</span><span>60°</span></div>
          </div>
        )}

        {/* Overhang */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 font-medium">Overhang</span>
            <span className="font-mono text-blue-600 font-semibold">{cfg.overhang.toFixed(1)} m</span>
          </div>
          <input type="range" min={3} max={15} step={1} value={Math.round(cfg.overhang * 10)}
            onChange={e => set({ overhang: +e.target.value / 10 })}
            className="w-full accent-blue-600 h-1.5"/>
          <div className="flex justify-between text-xs text-slate-300"><span>0.3m</span><span>1.5m</span></div>
        </div>

        {/* Gable: ridge axis */}
        {cfg.shape === 'gable' && (
          <div className="space-y-1.5">
            <span className="text-xs text-slate-500 font-medium">Ridge Direction</span>
            <div className="flex gap-2">
              {(['EW', 'NS'] as const).map(axis => (
                <button key={axis} onClick={() => set({ gableAxis: axis })}
                  className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-all ${
                    cfg.gableAxis === axis
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {axis === 'EW' ? '← E – W →' : '↕ N – S'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shed: high edge */}
        {cfg.shape === 'shed' && (
          <div className="space-y-1.5">
            <span className="text-xs text-slate-500 font-medium">High Edge</span>
            <div className="flex gap-1.5">
              {(['N', 'S', 'E', 'W'] as const).map(edge => (
                <button key={edge} onClick={() => set({ shedHighEdge: edge })}
                  className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-all ${
                    cfg.shedHighEdge === edge
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {edge}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SVG display */}
      <div className="overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
        <div dangerouslySetInnerHTML={{ __html: svg }} className="min-w-max"/>
      </div>
    </div>
  )
}
