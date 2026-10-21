import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  InvalidProjectSnapshotError,
  PROJECT_SNAPSHOT_CONTENT_TYPE,
  validateProjectSnapshotBytes,
} from '~~/server/utils/project-snapshot'

describe('project snapshots', () => {
  it('accepts a valid Yjs project update without changing its bytes', () => {
    const doc = new Y.Doc()
    doc.getMap('project').set('name', 'Valid project')
    const update = Y.encodeStateAsUpdate(doc)

    expect(validateProjectSnapshotBytes(update)).toEqual(Buffer.from(update))
  })

  it('rejects HTML even when a client labels it as a snapshot', () => {
    const html = new TextEncoder().encode('<script>window.__unsafe = true</script>')

    expect(() => validateProjectSnapshotBytes(html)).toThrow(InvalidProjectSnapshotError)
  })

  it('uses a fixed inert content type for every stored snapshot', () => {
    expect(PROJECT_SNAPSHOT_CONTENT_TYPE).toBe('application/octet-stream')
  })
})
