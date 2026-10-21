import { moduleHandleHorizontalPosition } from '~~/shared/domain/handles'
import type { FurnitureModule } from '~~/shared/domain/types'

export function horizontalHandleStyle(
  module: FurnitureModule,
  elementWidth: number,
  edgeInset: number,
  offset = 0,
): Record<string, string> {
  const position = moduleHandleHorizontalPosition(module)
  if (position === 'left') return { left: `${edgeInset + offset - elementWidth / 2}px` }
  if (position === 'right') return { right: `${edgeInset - offset - elementWidth / 2}px` }
  return { left: `calc(50% + ${offset - elementWidth / 2}px)` }
}

export function pairedDoorHorizontalStyle(
  module: FurnitureModule,
  side: 'left' | 'right',
  elementWidth: number,
  edgeInset: number,
  pairHalfGap: number,
): Record<string, string> {
  const position = moduleHandleHorizontalPosition(module)
  if (position === 'center') {
    const offset = side === 'left' ? -pairHalfGap : pairHalfGap
    return { left: `calc(50% + ${offset - elementWidth / 2}px)` }
  }

  if (position === 'left') {
    return side === 'left'
      ? { left: `${edgeInset - elementWidth / 2}px` }
      : { left: `calc(50% + ${edgeInset - elementWidth / 2}px)` }
  }
  return side === 'left'
    ? { left: `calc(50% - ${edgeInset + elementWidth / 2}px)` }
    : { left: `calc(100% - ${edgeInset + elementWidth / 2}px)` }
}
