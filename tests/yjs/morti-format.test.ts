import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { DESIGN_SCHEMA_VERSION } from '~~/shared/domain/types'
import { normalizePublicStyle } from '~~/shared/domain/defaults'
import {
  createProjectBundle,
  PROJECT_BUNDLE_VERSION,
  type ProjectBundleV2,
} from '~~/shared/domain/project-bundle'
import { ensureInitialized, insertColumn, readFurnitureDoc } from '~~/shared/yjs/doc'
import {
  MORTI_FORMAT_VERSION,
  MortiImportError,
  exportDoc,
  importDocFromBlob,
  importProjectBundleFromBlob,
  type MortiEnvelope,
} from '~~/shared/yjs/morti-format'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function blobFromBytes(bytes: Uint8Array): Blob {
  return new Blob([new Uint8Array(bytes).buffer])
}

function makeUpdate(schemaVersion = DESIGN_SCHEMA_VERSION): Uint8Array {
  const doc = new Y.Doc()
  ensureInitialized(doc)
  insertColumn(doc, 0)
  doc.getMap('furniture').set('schemaVersion', schemaVersion)
  const update = Y.encodeStateAsUpdate(doc)
  doc.destroy()
  return update
}

function envelope(overrides: Partial<MortiEnvelope> = {}): MortiEnvelope {
  return {
    formatVersion: MORTI_FORMAT_VERSION,
    designSchemaVersion: DESIGN_SCHEMA_VERSION,
    assemblyCompilerVersion: 2,
    technicalRendererVersion: 1,
    exportedAt: new Date(0).toISOString(),
    yjsUpdateBase64: bytesToBase64(makeUpdate()),
    projectBundle: createProjectBundle(),
    ...overrides,
  }
}

function envelopeBlob(overrides: Partial<MortiEnvelope> = {}): Blob {
  return new Blob([JSON.stringify(envelope(overrides))], { type: 'application/json' })
}

async function expectImportError(blob: Blob, code: MortiImportError['code']) {
  let thrown: unknown
  try {
    await importDocFromBlob(blob)
  }
  catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(MortiImportError)
  expect(thrown).toMatchObject({ code })
  return thrown as MortiImportError
}

describe('.morti import format', () => {
  it('round-trips the current exported envelope', async () => {
    const source = new Y.Doc()
    ensureInitialized(source)
    insertColumn(source, 0)

    const imported = await importDocFromBlob(exportDoc(source))

    expect(readFurnitureDoc(imported).columns).toHaveLength(1)
    source.destroy()
    imported.destroy()
  })

  it('round-trips project name and product style in the v2 bundle', async () => {
    const source = new Y.Doc()
    ensureInitialized(source)
    const publicStyle = normalizePublicStyle({
      renderStyle: 'technical',
      rendered: {
        handles: { type: 'square-bar', finish: 'brass' },
      },
    } as Parameters<typeof normalizePublicStyle>[0])

    const imported = await importProjectBundleFromBlob(exportDoc(source, {
      projectName: 'Console oak',
      publicStyle,
    }))

    expect(imported.project.projectName).toBe('Console oak')
    expect(imported.project.publicStyle).toEqual(publicStyle)
    imported.doc.destroy()
    source.destroy()
  })

  it('accepts previous envelope and design schema versions', async () => {
    const imported = await importDocFromBlob(envelopeBlob({
      formatVersion: Math.max(0, MORTI_FORMAT_VERSION - 1),
      designSchemaVersion: Math.max(0, DESIGN_SCHEMA_VERSION - 1),
      projectBundle: undefined,
    }))

    expect(readFurnitureDoc(imported).schemaVersion).toBe(DESIGN_SCHEMA_VERSION)
    imported.destroy()
  })

  it('migrates v1 envelopes to a default v2 project bundle', async () => {
    const imported = await importProjectBundleFromBlob(envelopeBlob({
      formatVersion: 1,
      projectBundle: undefined,
    }))

    expect(imported.project).toEqual(createProjectBundle())
    imported.doc.destroy()
  })

  it('accepts the legacy raw Yjs update format', async () => {
    const imported = await importDocFromBlob(blobFromBytes(makeUpdate()))

    expect(readFurnitureDoc(imported).columns).toHaveLength(1)
    imported.destroy()
  })

  it('rejects a future envelope format version explicitly', async () => {
    const error = await expectImportError(
      envelopeBlob({ formatVersion: MORTI_FORMAT_VERSION + 1 }),
      'UNSUPPORTED_FORMAT_VERSION',
    )
    expect(error.message).toContain('format version')
  })

  it('rejects a future declared design schema version explicitly', async () => {
    const error = await expectImportError(
      envelopeBlob({ designSchemaVersion: DESIGN_SCHEMA_VERSION + 1 }),
      'UNSUPPORTED_DESIGN_SCHEMA_VERSION',
    )
    expect(error.message).toContain('design schema version')
  })

  it('rejects a future project bundle version explicitly', async () => {
    const futureBundle = {
      ...createProjectBundle(),
      bundleVersion: PROJECT_BUNDLE_VERSION + 1,
    } as unknown as ProjectBundleV2
    const error = await expectImportError(
      envelopeBlob({ projectBundle: futureBundle }),
      'UNSUPPORTED_PROJECT_BUNDLE_VERSION',
    )
    expect(error.message).toContain('project bundle version')
  })

  it('requires the v2 project bundle in current envelopes', async () => {
    await expectImportError(
      envelopeBlob({ projectBundle: undefined }),
      'INVALID_ENVELOPE',
    )
  })

  it('rejects a future schema embedded in the Yjs update', async () => {
    const error = await expectImportError(
      envelopeBlob({ yjsUpdateBase64: bytesToBase64(makeUpdate(DESIGN_SCHEMA_VERSION + 1)) }),
      'UNSUPPORTED_DESIGN_SCHEMA_VERSION',
    )
    expect(error.message).toContain(String(DESIGN_SCHEMA_VERSION + 1))
  })

  it('reports malformed envelope structure instead of treating it as legacy Yjs', async () => {
    const error = await expectImportError(
      new Blob([JSON.stringify({ formatVersion: MORTI_FORMAT_VERSION })]),
      'INVALID_ENVELOPE',
    )
    expect(error.message).toContain('envelope')
  })

  it('validates JSON arrays as malformed envelopes', async () => {
    await expectImportError(new Blob(['[]'], { type: 'application/json' }), 'INVALID_ENVELOPE')
  })

  it('reports malformed JSON explicitly', async () => {
    const error = await expectImportError(new Blob(['{"formatVersion":']), 'INVALID_JSON')
    expect(error.message).toContain('JSON')
  })

  it('reports invalid base64 explicitly', async () => {
    const error = await expectImportError(envelopeBlob({ yjsUpdateBase64: 'not base64!' }), 'INVALID_BASE64')
    expect(error.message).toContain('base64')
  })

  it('reports corrupt embedded and legacy Yjs updates explicitly', async () => {
    const corrupt = new Uint8Array([255, 0, 1])
    const embeddedError = await expectImportError(
      envelopeBlob({ yjsUpdateBase64: bytesToBase64(corrupt) }),
      'INVALID_YJS_UPDATE',
    )
    const legacyError = await expectImportError(blobFromBytes(corrupt), 'INVALID_YJS_UPDATE')

    expect(embeddedError.message).toContain('embedded Yjs update')
    expect(legacyError.message).toContain('legacy raw Yjs update')
  })
})
