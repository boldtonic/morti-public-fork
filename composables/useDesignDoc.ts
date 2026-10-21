import * as Y from 'yjs'
import { computed, ref } from 'vue'
import type { FurnitureDoc } from '~~/shared/domain/types'
import { ensureInitialized, getFurnitureMap, readFurnitureDoc } from '~~/shared/yjs/doc'
import { STORES, idbBoundedRange, idbGet, idbPut } from '~~/shared/idb/morti-db'

interface DesignStateRow {
  projectId: string
  update?: Uint8Array
  snapshot?: ArrayBuffer | Uint8Array
  updatedAt?: string
}

export interface DesignCheckpointRow {
  projectId: string
  seq: number
  createdAt: number
  snapshot: ArrayBuffer | Uint8Array
}

export interface DesignDocRecoveryInfo {
  source: 'checkpoint'
  checkpointSeq: number
  checkpointCreatedAt: number
  skippedNewerCheckpoints: number
}

export interface DesignDocLoadResult {
  doc: Y.Doc
  recovery: DesignDocRecoveryInfo | null
}

export class DesignDocLoadError extends Error {
  readonly code = 'DESIGN_UPDATE_CORRUPT'
  readonly projectId: string
  readonly originalUpdateBytes: Uint8Array
  readonly attemptedCheckpointCount: number

  constructor(
    projectId: string,
    originalUpdateBytes: Uint8Array,
    attemptedCheckpointCount: number,
    cause?: unknown,
  ) {
    super(
      attemptedCheckpointCount > 0
        ? `No se pudo abrir el proyecto ${projectId}: la copia principal y ${attemptedCheckpointCount} checkpoints estan corruptos.`
        : `No se pudo abrir el proyecto ${projectId}: la copia principal esta corrupta y no hay checkpoints validos.`,
      { cause },
    )
    this.name = 'DesignDocLoadError'
    this.projectId = projectId
    this.originalUpdateBytes = new Uint8Array(originalUpdateBytes)
    this.attemptedCheckpointCount = attemptedCheckpointCount
  }
}

const SNAPSHOT_DEBOUNCE_MS = 400
const CHECKPOINT_DEBOUNCE_MS = 220
const CHECKPOINT_CAP = 100

function asBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value.slice(0))
}

function createDocFromUpdate(update: ArrayBuffer | Uint8Array): Y.Doc {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, asBytes(update))
    ensureInitialized(doc)
    readFurnitureDoc(doc)
    return doc
  }
  catch (error) {
    doc.destroy()
    throw error
  }
}

export function loadDesignDocFromUpdates(
  projectId: string,
  originalUpdate: ArrayBuffer | Uint8Array,
  checkpoints: DesignCheckpointRow[],
): DesignDocLoadResult {
  const originalUpdateBytes = asBytes(originalUpdate)
  try {
    return { doc: createDocFromUpdate(originalUpdateBytes), recovery: null }
  }
  catch (primaryError) {
    const newestFirst = checkpoints
      .filter(checkpoint => checkpoint.projectId === projectId)
      .sort((a, b) => b.seq - a.seq || b.createdAt - a.createdAt)
    let lastError: unknown = primaryError

    for (let index = 0; index < newestFirst.length; index++) {
      const checkpoint = newestFirst[index]!
      try {
        return {
          doc: createDocFromUpdate(checkpoint.snapshot),
          recovery: {
            source: 'checkpoint',
            checkpointSeq: checkpoint.seq,
            checkpointCreatedAt: checkpoint.createdAt,
            skippedNewerCheckpoints: index,
          },
        }
      }
      catch (error) {
        lastError = error
      }
    }

    throw new DesignDocLoadError(projectId, originalUpdateBytes, newestFirst.length, lastError)
  }
}

function debounce(fn: () => void, ms: number): { call: () => void, flush: () => void, cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | null = null
  return {
    call() {
      if (t) clearTimeout(t)
      t = setTimeout(() => {
        t = null
        fn()
      }, ms)
    },
    flush() {
      if (t) {
        clearTimeout(t)
        t = null
        fn()
      }
    },
    cancel() {
      if (t) {
        clearTimeout(t)
        t = null
      }
    },
  }
}

export async function useDesignDoc(projectId: string) {
  const existing = await idbGet<DesignStateRow>(STORES.designState, projectId)
  const existingBytes = existing?.update ?? existing?.snapshot
  let loadResult: DesignDocLoadResult

  if (existingBytes) {
    try {
      loadResult = loadDesignDocFromUpdates(projectId, existingBytes, [])
    }
    catch (error) {
      if (!(error instanceof DesignDocLoadError)) throw error
      const range = IDBKeyRange.bound([projectId, -Infinity], [projectId, Infinity])
      const checkpoints = await idbBoundedRange<DesignCheckpointRow>(STORES.designUndoCheckpoints, range)
      loadResult = loadDesignDocFromUpdates(projectId, existingBytes, checkpoints)
    }
  }
  else {
    const doc = new Y.Doc()
    ensureInitialized(doc)
    loadResult = { doc, recovery: null }
  }

  const { doc, recovery } = loadResult

  if (recovery) {
    const recoveredUpdate = Y.encodeStateAsUpdate(doc)
    try {
      await idbPut<DesignStateRow>(STORES.designState, {
        projectId,
        update: recoveredUpdate,
        snapshot: recoveredUpdate,
        updatedAt: new Date().toISOString(),
      })
    }
    catch (error) {
      doc.destroy()
      throw error
    }
  }

  const furnitureMap = getFurnitureMap(doc)
  const undoManager = new Y.UndoManager(furnitureMap, {
    captureTimeout: 250,
    trackedOrigins: new Set<unknown>([null, undefined]),
  })

  const state = ref<FurnitureDoc>(readFurnitureDoc(doc))
  const canUndo = ref<boolean>(undoManager.undoStack.length > 0)
  const canRedo = ref<boolean>(undoManager.redoStack.length > 0)

  function refreshState() {
    state.value = readFurnitureDoc(doc)
  }

  function refreshUndoFlags() {
    canUndo.value = undoManager.undoStack.length > 0
    canRedo.value = undoManager.redoStack.length > 0
  }

  // ---------- Persistence ----------
  async function persistSnapshot() {
    const update = Y.encodeStateAsUpdate(doc)
    await idbPut<DesignStateRow>(STORES.designState, {
      projectId,
      update,
      snapshot: update,
      updatedAt: new Date().toISOString(),
    })
  }

  async function pushCheckpoint() {
    const update = Y.encodeStateAsUpdate(doc)
    const range = IDBKeyRange.bound([projectId, -Infinity], [projectId, Infinity])
    const existingRows = await idbBoundedRange<DesignCheckpointRow>(STORES.designUndoCheckpoints, range)
    const nextIndex = existingRows.length === 0
      ? 0
      : Math.max(...existingRows.map(r => r.seq)) + 1
    await idbPut<DesignCheckpointRow>(STORES.designUndoCheckpoints, {
      projectId,
      seq: nextIndex,
      createdAt: Date.now(),
      snapshot: update,
    })
    if (existingRows.length + 1 > CHECKPOINT_CAP) {
      const sorted = [...existingRows, { projectId, seq: nextIndex, createdAt: Date.now(), snapshot: update }]
        .sort((a, b) => a.seq - b.seq)
      const toDrop = sorted.length - CHECKPOINT_CAP
      const { idbDelete } = await import('~~/shared/idb/morti-db')
      for (let i = 0; i < toDrop; i++) {
        const row = sorted[i]
        await idbDelete(STORES.designUndoCheckpoints, [row.projectId, row.seq])
      }
    }
  }

  const snapshotDebounced = debounce(() => {
    void persistSnapshot()
  }, SNAPSHOT_DEBOUNCE_MS)

  const checkpointDebounced = debounce(() => {
    void pushCheckpoint()
  }, CHECKPOINT_DEBOUNCE_MS)

  function onUpdate() {
    refreshState()
    refreshUndoFlags()
    snapshotDebounced.call()
    checkpointDebounced.call()
  }

  function onStackChange() {
    refreshUndoFlags()
  }

  doc.on('update', onUpdate)
  undoManager.on('stack-item-added', onStackChange)
  undoManager.on('stack-item-popped', onStackChange)

  function undo() {
    if (undoManager.undoStack.length > 0) {
      undoManager.undo()
      refreshState()
      refreshUndoFlags()
    }
  }

  function redo() {
    if (undoManager.redoStack.length > 0) {
      undoManager.redo()
      refreshState()
      refreshUndoFlags()
    }
  }

  function dispose() {
    snapshotDebounced.flush()
    checkpointDebounced.cancel()
    doc.off('update', onUpdate)
    undoManager.off('stack-item-added', onStackChange)
    undoManager.off('stack-item-popped', onStackChange)
    undoManager.destroy()
    doc.destroy()
  }

  return {
    doc,
    state: computed<FurnitureDoc>(() => state.value),
    undo,
    redo,
    canUndo: computed<boolean>(() => canUndo.value),
    canRedo: computed<boolean>(() => canRedo.value),
    recovery,
    dispose,
  }
}
