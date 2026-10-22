import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import type { CompiledPanel, PanelOperation } from '../domain/types'

const HOLE_MIN_DIAMETER = 5e-4
const PULL_HOLE_DEPTH_PADDING = 1e-6

const GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>()

let evaluatorInstance: Evaluator | null = null

function getEvaluator(): Evaluator {
  if (evaluatorInstance) return evaluatorInstance
  evaluatorInstance = new Evaluator()
  evaluatorInstance.useGroups = false
  return evaluatorInstance
}

function panelGeometryCacheKey(panel: CompiledPanel, operations: PanelOperation[]): string {
  const operationsKey = operations
    .filter(operation => operation.operationType === 'through-hole' && operation.targetPanelKey === panel.key)
    .map(operation => `${(operation.center?.x ?? operation.cx ?? 0).toFixed(6)},${(operation.center?.y ?? operation.cy ?? 0).toFixed(6)},${(operation.diameter ?? 0).toFixed(6)}`)
    .sort()
    .join(';')
  return [
    panel.role,
    panel.width.toFixed(6),
    panel.height.toFixed(6),
    panel.thickness.toFixed(6),
    operationsKey,
  ].join('|')
}

/** Build display geometry and subtract through holes from the compiled panel. */
export function compilePartGeometry(
  panel: CompiledPanel,
  operations: PanelOperation[],
): THREE.BufferGeometry {
  const key = panelGeometryCacheKey(panel, operations)
  const cached = GEOMETRY_CACHE.get(key)
  if (cached) return cached.clone()

  const width = Math.max(0.001, panel.width)
  const height = Math.max(0.001, panel.height)
  const thickness = Math.max(0.001, panel.thickness)
  const box = new THREE.BoxGeometry(width, height, thickness)
  let accumulatedBrush = new Brush(box)
  accumulatedBrush.updateMatrixWorld()

  const evaluator = getEvaluator()
  const holes = operations.filter(operation =>
    operation.operationType === 'through-hole'
    && operation.targetPanelKey === panel.key
    && (operation.diameter ?? 0) > 0,
  )

  if (holes.length > 0) {
    const cylinderHeight = thickness * 1.35 + PULL_HOLE_DEPTH_PADDING * 2
    for (const operation of holes) {
      const radius = Math.max(HOLE_MIN_DIAMETER / 2, (operation.diameter ?? 0) / 2)
      const cylinder = new THREE.CylinderGeometry(radius, radius, cylinderHeight, 32)
      cylinder.rotateX(Math.PI / 2)
      cylinder.translate(operation.center?.x ?? operation.cx ?? 0, operation.center?.y ?? operation.cy ?? 0, 0)
      const cutBrush = new Brush(cylinder)
      cutBrush.updateMatrixWorld()
      accumulatedBrush = evaluator.evaluate(accumulatedBrush, cutBrush, SUBTRACTION) as Brush
      cylinder.dispose()
    }
  }

  const result = accumulatedBrush.geometry.clone()
  GEOMETRY_CACHE.set(key, result)
  return result.clone()
}

export function clearPanelGeometryCache(): void {
  for (const geometry of GEOMETRY_CACHE.values()) geometry.dispose()
  GEOMETRY_CACHE.clear()
}
