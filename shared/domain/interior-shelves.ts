import type { FurnitureConfig } from '~~/shared/domain/types'

export const DEFAULT_INTERIOR_SHELF_COUNT = 0
export const INTERIOR_SHELF_COUNT_MIN = 0
export const INTERIOR_SHELF_COUNT_MAX = 32

export function normalizeInteriorShelfCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_INTERIOR_SHELF_COUNT
  return Math.max(INTERIOR_SHELF_COUNT_MIN, Math.min(INTERIOR_SHELF_COUNT_MAX, Math.round(value)))
}

export function maxInteriorShelfCountForHeight(height: number, config: FurnitureConfig): number {
  if (!Number.isFinite(height) || height <= 0) return INTERIOR_SHELF_COUNT_MIN
  const panelThickness = Math.max(0, config.panelThickness)
  const minimumOpening = Math.max(0.001, config.minModuleHeight)
  const interiorHeight = Math.max(0, height - panelThickness - 2 * config.panelJointClearance)
  const count = Math.floor((interiorHeight - minimumOpening + 1e-9) / (minimumOpening + panelThickness))
  return normalizeInteriorShelfCount(count)
}

export function clampInteriorShelfCountForHeight(value: unknown, height: number, config: FurnitureConfig): number {
  return Math.min(normalizeInteriorShelfCount(value), maxInteriorShelfCountForHeight(height, config))
}

export function interiorShelfCenterOffsets(
  height: number,
  value: unknown,
  config: FurnitureConfig,
): number[] {
  const count = clampInteriorShelfCountForHeight(value, height, config)
  if (count === 0) return []

  const panelThickness = Math.max(0, config.panelThickness)
  const lowerBound = panelThickness / 2 + config.panelJointClearance
  const upperBound = height - panelThickness / 2 - config.panelJointClearance
  const interiorHeight = Math.max(0, upperBound - lowerBound)
  const openingHeight = Math.max(0, interiorHeight - count * panelThickness) / (count + 1)

  return Array.from({ length: count }, (_, index) =>
    lowerBound + openingHeight * (index + 1) + panelThickness * index + panelThickness / 2,
  )
}
