import type { ProjectEditorStateRow } from '~~/shared/domain/types'
import { normalizePublicStyle } from '~~/shared/domain/defaults'
import { createDefaultCameraState, createDefaultProjectEditorState } from '~~/shared/domain/editor-state'
import { STORES, idbGet, idbPut } from '~~/shared/idb/morti-db'

const PERSIST_DEBOUNCE_MS = 450

export async function useEditorState(projectId: string) {
  const loaded = await idbGet<ProjectEditorStateRow>(STORES.projectEditorState, projectId)
  const initial: ProjectEditorStateRow = loaded
    ? { ...createDefaultProjectEditorState(projectId), ...loaded, id: projectId, projectId }
    : createDefaultProjectEditorState(projectId)
  initial.publicStyle = normalizePublicStyle(initial.publicStyle)

  const state = reactive<ProjectEditorStateRow>(initial)

  let timer: ReturnType<typeof setTimeout> | null = null

  async function persistNow(): Promise<void> {
    const snapshot: ProjectEditorStateRow = structuredClone(toRaw(state)) as ProjectEditorStateRow
    snapshot.id = projectId
    snapshot.projectId = projectId
    ;(snapshot as ProjectEditorStateRow & { updatedAt: string }).updatedAt = new Date().toISOString()
    if (snapshot.viewMode !== 'assembly' && snapshot.viewMode !== 'cutlist' && snapshot.viewMode !== 'style') snapshot.viewMode = 'assembly'
    snapshot.camera = snapshot.camera ?? createDefaultCameraState()
    snapshot.renderMode = snapshot.renderMode === 'technical' ? 'technical' : 'render-debug'
    snapshot.publicStyle = normalizePublicStyle(snapshot.publicStyle)
    snapshot.projectDesignerZoomPercent = Number(snapshot.projectDesignerZoomPercent ?? 100)
    snapshot.selectedModuleIds = Array.isArray(snapshot.selectedModuleIds) ? snapshot.selectedModuleIds.map(String) : []
    snapshot.cutlistSelectedDrawingKey = typeof snapshot.cutlistSelectedDrawingKey === 'string' && snapshot.cutlistSelectedDrawingKey.length > 0
      ? snapshot.cutlistSelectedDrawingKey.slice(0, 512)
      : null
    await idbPut<ProjectEditorStateRow>(STORES.projectEditorState, snapshot)
  }

  function schedulePersist() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void persistNow()
    }, PERSIST_DEBOUNCE_MS)
  }

  watch(
    () => JSON.stringify(state),
    () => schedulePersist(),
  )

  function dispose() {
    if (timer) {
      clearTimeout(timer)
      timer = null
      void persistNow()
    }
  }

  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    state,
    persistNow,
    dispose,
  }
}
