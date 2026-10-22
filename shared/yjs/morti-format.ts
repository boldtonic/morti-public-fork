import * as Y from 'yjs'
import type { PublicStyle } from '~~/shared/domain/types'
import {
  createProjectBundle,
  PROJECT_BUNDLE_UNIT_SYSTEM,
  PROJECT_BUNDLE_VERSION,
  type ProjectBundleV2,
} from '~~/shared/domain/project-bundle'
import { DESIGN_SCHEMA_VERSION, ASSEMBLY_COMPILER_VERSION, TECHNICAL_RENDERER_VERSION } from '~~/shared/domain/types'
import { ensureInitialized } from './doc'

export const MORTI_FORMAT_VERSION = 2
export const MORTI_MAX_BYTES = 32 * 1024 * 1024

export interface MortiEnvelope {
  formatVersion: number
  designSchemaVersion: number
  assemblyCompilerVersion: number
  technicalRendererVersion: number
  exportedAt: string
  yjsUpdateBase64: string
  projectBundle?: ProjectBundleV2
}

export interface ImportedProjectBundle {
  doc: Y.Doc
  project: ProjectBundleV2
}

export interface ExportProjectBundleOptions {
  projectName?: string | null
  publicStyle?: PublicStyle | null
}

export type MortiImportErrorCode
  = | 'FILE_TOO_LARGE'
    | 'INVALID_JSON'
    | 'INVALID_ENVELOPE'
    | 'UNSUPPORTED_FORMAT_VERSION'
    | 'UNSUPPORTED_DESIGN_SCHEMA_VERSION'
    | 'UNSUPPORTED_PROJECT_BUNDLE_VERSION'
    | 'UNSUPPORTED_UNIT_SYSTEM'
    | 'INVALID_BASE64'
    | 'INVALID_YJS_UPDATE'

export class MortiImportError extends Error {
  constructor(
    readonly code: MortiImportErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause })
    this.name = 'MortiImportError'
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/\s/g, '')
  const validBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
  if (!normalized || !validBase64.test(normalized)) {
    throw new MortiImportError('INVALID_BASE64', 'Invalid .morti file: yjsUpdateBase64 is not valid base64.')
  }

  let bin: string
  try {
    bin = atob(normalized)
  }
  catch (error) {
    throw new MortiImportError('INVALID_BASE64', 'Invalid .morti file: yjsUpdateBase64 is not valid base64.', error)
  }
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isVersion(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function parseProjectBundle(value: unknown): ProjectBundleV2 {
  if (!isRecord(value)
    || !isVersion(value.bundleVersion)
    || typeof value.unitSystem !== 'string'
    || !isRecord(value.publicStyle)
    || (value.projectName !== undefined && typeof value.projectName !== 'string')) {
    throw new MortiImportError('INVALID_ENVELOPE', 'Invalid .morti file: projectBundle is incomplete or malformed.')
  }
  if (value.bundleVersion > PROJECT_BUNDLE_VERSION) {
    throw new MortiImportError(
      'UNSUPPORTED_PROJECT_BUNDLE_VERSION',
      `Unsupported project bundle version ${value.bundleVersion}; this app supports up to version ${PROJECT_BUNDLE_VERSION}.`,
    )
  }
  if (value.unitSystem !== PROJECT_BUNDLE_UNIT_SYSTEM) {
    throw new MortiImportError(
      'UNSUPPORTED_UNIT_SYSTEM',
      `Unsupported project unit system ${value.unitSystem}.`,
    )
  }
  return createProjectBundle({
    projectName: value.projectName,
    publicStyle: value.publicStyle as unknown as PublicStyle,
  })
}

function parseEnvelope(value: unknown): Required<MortiEnvelope> {
  if (!isRecord(value)
    || !isVersion(value.formatVersion)
    || !isVersion(value.designSchemaVersion)
    || !isVersion(value.assemblyCompilerVersion)
    || !isVersion(value.technicalRendererVersion)
    || typeof value.exportedAt !== 'string'
    || typeof value.yjsUpdateBase64 !== 'string') {
    throw new MortiImportError('INVALID_ENVELOPE', 'Invalid .morti file: the JSON envelope is incomplete or malformed.')
  }
  if (value.formatVersion > MORTI_FORMAT_VERSION) {
    throw new MortiImportError(
      'UNSUPPORTED_FORMAT_VERSION',
      `Unsupported .morti format version ${value.formatVersion}; this app supports up to version ${MORTI_FORMAT_VERSION}.`,
    )
  }
  if (value.designSchemaVersion > DESIGN_SCHEMA_VERSION) {
    throw new MortiImportError(
      'UNSUPPORTED_DESIGN_SCHEMA_VERSION',
      `Unsupported design schema version ${value.designSchemaVersion}; this app supports up to version ${DESIGN_SCHEMA_VERSION}.`,
    )
  }
  const projectBundle = value.formatVersion >= 2
    ? parseProjectBundle(value.projectBundle)
    : createProjectBundle()
  return {
    ...(value as unknown as MortiEnvelope),
    projectBundle,
  } as Required<MortiEnvelope>
}

function applyImportedUpdate(bytes: Uint8Array, source: 'envelope' | 'legacy'): Y.Doc {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, bytes)
    const embeddedSchemaVersion = doc.getMap('furniture').get('schemaVersion')
    if (typeof embeddedSchemaVersion === 'number' && embeddedSchemaVersion > DESIGN_SCHEMA_VERSION) {
      throw new MortiImportError(
        'UNSUPPORTED_DESIGN_SCHEMA_VERSION',
        `Unsupported design schema version ${embeddedSchemaVersion}; this app supports up to version ${DESIGN_SCHEMA_VERSION}.`,
      )
    }
    ensureInitialized(doc)
    return doc
  }
  catch (error) {
    doc.destroy()
    if (error instanceof MortiImportError) throw error
    const description = source === 'envelope' ? 'embedded' : 'legacy raw'
    throw new MortiImportError(
      'INVALID_YJS_UPDATE',
      `Invalid .morti file: the ${description} Yjs update is corrupt.`,
      error,
    )
  }
}

export function exportDoc(doc: Y.Doc, options: ExportProjectBundleOptions = {}): Blob {
  const update = Y.encodeStateAsUpdate(doc)
  const env: MortiEnvelope = {
    formatVersion: MORTI_FORMAT_VERSION,
    designSchemaVersion: DESIGN_SCHEMA_VERSION,
    assemblyCompilerVersion: ASSEMBLY_COMPILER_VERSION,
    technicalRendererVersion: TECHNICAL_RENDERER_VERSION,
    exportedAt: new Date().toISOString(),
    yjsUpdateBase64: bytesToBase64(update),
    projectBundle: createProjectBundle(options),
  }
  return new Blob([JSON.stringify(env)], { type: 'application/json' })
}

export async function importProjectBundleFromBlob(blob: Blob): Promise<ImportedProjectBundle> {
  if (blob.size > MORTI_MAX_BYTES) {
    throw new MortiImportError('FILE_TOO_LARGE', `Invalid .morti file: files larger than ${MORTI_MAX_BYTES} bytes are not supported.`)
  }
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const text = new TextDecoder().decode(bytes)
  const trimmedText = text.trimStart()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch (error) {
    if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
      throw new MortiImportError('INVALID_JSON', 'Invalid .morti file: the JSON envelope cannot be parsed.', error)
    }
    return {
      doc: applyImportedUpdate(bytes, 'legacy'),
      project: createProjectBundle(),
    }
  }

  const env = parseEnvelope(parsed)
  return {
    doc: applyImportedUpdate(base64ToBytes(env.yjsUpdateBase64), 'envelope'),
    project: env.projectBundle,
  }
}

export async function importDocFromBlob(blob: Blob): Promise<Y.Doc> {
  return (await importProjectBundleFromBlob(blob)).doc
}
