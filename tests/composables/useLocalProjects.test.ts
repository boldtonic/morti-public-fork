import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { AuthUser, LocalProjectRow } from '~~/shared/domain/types'

const idb = vi.hoisted(() => ({
  projects: new Map<string, LocalProjectRow>(),
}))

vi.mock('~~/shared/idb/morti-db', () => ({
  STORES: {
    projects: 'projects',
    designState: 'designState',
    designUpdates: 'designUpdates',
    designSeq: 'designSeq',
    projectEditorState: 'projectEditorState',
    designUndoCheckpoints: 'designUndoCheckpoints',
    designUndoState: 'designUndoState',
    publishPreviewVideo: 'publishPreviewVideo',
  },
  idbGetAll: vi.fn(async (store: string) => store === 'projects' ? [...idb.projects.values()] : []),
  idbGet: vi.fn(async (store: string, key: string) => store === 'projects' ? idb.projects.get(key) : undefined),
  idbPut: vi.fn(async (store: string, value: LocalProjectRow) => {
    if (store === 'projects') idb.projects.set(value.id, value)
  }),
  idbDelete: vi.fn(async () => {}),
  idbClearForProject: vi.fn(async () => {}),
}))

function authUser(id: string): AuthUser {
  return {
    id,
    email: `${id}@example.com`,
    verified: true,
    email_validated_at: '2026-01-01T00:00:00.000Z',
    is_admin: false,
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
  }
}

function project(id: string, ownerId?: string): LocalProjectRow {
  return {
    id,
    ownerId,
    name: id,
    cloudId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isDemo: false,
  }
}

describe('useLocalProjects ownership', () => {
  const user = ref<AuthUser | null>(authUser('user-a'))

  beforeEach(() => {
    vi.resetModules()
    idb.projects.clear()
    user.value = authUser('user-a')
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('useAuth', () => ({
      user,
      waitUntilReady: vi.fn(async () => {}),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('claims legacy rows once and filters projects owned by another account', async () => {
    idb.projects.set('legacy', project('legacy'))
    idb.projects.set('owned-a', project('owned-a', 'user-a'))
    idb.projects.set('owned-b', project('owned-b', 'user-b'))

    const { useLocalProjects } = await import('~~/composables/useLocalProjects')
    const local = useLocalProjects()

    expect((await local.listLocalProjects()).map(row => row.id).sort()).toEqual(['legacy', 'owned-a'])
    expect(idb.projects.get('legacy')?.ownerId).toBe('user-a')

    user.value = authUser('user-b')
    expect((await local.listLocalProjects()).map(row => row.id)).toEqual(['owned-b'])
    expect(await local.getLocalProject('legacy')).toBeUndefined()
  })
})
