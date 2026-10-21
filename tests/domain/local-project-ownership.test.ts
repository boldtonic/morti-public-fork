import { describe, expect, it } from 'vitest'
import type { LocalProjectRow } from '~~/shared/domain/types'
import { scopeLocalProjectToOwner } from '~~/shared/domain/local-project-ownership'

function project(ownerId?: string | null): LocalProjectRow {
  return {
    id: 'project-1',
    ownerId,
    name: 'Project',
    cloudId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isDemo: false,
  }
}

describe('local project ownership', () => {
  it('claims a legacy project for the first authenticated owner', () => {
    expect(scopeLocalProjectToOwner(project(), 'user-a')?.ownerId).toBe('user-a')
  })

  it('keeps a project available to its owner', () => {
    const owned = project('user-a')
    expect(scopeLocalProjectToOwner(owned, 'user-a')).toBe(owned)
  })

  it('does not expose a project to another owner or an anonymous session', () => {
    const owned = project('user-a')
    expect(scopeLocalProjectToOwner(owned, 'user-b')).toBeNull()
    expect(scopeLocalProjectToOwner(owned, null)).toBeNull()
  })
})
