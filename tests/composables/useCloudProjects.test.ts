import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { AuthUser, CloudProjectRecord, LocalProjectRow } from '~~/shared/domain/types'
import { normalizePublicStyle } from '~~/shared/domain/defaults'

const mocks = vi.hoisted(() => ({
  idbPut: vi.fn(),
  local: {
    getLocalProject: vi.fn(),
    hasStoredLocalProjectId: vi.fn(),
    hasLocalProjectEditorState: vi.fn(),
    getDesignSnapshot: vi.fn(),
    putDesignSnapshot: vi.fn(),
    setLocalProjectPublicStyle: vi.fn(),
    listLocalProjects: vi.fn(),
  },
}))

vi.mock('~~/shared/idb/morti-db', () => ({
  STORES: { projects: 'projects' },
  idbPut: mocks.idbPut,
}))

function authUser(): AuthUser {
  return {
    id: 'user-a',
    email: 'user-a@example.com',
    verified: true,
    email_validated_at: '2026-01-01T00:00:00.000Z',
    is_admin: false,
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
  }
}

function cloudProject(): CloudProjectRecord {
  return {
    id: 'cloud-1',
    collectionId: 'morti_projects',
    collectionName: 'morti_projects',
    owner: 'user-a',
    name: 'Cloud console',
    visibility: 'private',
    client_project_id: 'local-1',
    is_demo: false,
    remix_count: 0,
    public_style: JSON.stringify(normalizePublicStyle({ renderStyle: 'technical' })),
    snapshot: 'snapshot.bin',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-02T00:00:00.000Z',
  }
}

describe('useCloudProjects product state restoration', () => {
  const user = ref<AuthUser | null>(authUser())
  const isLocalBypass = ref(false)
  const record = cloudProject()

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    user.value = authUser()
    isLocalBypass.value = false
    mocks.local.getLocalProject.mockResolvedValue({
      id: 'local-1',
      ownerId: 'user-a',
      name: 'Local console',
      cloudId: 'cloud-1',
      createdAt: record.created,
      updatedAt: record.created,
      isDemo: false,
    } satisfies LocalProjectRow)
    mocks.local.hasStoredLocalProjectId.mockResolvedValue(false)
    mocks.local.hasLocalProjectEditorState.mockResolvedValue(false)
    mocks.local.getDesignSnapshot.mockResolvedValue(null)
    vi.stubGlobal('useAuth', () => ({ user, isLocalBypass }))
    vi.stubGlobal('useLocalProjects', () => mocks.local)
    vi.stubGlobal('$fetch', vi.fn(async (path: string) => path === '/api/projects' ? [record] : record))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('restores style with geometry during owner cloud reconciliation', async () => {
    const { useCloudProjects } = await import('~~/composables/useCloudProjects')

    await useCloudProjects().reconcileLocalProjectsWithOwnerCloud()

    expect(mocks.local.putDesignSnapshot).toHaveBeenCalledWith('local-1', new Uint8Array([1, 2, 3]))
    expect(mocks.local.setLocalProjectPublicStyle).toHaveBeenCalledWith(
      'local-1',
      normalizePublicStyle({ renderStyle: 'technical' }),
    )
  })

  it('does not replace an existing local style during automatic reconciliation', async () => {
    mocks.local.hasLocalProjectEditorState.mockResolvedValue(true)
    const { useCloudProjects } = await import('~~/composables/useCloudProjects')

    await useCloudProjects().reconcileLocalProjectsWithOwnerCloud()

    expect(mocks.local.putDesignSnapshot).toHaveBeenCalled()
    expect(mocks.local.setLocalProjectPublicStyle).not.toHaveBeenCalled()
  })

  it('restores style with an explicit cloud snapshot download', async () => {
    const { useCloudProjects } = await import('~~/composables/useCloudProjects')

    await useCloudProjects().downloadSnapshotIntoLocal('cloud-1', 'local-1')

    expect(mocks.local.putDesignSnapshot).toHaveBeenCalledWith('local-1', new Uint8Array([1, 2, 3]))
    expect(mocks.local.setLocalProjectPublicStyle).toHaveBeenCalledWith(
      'local-1',
      normalizePublicStyle({ renderStyle: 'technical' }),
    )
  })
})
