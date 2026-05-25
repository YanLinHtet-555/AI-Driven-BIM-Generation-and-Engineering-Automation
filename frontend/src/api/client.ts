import type { GenerationResponse, ModelEditRequest } from '../types/api'

const BASE = '/api/v1'

export async function generateBuilding(prompt: string): Promise<GenerationResponse> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function ifcDownloadUrl(modelId: string): string {
  return `${BASE}/models/${modelId}/ifc`
}

export function qtoDownloadUrl(modelId: string): string {
  return `${BASE}/models/${modelId}/qto`
}

export function floorplanUrl(modelId: string, floor = 0): string {
  return `${BASE}/models/${modelId}/floorplan?floor=${floor}`
}

export async function optimizeModel(modelId: string): Promise<GenerationResponse> {
  const res = await fetch(`${BASE}/models/${modelId}/optimize`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Optimization failed' }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function patchModel(modelId: string, edit: ModelEditRequest): Promise<GenerationResponse> {
  const res = await fetch(`${BASE}/models/${modelId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(edit),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Update failed' }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}
