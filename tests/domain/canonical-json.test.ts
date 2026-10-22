import { describe, expect, it } from 'vitest'
import { canonicalIdentity, canonicalJsonStringify } from '~~/shared/domain/canonical-json'

describe('canonical JSON', () => {
  it('sorts object keys recursively while retaining array order', () => {
    const first = { z: 1, nested: { b: 2, a: 1 }, list: [{ y: 2, x: 1 }] }
    const second = { list: [{ x: 1, y: 2 }], nested: { a: 1, b: 2 }, z: 1 }

    expect(canonicalJsonStringify(first)).toBe('{"list":[{"x":1,"y":2}],"nested":{"a":1,"b":2},"z":1}')
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second))
    expect(canonicalIdentity('fixture', first)).toBe(canonicalIdentity('fixture', second))
  })

  it('matches JSON omission semantics and rejects non-finite numbers', () => {
    expect(canonicalJsonStringify({ missing: undefined, list: [undefined, -0] })).toBe('{"list":[null,0]}')
    expect(() => canonicalJsonStringify({ invalid: Number.NaN })).toThrow('finite numbers')
  })
})
