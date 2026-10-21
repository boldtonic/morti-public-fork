import type { LocalProjectRow } from './types'

function normalizedOwnerId(ownerId: string | null | undefined): string | null {
  const value = ownerId?.trim() ?? ''
  return value.length > 0 ? value : null
}

export function scopeLocalProjectToOwner(
  project: LocalProjectRow,
  ownerId: string | null | undefined,
): LocalProjectRow | null {
  const requestedOwnerId = normalizedOwnerId(ownerId)
  if (!requestedOwnerId) return null

  const existingOwnerId = normalizedOwnerId(project.ownerId)
  if (existingOwnerId && existingOwnerId !== requestedOwnerId) return null
  if (existingOwnerId === requestedOwnerId) return project

  return { ...project, ownerId: requestedOwnerId }
}
