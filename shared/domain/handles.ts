import type { FurnitureModule, HandleFinish, HandleHorizontalPosition, HandleMode, HandlePosition, HandleType, ModuleType, PublicStyle } from './types'

export const HANDLE_FINISH_SPECS: Record<HandleFinish, { color: string, metalness: number, roughness: number }> = {
  graphite: { color: '#34312c', metalness: 0.54, roughness: 0.46 },
  nickel: { color: '#b8babd', metalness: 0.84, roughness: 0.27 },
  brass: { color: '#b18a4b', metalness: 0.76, roughness: 0.33 },
}

export function normalizeHandleMode(value: unknown, legacyEnabled: unknown = undefined): HandleMode {
  if (value === 'none' || value === 'hole' || value === 'handle') return value
  return legacyEnabled === false ? 'none' : 'handle'
}

export function moduleHandleMode(module: FurnitureModule): HandleMode {
  if (module.type === 'shelf') return 'none'
  return normalizeHandleMode(module.handleMode, module.handlesEnabled)
}

export function moduleHasHandleHoles(module: FurnitureModule): boolean {
  return moduleHandleMode(module) !== 'none'
}

export function moduleShowsPhysicalHandle(module: FurnitureModule): boolean {
  return moduleHandleMode(module) === 'handle'
}

export function normalizeHandleHorizontalPosition(value: unknown, moduleType: ModuleType): HandleHorizontalPosition {
  if (value === 'left' || value === 'center' || value === 'right') return value
  if (moduleType === 'left-door') return 'right'
  if (moduleType === 'right-door') return 'left'
  return 'center'
}

export function moduleHandleHorizontalPosition(module: FurnitureModule): HandleHorizontalPosition {
  return normalizeHandleHorizontalPosition(module.handleHorizontalPosition, module.type)
}

export function resolveHandleType(
  module: FurnitureModule,
  style: PublicStyle['rendered']['handles'],
): Exclude<HandleType, 'auto'> {
  if (style.type !== 'auto') return style.type
  return module.type === 'drawer' ? 'bar' : 'knob'
}

export function isKnobHandleType(type: Exclude<HandleType, 'auto'>): boolean {
  return type === 'knob' || type === 'square-knob'
}

export function isSquareHandleType(type: Exclude<HandleType, 'auto'>): boolean {
  return type === 'square-knob' || type === 'square-bar'
}

export function resolveHandleCenter(
  min: number,
  max: number,
  position: HandlePosition = 'top',
): number {
  if (max <= min) return (min + max) / 2
  if (position === 'center') return (min + max) / 2
  return position === 'bottom' ? min : max
}
