import * as Y from 'yjs'
import type { Ref } from 'vue'
import type { LocalProjectRow } from '~~/shared/domain/types'
import { getProjectFingerprint } from '~~/shared/domain/fingerprint'
import { readFurnitureDoc } from '~~/shared/yjs/doc'

const AUTOSYNC_DEBOUNCE_MS = 1500

// Cache uploads by their actual cloud destination. A local project can be
// opened by different users, and each user can resolve it to a different
// cloud record.
const lastUploadedByCloudTarget: Map<string, string> = new Map()
type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

interface UseCloudAutosyncArgs {
  projectId: string
  doc: Y.Doc
  project: Ref<LocalProjectRow | null>
}

export function useCloudAutosync({ projectId, doc, project }: UseCloudAutosyncArgs) {
  const { user, isCloudAuthed } = useAuth()
  const { ensureCloudProject, fetchSnapshotBytes, uploadSnapshotBytes } = useCloudProjects()
  const { putDesignSnapshot, setLocalProjectCloudId } = useLocalProjects()
  const syncStatus = ref<SyncStatus>('idle')
  const lastSyncError = ref<string | null>(null)
  const cloudIdentity = computed(() => isCloudAuthed.value ? user.value?.id ?? null : null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let syncChain = Promise.resolve()
  let identityRevision = 0
  let mergedCloudTarget: string | null = null
  let stopIdentityWatch: (() => void) | null = null

  function cloudTargetKey(userId: string, recordId: string): string {
    return JSON.stringify([userId, recordId, projectId])
  }

  function isCurrentIdentity(userId: string, revision: number): boolean {
    return !disposed
      && identityRevision === revision
      && cloudIdentity.value === userId
  }

  async function runSync(): Promise<void> {
    if (disposed) return
    const userId = cloudIdentity.value
    const revision = identityRevision
    if (!userId) {
      syncStatus.value = 'idle'
      lastSyncError.value = null
      return
    }
    if (import.meta.client && !navigator.onLine) {
      syncStatus.value = 'offline'
      lastSyncError.value = null
      return
    }
    const currentProject = project.value
    if (!currentProject || currentProject.id !== projectId) {
      syncStatus.value = 'idle'
      lastSyncError.value = null
      return
    }
    if (currentProject.ownerId !== userId) {
      syncStatus.value = 'idle'
      lastSyncError.value = null
      return
    }

    syncStatus.value = 'syncing'
    lastSyncError.value = null
    try {
      const record = await ensureCloudProject(currentProject)
      if (!isCurrentIdentity(userId, revision)) return

      const targetKey = cloudTargetKey(userId, record.id)
      await setLocalProjectCloudId(projectId, record.id)
      if (!isCurrentIdentity(userId, revision)) return

      if (mergedCloudTarget !== targetKey) {
        const remote = await fetchSnapshotBytes(record)
        if (!isCurrentIdentity(userId, revision)) return
        if (remote && remote.byteLength > 0) {
          Y.applyUpdate(doc, remote)
          const merged = Y.encodeStateAsUpdate(doc)
          await putDesignSnapshot(projectId, merged)
          if (!isCurrentIdentity(userId, revision)) return
        }
        mergedCloudTarget = targetKey
      }
      const snapshot = readFurnitureDoc(doc)
      const fp = getProjectFingerprint({ columns: snapshot.columns, config: snapshot.config })
      if (lastUploadedByCloudTarget.get(targetKey) === fp) {
        syncStatus.value = 'synced'
        return
      }
      const update = Y.encodeStateAsUpdate(doc)
      await uploadSnapshotBytes(record.id, projectId, update)
      if (!isCurrentIdentity(userId, revision)) return
      lastUploadedByCloudTarget.set(targetKey, fp)
      syncStatus.value = 'synced'
    }
    catch (err: unknown) {
      if (!isCurrentIdentity(userId, revision)) return
      syncStatus.value = 'error'
      lastSyncError.value = (err as { message?: string } | null)?.message ?? 'Sync failed'
    }
  }

  async function syncNow(): Promise<void> {
    if (disposed) return
    syncChain = syncChain.then(runSync, runSync)
    return syncChain
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void syncNow()
    }, AUTOSYNC_DEBOUNCE_MS)
  }

  function onUpdate() {
    schedule()
  }

  doc.on('update', onUpdate)

  function dispose() {
    if (disposed) return
    disposed = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    stopIdentityWatch?.()
    stopIdentityWatch = null
    doc.off('update', onUpdate)
    if (import.meta.client) {
      window.removeEventListener('online', retrySync)
      window.removeEventListener('focus', retrySync)
    }
  }

  function retrySync() {
    if (!disposed) void syncNow()
  }

  if (import.meta.client) {
    window.addEventListener('online', retrySync)
    window.addEventListener('focus', retrySync)
  }

  stopIdentityWatch = watch(
    cloudIdentity,
    (nextIdentity) => {
      identityRevision += 1
      mergedCloudTarget = null
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      syncStatus.value = 'idle'
      lastSyncError.value = null
      if (nextIdentity) void syncNow()
    },
    { immediate: true, flush: 'sync' },
  )

  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    syncStatus,
    lastSyncError,
    retrySync,
    syncNow,
    dispose,
  }
}
