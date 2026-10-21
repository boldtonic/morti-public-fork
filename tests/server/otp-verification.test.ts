import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { verifyOtpChallenge } from '~~/server/utils/otp-verification'
import { hashOtpCode } from '~~/server/utils/security'

interface QueryCall {
  sql: string
  params: unknown[]
}

type QueryResponse = { rows: unknown[] } | Error

class StubClient {
  readonly calls: QueryCall[] = []

  constructor(private readonly responses: QueryResponse[]) {}

  async query(sql: string, params: unknown[] = []) {
    this.calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
    const response = this.responses.shift()
    if (!response) throw new Error(`Unexpected query: ${sql}`)
    if (response instanceof Error) throw response
    return response
  }
}

const empty = () => ({ rows: [] })

function challenge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'otp_test',
    email: 'Test@Example.com',
    email_normalized: 'test@example.com',
    code_hash: hashOtpCode('otp_test', '123456'),
    attempts: 0,
    consumed_at: null,
    expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  }
}

function userRow() {
  return {
    id: 'usr_test',
    email: 'Test@Example.com',
    email_verified_at: new Date(),
    is_admin: false,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

function poolClient(client: StubClient): pg.PoolClient {
  return client as unknown as pg.PoolClient
}

const originalAuthSecret = process.env.AUTH_SECRET

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-that-is-at-least-32-characters-long'
  vi.stubGlobal('useRuntimeConfig', () => ({ authSecret: process.env.AUTH_SECRET }))
})

afterAll(() => {
  vi.unstubAllGlobals()
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET
  else process.env.AUTH_SECRET = originalAuthSecret
})

describe('OTP verification transaction', () => {
  it('locks the challenge and commits an invalid attempt', async () => {
    const client = new StubClient([
      empty(),
      { rows: [challenge()] },
      empty(),
      empty(),
    ])

    const result = await verifyOtpChallenge(poolClient(client), 'otp_test', '654321')

    expect(result).toEqual({ status: 'invalid' })
    expect(client.calls.map(call => call.sql)).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      'UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1',
      'COMMIT',
    ])
  })

  it('commits the fifth invalid attempt and refuses attempts beyond the limit', async () => {
    const fifthAttempt = new StubClient([
      empty(),
      { rows: [challenge({ attempts: 4 })] },
      empty(),
      empty(),
    ])
    await expect(verifyOtpChallenge(poolClient(fifthAttempt), 'otp_test', '654321'))
      .resolves.toEqual({ status: 'invalid' })
    expect(fifthAttempt.calls.at(-1)?.sql).toBe('COMMIT')

    const blockedAttempt = new StubClient([
      empty(),
      { rows: [challenge({ attempts: 5 })] },
      empty(),
    ])
    await expect(verifyOtpChallenge(poolClient(blockedAttempt), 'otp_test', '654321'))
      .resolves.toEqual({ status: 'too-many-attempts' })
    expect(blockedAttempt.calls.map(call => call.sql)).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      'COMMIT',
    ])
  })

  it('consumes a valid code while locked and rejects an already consumed code', async () => {
    const row = userRow()
    const validAttempt = new StubClient([
      empty(),
      { rows: [challenge()] },
      empty(),
      empty(),
      { rows: [row] },
      { rows: [row] },
      empty(),
    ])

    await expect(verifyOtpChallenge(poolClient(validAttempt), 'otp_test', '123456'))
      .resolves.toEqual({ status: 'verified', user: row })
    expect(validAttempt.calls.map(call => call.sql)).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      'UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1',
      'UPDATE otp_challenges SET consumed_at = now() WHERE id = $1',
      expect.stringContaining('FROM users'),
      expect.stringContaining('UPDATE users'),
      'COMMIT',
    ])

    const replay = new StubClient([
      empty(),
      { rows: [challenge({ consumed_at: new Date() })] },
      empty(),
    ])
    await expect(verifyOtpChallenge(poolClient(replay), 'otp_test', '123456'))
      .resolves.toEqual({ status: 'invalid' })
    expect(replay.calls.map(call => call.sql)).toEqual([
      'BEGIN',
      expect.stringContaining('FOR UPDATE'),
      'COMMIT',
    ])
  })

  it('rolls back consumption when valid-code processing fails', async () => {
    const client = new StubClient([
      empty(),
      { rows: [challenge()] },
      empty(),
      empty(),
      new Error('database unavailable'),
      empty(),
    ])

    await expect(verifyOtpChallenge(poolClient(client), 'otp_test', '123456'))
      .rejects.toThrow('database unavailable')
    expect(client.calls.at(-1)?.sql).toBe('ROLLBACK')
    expect(client.calls.some(call => call.sql === 'COMMIT')).toBe(false)
  })
})
