function serializeCanonical(value: unknown, inArray = false): string | undefined {
  if (value === null) return 'null'

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON only supports finite numbers.')
    return JSON.stringify(Object.is(value, -0) ? 0 : value)
  }

  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return inArray ? 'null' : undefined
  }

  if (typeof value === 'bigint') {
    throw new TypeError('Canonical JSON does not support bigint values.')
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => serializeCanonical(item, true) ?? 'null').join(',')}]`
  }

  const record = value as Record<string, unknown>
  const entries = Object.keys(record)
    .sort()
    .flatMap((key) => {
      const serialized = serializeCanonical(record[key])
      return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`]
    })
  return `{${entries.join(',')}}`
}

/** Deterministic JSON with lexicographically sorted object keys. */
export function canonicalJsonStringify(value: unknown): string {
  const serialized = serializeCanonical(value)
  if (serialized === undefined) throw new TypeError('The root value is not JSON serializable.')
  return serialized
}

/** Stable, compact identity hash for canonical domain payloads. */
export function fnv1a64Hex(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let hash = 0xcbf29ce484222325n
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

export function canonicalIdentity(prefix: string, value: unknown): string {
  return `${prefix}-${fnv1a64Hex(canonicalJsonStringify(value))}`
}
