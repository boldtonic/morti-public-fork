import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, getCurrentScope, nextTick, onScopeDispose, ref, watch } from 'vue'
import * as Y from 'yjs'
import type { AuthUser, CloudProjectRecord, LocalProjectRow } from '~~/shared/domain/types'
import { ensureInitialized, readFurnitureDoc, setConfigValue } from '~~/shared/yjs/doc'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

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

function cloudRecord(id: string, owner: string): CloudProjectRecord {
  return {
    id,
    collectionId: 'morti_projects',
    collectionName: 'morti_projects',
    owner,
    name: 'Project',
    visibility: 'private',
    client_project_id: 'local-project',
    is_demo: false,
    remix_count: 0,
    public_style: '{}',
    snapshot: `${id}.bin`,
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
  }
}

function remoteUpdateFrom(doc: Y.Doc, depth: number): Uint8Array {
  const remote = new Y.Doc()
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc))
  setConfigValue(remote, 'depth', depth)
  return Y.encodeStateAsUpdate(remote)
}

async function waitForCall(mock: ReturnType<typeof vi.fn>, count: number): Promise<void> {
  await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(count))
}

describe('useCloudAutosync', () => {
  const activeDisposers: Array<() => void> = []

  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('watch', watch)
    vi.stubGlobal('getCurrentScope', getCurrentScope)
    vi.stubGlobal('onScopeDispose', onScopeDispose)
  })

  afterEach(() => {
    for (const dispose of activeDisposers.splice(0)) dispose()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function setup(options: {
    initialUser?: AuthUser | null
    ensureCloudProject?: ReturnType<typeof vi.fn>
    fetchSnapshotBytes?: ReturnType<typeof vi.fn>
  } = {}) {
    const user = ref<AuthUser | null>(options.initialUser ?? null)
    const isCloudAuthed = computed(() => !!user.value?.id)
    const project = ref<LocalProjectRow | null>({
      id: 'local-project',
      name: 'Project',
      cloudId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      isDemo: false,
    })
    const doc = new Y.Doc()
    ensureInitialized(doc)

    const ensureCloudProject = options.ensureCloudProject ?? vi.fn(async () => cloudRecord('record-default', user.value!.id))
    const fetchSnapshotBytes = options.fetchSnapshotBytes ?? vi.fn(async () => null)
    const uploadSnapshotBytes = vi.fn(async (recordId: string) => cloudRecord(recordId, user.value?.id ?? 'unknown'))
    const putDesignSnapshot = vi.fn(async () => {})
    const setLocalProjectCloudId = vi.fn(async () => {})

    vi.stubGlobal('useAuth', () => ({ user, isCloudAuthed }))
    vi.stubGlobal('useCloudProjects', () => ({
      ensureCloudProject,
      fetchSnapshotBytes,
      uploadSnapshotBytes,
    }))
    vi.stubGlobal('useLocalProjects', () => ({
      putDesignSnapshot,
      setLocalProjectCloudId,
    }))

    const { useCloudAutosync } = await import('~~/composables/useCloudAutosync')
    const autosync = useCloudAutosync({ projectId: 'local-project', doc, project })
    activeDisposers.push(autosync.dispose)

    return {
      autosync,
      doc,
      user,
      ensureCloudProject,
      fetchSnapshotBytes,
      uploadSnapshotBytes,
      putDesignSnapshot,
      setLocalProjectCloudId,
    }
  }

  it('starts the first sync when a user logs in without a Y.Doc update', async () => {
    const context = await setup()

    expect(context.ensureCloudProject).not.toHaveBeenCalled()

    context.user.value = authUser('user-a')
    await nextTick()
    await waitForCall(context.uploadSnapshotBytes, 1)

    expect(context.ensureCloudProject).toHaveBeenCalled()
    expect(context.uploadSnapshotBytes).toHaveBeenCalledWith(
      'record-default',
      'local-project',
      expect.any(Uint8Array),
    )
  })

  it('uploads the same local fingerprint once for each cloud identity', async () => {
    const ensureCloudProject = vi.fn(async () => {
      return ensureCloudProject.mock.calls.length === 1
        ? cloudRecord('record-user-a', 'user-a')
        : cloudRecord('record-user-b', 'user-b')
    })
    const context = await setup({ initialUser: authUser('user-a'), ensureCloudProject })

    await waitForCall(context.uploadSnapshotBytes, 1)
    expect(context.uploadSnapshotBytes.mock.calls[0]?.[0]).toBe('record-user-a')

    context.user.value = authUser('user-b')
    await nextTick()
    await waitForCall(context.uploadSnapshotBytes, 2)

    expect(context.uploadSnapshotBytes.mock.calls[1]?.[0]).toBe('record-user-b')
    expect(context.fetchSnapshotBytes.mock.calls.map(call => call[0].id)).toEqual([
      'record-user-a',
      'record-user-b',
    ])
  })

  it('treats a replacement cloud record as a new sync target', async () => {
    let record = cloudRecord('record-a', 'user-a')
    const ensureCloudProject = vi.fn(async () => record)
    const context = await setup({ initialUser: authUser('user-a'), ensureCloudProject })

    await waitForCall(context.uploadSnapshotBytes, 1)

    record = cloudRecord('record-b', 'user-a')
    await context.autosync.syncNow()

    expect(context.uploadSnapshotBytes).toHaveBeenCalledTimes(2)
    expect(context.uploadSnapshotBytes.mock.calls[1]?.[0]).toBe('record-b')
    expect(context.fetchSnapshotBytes.mock.calls.map(call => call[0].id)).toEqual([
      'record-a',
      'record-b',
    ])
  })

  it('does not merge or upload a stale response after the user changes', async () => {
    const firstRecord = deferred<CloudProjectRecord>()
    const ensureCloudProject = vi.fn(async () => {
      if (ensureCloudProject.mock.calls.length === 1) return await firstRecord.promise
      return cloudRecord('record-b', 'user-b')
    })
    const fetchSnapshotBytes = vi.fn(async (record: CloudProjectRecord) => {
      return record.id === 'record-a'
        ? remoteUpdateFrom(context.doc, 0.55)
        : remoteUpdateFrom(context.doc, 0.65)
    })
    const context = await setup({
      initialUser: authUser('user-a'),
      ensureCloudProject,
      fetchSnapshotBytes,
    })

    await waitForCall(ensureCloudProject, 1)
    context.user.value = authUser('user-b')
    firstRecord.resolve(cloudRecord('record-a', 'user-a'))
    await nextTick()
    await waitForCall(context.uploadSnapshotBytes, 1)

    expect(context.fetchSnapshotBytes).toHaveBeenCalledTimes(1)
    expect(context.fetchSnapshotBytes.mock.calls[0]?.[0].id).toBe('record-b')
    expect(context.uploadSnapshotBytes.mock.calls[0]?.[0]).toBe('record-b')
    expect(readFurnitureDoc(context.doc).config.depth).toBe(0.65)
  })

  it('retries a failed sync through the existing serialized queue', async () => {
    let activeCalls = 0
    let maxActiveCalls = 0
    const ensureCloudProject = vi.fn(async () => {
      activeCalls += 1
      maxActiveCalls = Math.max(maxActiveCalls, activeCalls)
      await Promise.resolve()
      activeCalls -= 1
      if (ensureCloudProject.mock.calls.length === 1) throw new Error('Temporary failure')
      return cloudRecord('record-a', 'user-a')
    })
    const context = await setup({ initialUser: authUser('user-a'), ensureCloudProject })

    await vi.waitFor(() => expect(context.autosync.syncStatus.value).toBe('error'))
    context.autosync.retrySync()
    const finalSync = context.autosync.syncNow()
    await finalSync

    expect(maxActiveCalls).toBe(1)
    expect(context.autosync.syncStatus.value).toBe('synced')
    expect(context.uploadSnapshotBytes).toHaveBeenCalledTimes(1)
  })

  it('stops reacting to identity changes after dispose', async () => {
    const context = await setup()

    context.autosync.dispose()
    context.user.value = authUser('user-a')
    await nextTick()
    await Promise.resolve()

    expect(context.ensureCloudProject).not.toHaveBeenCalled()
  })
})
