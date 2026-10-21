import { describe, expect, it } from 'vitest'
import {
  isLocalBypassRequestOrigin,
  isLocalhostHost,
  isLoopbackAddress,
} from '~~/server/utils/auth'

describe('local auth bypass boundaries', () => {
  it('accepts only loopback host names', () => {
    expect(isLocalhostHost('localhost')).toBe(true)
    expect(isLocalhostHost('127.0.0.1')).toBe(true)
    expect(isLocalhostHost('::1')).toBe(true)
    expect(isLocalhostHost('0.0.0.0')).toBe(false)
    expect(isLocalhostHost('example.com')).toBe(false)
  })

  it('accepts only loopback socket addresses', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('::1')).toBe(true)
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('192.168.1.10')).toBe(false)
    expect(isLoopbackAddress(undefined)).toBe(false)
  })

  it('does not trust forwarded hosts or a known remote socket', () => {
    expect(isLocalBypassRequestOrigin('127.0.0.1:3003', undefined)).toBe(true)
    expect(isLocalBypassRequestOrigin('127.0.0.1:3003', '127.0.0.1')).toBe(true)
    expect(isLocalBypassRequestOrigin('127.0.0.1:3003', '192.168.1.10')).toBe(false)
    expect(isLocalBypassRequestOrigin('tenon.example.com', undefined)).toBe(false)
  })
})
