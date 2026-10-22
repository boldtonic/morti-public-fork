import type * as Y from 'yjs'
import type { LocalProjectRow, ProjectEditorStateRow, PublicStyle } from '~~/shared/domain/types'
import { cryptoRandomId, normalizePublicStyle } from '~~/shared/domain/defaults'
import { createDefaultProjectEditorState } from '~~/shared/domain/editor-state'
import { scopeLocalProjectToOwner } from '~~/shared/domain/local-project-ownership'
import {
  STORES,
  idbClearForProject,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
} from '~~/shared/idb/morti-db'

interface DesignStateRow {
  projectId: string
  update?: Uint8Array
  snapshot?: ArrayBuffer | Uint8Array
  updatedAt?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeRow(name: string, ownerId: string): LocalProjectRow {
  const t = nowIso()
  return {
    id: cryptoRandomId(),
    ownerId,
    name: name.trim() || 'Untitled project',
    cloudId: null,
    createdAt: t,
    updatedAt: t,
    isDemo: false,
    pinned: false,
  }
}

async function writeFreshDesignState(projectId: string): Promise<void> {
  const [Yjs, { ensureInitialized }] = await Promise.all([
    import('yjs'),
    import('~~/shared/yjs/doc'),
  ])
  const doc = new Yjs.Doc()
  ensureInitialized(doc)
  const update = Yjs.encodeStateAsUpdate(doc)
  await idbPut<DesignStateRow>(STORES.designState, { projectId, update, snapshot: update, updatedAt: nowIso() })
}

function stateBytes(state: DesignStateRow | undefined): Uint8Array | null {
  const bytes = state?.update ?? state?.snapshot
  if (!bytes) return null
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
}

export function useLocalProjects() {
  const { user, waitUntilReady } = useAuth()
  const projects = ref<LocalProjectRow[]>([])

  async function currentOwnerId(): Promise<string | null> {
    await waitUntilReady()
    const ownerId = user.value?.id?.trim() ?? ''
    return ownerId.length > 0 ? ownerId : null
  }

  async function requireOwnerId(): Promise<string> {
    const ownerId = await currentOwnerId()
    if (!ownerId) throw new Error('Sign in to access local projects.')
    return ownerId
  }

  async function scopedProject(
    row: LocalProjectRow | undefined,
    ownerId: string,
  ): Promise<LocalProjectRow | undefined> {
    if (!row) return undefined
    const scoped = scopeLocalProjectToOwner(row, ownerId)
    if (!scoped) return undefined
    if (scoped !== row) await idbPut<LocalProjectRow>(STORES.projects, scoped)
    return scoped
  }

  async function listLocalProjects(): Promise<LocalProjectRow[]> {
    const ownerId = await currentOwnerId()
    if (!ownerId) {
      projects.value = []
      return []
    }
    const storedRows = await idbGetAll<LocalProjectRow>(STORES.projects)
    const rows = (await Promise.all(storedRows.map(row => scopedProject(row, ownerId))))
      .filter((row): row is LocalProjectRow => !!row)
    rows.sort((a, b) => {
      const ap = a.pinned ? 1 : 0
      const bp = b.pinned ? 1 : 0
      if (ap !== bp) return bp - ap
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    projects.value = rows
    return rows
  }

  async function getLocalProject(id: string): Promise<LocalProjectRow | undefined> {
    const ownerId = await currentOwnerId()
    if (!ownerId) return undefined
    return await scopedProject(await idbGet<LocalProjectRow>(STORES.projects, id), ownerId)
  }

  async function hasStoredLocalProjectId(id: string): Promise<boolean> {
    return !!await idbGet<LocalProjectRow>(STORES.projects, id)
  }

  async function hasLocalProjectEditorState(id: string): Promise<boolean> {
    if (!await getLocalProject(id)) return false
    return !!await idbGet<ProjectEditorStateRow>(STORES.projectEditorState, id)
  }

  async function createLocalProject(name: string): Promise<LocalProjectRow> {
    const row = makeRow(name, await requireOwnerId())
    await idbPut<LocalProjectRow>(STORES.projects, row)
    await writeFreshDesignState(row.id)
    await listLocalProjects()
    return row
  }

  async function renameLocalProject(id: string, name: string): Promise<LocalProjectRow | undefined> {
    const row = await getLocalProject(id)
    if (!row) return undefined
    const updated: LocalProjectRow = { ...row, name: name.trim() || 'Untitled project', updatedAt: nowIso() }
    await idbPut<LocalProjectRow>(STORES.projects, updated)
    await listLocalProjects()
    return updated
  }

  async function updateLocalProject(id: string, patch: Partial<Pick<LocalProjectRow, 'name' | 'pinned'>>): Promise<LocalProjectRow | undefined> {
    const row = await getLocalProject(id)
    if (!row) return undefined
    const updated: LocalProjectRow = {
      ...row,
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() || 'Untitled project' : row.name,
      pinned: patch.pinned !== undefined ? patch.pinned : row.pinned ?? false,
      updatedAt: nowIso(),
    }
    await idbPut<LocalProjectRow>(STORES.projects, updated)
    await listLocalProjects()
    return updated
  }

  async function setLocalProjectCloudId(id: string, cloudId: string | null): Promise<void> {
    const row = await getLocalProject(id)
    if (!row) return
    const updated: LocalProjectRow = { ...row, cloudId, updatedAt: nowIso() }
    await idbPut<LocalProjectRow>(STORES.projects, updated)
    await listLocalProjects()
  }

  async function setLocalProjectPublicStyle(id: string, publicStyle: PublicStyle | null | undefined): Promise<void> {
    if (!await getLocalProject(id)) throw new Error('Local project is not available for this account.')
    const current = await idbGet<ProjectEditorStateRow>(STORES.projectEditorState, id)
    const editorState: ProjectEditorStateRow = {
      ...createDefaultProjectEditorState(id),
      ...current,
      id,
      projectId: id,
      publicStyle: normalizePublicStyle(publicStyle),
    }
    await idbPut<ProjectEditorStateRow>(STORES.projectEditorState, editorState)
  }

  async function deleteLocalProject(id: string): Promise<void> {
    if (!await getLocalProject(id)) return
    await idbDelete(STORES.projects, id)
    await idbClearForProject(id)
    await listLocalProjects()
  }

  async function duplicateLocalProject(id: string, name?: string): Promise<LocalProjectRow | null> {
    const src = await getLocalProject(id)
    if (!src) return null
    const srcState = await idbGet<DesignStateRow>(STORES.designState, id)
    const row = makeRow(name ?? `${src.name} copy`, await requireOwnerId())
    await idbPut<LocalProjectRow>(STORES.projects, row)
    const srcBytes = stateBytes(srcState)
    if (srcBytes) {
      const copy = new Uint8Array(srcBytes.byteLength)
      copy.set(srcBytes)
      await idbPut<DesignStateRow>(STORES.designState, { projectId: row.id, update: copy, snapshot: copy, updatedAt: nowIso() })
    }
    else {
      await writeFreshDesignState(row.id)
    }
    const sourceEditorState = await idbGet<ProjectEditorStateRow>(STORES.projectEditorState, id)
    const editorState = sourceEditorState
      ? {
          ...structuredClone(sourceEditorState),
          id: row.id,
          projectId: row.id,
          selectedModuleIds: [],
          publicStyle: normalizePublicStyle(sourceEditorState.publicStyle),
        }
      : createDefaultProjectEditorState(row.id)
    await idbPut<ProjectEditorStateRow>(STORES.projectEditorState, editorState)
    await listLocalProjects()
    return row
  }

  async function importMortiFile(blob: Blob, name: string): Promise<LocalProjectRow> {
    const [Yjs, { importProjectBundleFromBlob }] = await Promise.all([
      import('yjs'),
      import('~~/shared/yjs/morti-format'),
    ])
    const imported = await importProjectBundleFromBlob(blob)
    const doc = imported.doc
    const update = Yjs.encodeStateAsUpdate(doc)
    doc.destroy()
    const row = makeRow(imported.project.projectName ?? name, await requireOwnerId())
    await idbPut<LocalProjectRow>(STORES.projects, row)
    await idbPut<DesignStateRow>(STORES.designState, { projectId: row.id, update, snapshot: update, updatedAt: nowIso() })
    const editorState = createDefaultProjectEditorState(row.id)
    editorState.publicStyle = normalizePublicStyle(imported.project.publicStyle)
    await idbPut<ProjectEditorStateRow>(STORES.projectEditorState, editorState)
    await listLocalProjects()
    return row
  }

  // Used by `/p/:id` Remix flow: encode an in-memory Y.Doc as a brand-new
  // local project (no envelope round-trip). Returns the new local row.
  async function importDocAsCopy(doc: Y.Doc, name: string, publicStyle?: PublicStyle | null): Promise<LocalProjectRow> {
    const [Yjs, { ensureInitialized }] = await Promise.all([
      import('yjs'),
      import('~~/shared/yjs/doc'),
    ])
    ensureInitialized(doc)
    const update = Yjs.encodeStateAsUpdate(doc)
    const row = makeRow(name, await requireOwnerId())
    await idbPut<LocalProjectRow>(STORES.projects, row)
    await idbPut<DesignStateRow>(STORES.designState, { projectId: row.id, update, snapshot: update, updatedAt: nowIso() })
    const editorState = createDefaultProjectEditorState(row.id)
    editorState.publicStyle = normalizePublicStyle(publicStyle)
    await idbPut<ProjectEditorStateRow>(STORES.projectEditorState, editorState)
    await listLocalProjects()
    return row
  }

  async function exportMortiFile(id: string): Promise<Blob | null> {
    const project = await getLocalProject(id)
    if (!project) return null
    const state = await idbGet<DesignStateRow>(STORES.designState, id)
    const editorState = await idbGet<ProjectEditorStateRow>(STORES.projectEditorState, id)
    const bytes = stateBytes(state)
    if (!bytes) return null
    const [Yjs, { ensureInitialized }, { exportDoc }] = await Promise.all([
      import('yjs'),
      import('~~/shared/yjs/doc'),
      import('~~/shared/yjs/morti-format'),
    ])
    const doc = new Yjs.Doc()
    try {
      Yjs.applyUpdate(doc, bytes)
      ensureInitialized(doc)
      return exportDoc(doc, {
        projectName: project.name,
        publicStyle: normalizePublicStyle(editorState?.publicStyle),
      })
    }
    finally {
      doc.destroy()
    }
  }

  async function getDesignSnapshot(id: string): Promise<Uint8Array | null> {
    if (!await getLocalProject(id)) return null
    const state = await idbGet<DesignStateRow>(STORES.designState, id)
    const bytes = stateBytes(state)
    return bytes ? new Uint8Array(bytes) : null
  }

  async function putDesignSnapshot(id: string, update: Uint8Array): Promise<void> {
    if (!await getLocalProject(id)) throw new Error('Local project is not available for this account.')
    const copy = new Uint8Array(update.byteLength)
    copy.set(update)
    await idbPut<DesignStateRow>(STORES.designState, { projectId: id, update: copy, snapshot: copy, updatedAt: nowIso() })
  }

  return {
    projects,
    listLocalProjects,
    getLocalProject,
    hasStoredLocalProjectId,
    hasLocalProjectEditorState,
    createLocalProject,
    updateLocalProject,
    renameLocalProject,
    setLocalProjectCloudId,
    setLocalProjectPublicStyle,
    deleteLocalProject,
    duplicateLocalProject,
    importMortiFile,
    importDocAsCopy,
    exportMortiFile,
    getDesignSnapshot,
    putDesignSnapshot,
  }
}
