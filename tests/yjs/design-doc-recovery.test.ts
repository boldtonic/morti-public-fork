import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'

const idbMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  boundedRange: vi.fn(),
}))

vi.mock('~~/shared/idb/morti-db', () => ({
  STORES: {
    designState: 'designState',
    designUndoCheckpoints: 'designUndoCheckpoints',
  },
  idbGet: idbMocks.get,
  idbPut: idbMocks.put,
  idbBoundedRange: idbMocks.boundedRange,
}))

import {
  DesignDocLoadError,
  loadDesignDocFromUpdates,
  useDesignDoc,
  type DesignCheckpointRow,
} from '~~/composables/useDesignDoc'
import { ensureInitialized, insertColumn, readFurnitureDoc } from '~~/shared/yjs/doc'

const CORRUPT_UPDATE = new Uint8Array([255, 0, 1])

function validUpdate(columnCount = 1): Uint8Array {
  const doc = new Y.Doc()
  ensureInitialized(doc)
  for (let index = 0; index < columnCount; index++) insertColumn(doc, index)
  const update = Y.encodeStateAsUpdate(doc)
  doc.destroy()
  return update
}

function checkpoint(seq: number, snapshot: Uint8Array, createdAt = seq * 1000): DesignCheckpointRow {
  return { projectId: 'project-1', seq, createdAt, snapshot }
}

describe('design document recovery', () => {
  beforeEach(() => {
    idbMocks.get.mockReset()
    idbMocks.put.mockReset().mockResolvedValue(undefined)
    idbMocks.boundedRange.mockReset()
    vi.stubGlobal('IDBKeyRange', { bound: vi.fn(() => ({ type: 'project-range' })) })
  })

  it('loads a valid primary update without reporting recovery', () => {
    const result = loadDesignDocFromUpdates('project-1', validUpdate(2), [])

    expect(result.recovery).toBeNull()
    expect(readFurnitureDoc(result.doc).columns).toHaveLength(2)
    result.doc.destroy()
  })

  it('uses the newest valid checkpoint and reports skipped corrupt checkpoints', () => {
    const result = loadDesignDocFromUpdates('project-1', CORRUPT_UPDATE, [
      checkpoint(1, validUpdate(1)),
      checkpoint(3, CORRUPT_UPDATE),
      checkpoint(2, validUpdate(2)),
    ])

    expect(result.recovery).toEqual({
      source: 'checkpoint',
      checkpointSeq: 2,
      checkpointCreatedAt: 2000,
      skippedNewerCheckpoints: 1,
    })
    expect(readFurnitureDoc(result.doc).columns).toHaveLength(2)
    result.doc.destroy()
  })

  it('never recovers a checkpoint belonging to another project', () => {
    expect(() => loadDesignDocFromUpdates('project-1', CORRUPT_UPDATE, [
      { ...checkpoint(1, validUpdate(2)), projectId: 'project-2' },
    ])).toThrowError(DesignDocLoadError)
  })

  it('throws a typed error with a defensive copy when no checkpoint is valid', () => {
    const original = new Uint8Array(CORRUPT_UPDATE)

    let thrown: unknown
    try {
      loadDesignDocFromUpdates('project-1', original, [checkpoint(1, CORRUPT_UPDATE)])
    }
    catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(DesignDocLoadError)
    const loadError = thrown as DesignDocLoadError
    expect(loadError).toMatchObject({
      code: 'DESIGN_UPDATE_CORRUPT',
      projectId: 'project-1',
      attemptedCheckpointCount: 1,
    })
    expect(loadError.originalUpdateBytes).toEqual(CORRUPT_UPDATE)
    expect(loadError.originalUpdateBytes).not.toBe(original)

    original[0] = 0
    expect(loadError.originalUpdateBytes).toEqual(CORRUPT_UPDATE)
  })

  it('persists a recovered checkpoint and exposes its metadata on the handle', async () => {
    idbMocks.get.mockResolvedValue({ projectId: 'project-1', update: CORRUPT_UPDATE })
    idbMocks.boundedRange.mockResolvedValue([
      checkpoint(4, CORRUPT_UPDATE),
      checkpoint(3, validUpdate(2), 3000),
    ])

    const handle = await useDesignDoc('project-1')

    expect(handle.recovery).toEqual({
      source: 'checkpoint',
      checkpointSeq: 3,
      checkpointCreatedAt: 3000,
      skippedNewerCheckpoints: 1,
    })
    expect(idbMocks.put).toHaveBeenCalledOnce()
    expect(idbMocks.put.mock.calls[0]![1]).toMatchObject({ projectId: 'project-1' })
    expect(readFurnitureDoc(handle.doc).columns).toHaveLength(2)
    handle.dispose()
  })

  it('does not initialize or persist an empty project when recovery fails', async () => {
    idbMocks.get.mockResolvedValue({ projectId: 'project-1', update: CORRUPT_UPDATE })
    idbMocks.boundedRange.mockResolvedValue([checkpoint(1, CORRUPT_UPDATE)])

    await expect(useDesignDoc('project-1')).rejects.toMatchObject({
      code: 'DESIGN_UPDATE_CORRUPT',
      projectId: 'project-1',
      attemptedCheckpointCount: 1,
      originalUpdateBytes: CORRUPT_UPDATE,
    })
    expect(idbMocks.put).not.toHaveBeenCalled()
  })
})
