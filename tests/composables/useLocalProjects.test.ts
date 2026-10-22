import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as Y from 'yjs'
import type { AuthUser, LocalProjectRow, ProjectEditorStateRow } from '~~/shared/domain/types'
import { normalizePublicStyle } from '~~/shared/domain/defaults'
import { ensureInitialized } from '~~/shared/yjs/doc'
import { exportDoc } from '~~/shared/yjs/morti-format'

const idb = vi.hoisted(() => ({
  projects: new Map<string, LocalProjectRow>(),
  designState: new Map<string, unknown>(),
  projectEditorState: new Map<string, ProjectEditorStateRow>(),
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
  idbGet: vi.fn(async (store: string, key: string) => {
    if (store === 'projects') return idb.projects.get(key)
    if (store === 'designState') return idb.designState.get(key)
    if (store === 'projectEditorState') return idb.projectEditorState.get(key)
    return undefined
  }),
  idbPut: vi.fn(async (store: string, value: Record<string, unknown>) => {
    if (store === 'projects') idb.projects.set(String(value.id), value as unknown as LocalProjectRow)
    if (store === 'designState') idb.designState.set(String(value.projectId), value)
    if (store === 'projectEditorState') {
      idb.projectEditorState.set(String(value.projectId), value as unknown as ProjectEditorStateRow)
    }
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
    idb.designState.clear()
    idb.projectEditorState.clear()
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

  it('imports bundle name and style into the local project state', async () => {
    const doc = new Y.Doc()
    ensureInitialized(doc)
    const publicStyle = normalizePublicStyle({ renderStyle: 'technical' } as Parameters<typeof normalizePublicStyle>[0])
    const blob = exportDoc(doc, { projectName: 'Imported console', publicStyle })
    doc.destroy()

    const { useLocalProjects } = await import('~~/composables/useLocalProjects')
    const row = await useLocalProjects().importMortiFile(blob, 'File name')

    expect(row.name).toBe('Imported console')
    expect(idb.projectEditorState.get(row.id)?.publicStyle).toEqual(publicStyle)
  })

  it('duplicates product style without carrying module selection', async () => {
    const source = project('owned-a', 'user-a')
    idb.projects.set(source.id, source)
    idb.projectEditorState.set(source.id, {
      id: source.id,
      projectId: source.id,
      viewMode: 'style',
      splitRatio: 0.55,
      selectedModuleIds: ['module-1'],
      camera: null,
      assemblyOpenDoorsDrawers: false,
      assemblySpaceModulesView: false,
      moduleVolumeHelpersVisible: false,
      renderMode: 'render-debug',
      publicStyle: normalizePublicStyle({ renderStyle: 'technical' } as Parameters<typeof normalizePublicStyle>[0]),
      cutlistSelectedDrawingKey: null,
    })

    const { useLocalProjects } = await import('~~/composables/useLocalProjects')
    const duplicate = await useLocalProjects().duplicateLocalProject(source.id)

    expect(duplicate).not.toBeNull()
    expect(idb.projectEditorState.get(duplicate!.id)?.publicStyle.renderStyle).toBe('technical')
    expect(idb.projectEditorState.get(duplicate!.id)?.selectedModuleIds).toEqual([])
  })

  it('updates cloud-restored style without discarding existing editor preferences', async () => {
    const source = project('owned-a', 'user-a')
    idb.projects.set(source.id, source)
    idb.projectEditorState.set(source.id, {
      id: source.id,
      projectId: source.id,
      viewMode: 'cutlist',
      splitRatio: 0.63,
      selectedModuleIds: ['module-1'],
      camera: null,
      assemblyOpenDoorsDrawers: true,
      assemblySpaceModulesView: false,
      moduleVolumeHelpersVisible: false,
      renderMode: 'technical',
      publicStyle: normalizePublicStyle(),
      cutlistSelectedDrawingKey: 'panel-1',
    })
    const restoredStyle = normalizePublicStyle({ renderStyle: 'technical' } as Parameters<typeof normalizePublicStyle>[0])

    const { useLocalProjects } = await import('~~/composables/useLocalProjects')
    await useLocalProjects().setLocalProjectPublicStyle(source.id, restoredStyle)

    const stored = idb.projectEditorState.get(source.id)
    expect(stored?.publicStyle).toEqual(restoredStyle)
    expect(stored?.viewMode).toBe('cutlist')
    expect(stored?.splitRatio).toBe(0.63)
    expect(stored?.selectedModuleIds).toEqual(['module-1'])
  })
})
