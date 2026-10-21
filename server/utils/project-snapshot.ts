import * as Y from 'yjs'

export const PROJECT_SNAPSHOT_CONTENT_TYPE = 'application/octet-stream'
export const PROJECT_SNAPSHOT_CONTENT_DISPOSITION = 'attachment; filename="tenon-snapshot.bin"'
export const PROJECT_SNAPSHOT_MAX_BYTES = 20 * 1024 * 1024

export class InvalidProjectSnapshotError extends Error {
  constructor() {
    super('Snapshot is not a valid Tenon project update.')
    this.name = 'InvalidProjectSnapshotError'
  }
}

export function validateProjectSnapshotBytes(data: Uint8Array): Buffer {
  if (data.byteLength === 0 || data.byteLength > PROJECT_SNAPSHOT_MAX_BYTES) {
    throw new InvalidProjectSnapshotError()
  }

  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, data)
    return Buffer.from(data)
  }
  catch {
    throw new InvalidProjectSnapshotError()
  }
  finally {
    doc.destroy()
  }
}
