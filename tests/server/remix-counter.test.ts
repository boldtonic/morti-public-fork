import type pg from 'pg'
import { describe, expect, it } from 'vitest'
import {
  REMIXES_PER_ACTOR_PER_HOUR,
  REMIXES_PER_PROJECT_PER_HOUR,
  recordProjectRemix,
} from '~~/server/utils/remix-counter'

type QueryResponse = { rows: unknown[] } | Error

class StubClient {
  readonly calls: Array<{ sql: string, params: unknown[] }> = []

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
const projectRow = () => ({ id: 'project-1', name: 'Project' })
const asPoolClient = (client: StubClient) => client as unknown as pg.PoolClient

describe('public remix counter', () => {
  it('records an available project remix in one transaction', async () => {
    const project = projectRow()
    const client = new StubClient([
      empty(),
      empty(),
      { rows: [{ id: project.id }] },
      { rows: [{ total_count: 0, project_count: 0 }] },
      empty(),
      { rows: [project] },
      empty(),
    ])

    await expect(recordProjectRemix(asPoolClient(client), project.id, 'actor'))
      .resolves.toEqual({ status: 'recorded', project })
    expect(client.calls.map(call => call.sql)).toEqual([
      'BEGIN',
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.stringMatching(/FROM projects[\s\S]*FOR UPDATE/),
      expect.stringContaining('FROM project_remix_events'),
      'INSERT INTO project_remix_events (project_id, actor_hash) VALUES ($1, $2)',
      expect.stringContaining('UPDATE projects'),
      'COMMIT',
    ])
  })

  it('does not create an event for an unavailable project', async () => {
    const client = new StubClient([empty(), empty(), empty(), empty()])

    await expect(recordProjectRemix(asPoolClient(client), 'missing', 'actor'))
      .resolves.toEqual({ status: 'not-found' })
    expect(client.calls.at(-1)?.sql).toBe('COMMIT')
    expect(client.calls.some(call => call.sql.startsWith('INSERT'))).toBe(false)
  })

  it.each([
    { total_count: 0, project_count: REMIXES_PER_PROJECT_PER_HOUR },
    { total_count: REMIXES_PER_ACTOR_PER_HOUR, project_count: 0 },
  ])('enforces hourly counters before incrementing: %o', async counts => {
    const client = new StubClient([
      empty(),
      empty(),
      { rows: [{ id: 'project-1' }] },
      { rows: [counts] },
      empty(),
    ])

    await expect(recordProjectRemix(asPoolClient(client), 'project-1', 'actor'))
      .resolves.toEqual({ status: 'rate-limited' })
    expect(client.calls.at(-1)?.sql).toBe('COMMIT')
    expect(client.calls.some(call => call.sql.startsWith('INSERT'))).toBe(false)
  })

  it('rolls back when the counter update fails', async () => {
    const client = new StubClient([
      empty(),
      empty(),
      { rows: [{ id: 'project-1' }] },
      { rows: [{ total_count: 0, project_count: 0 }] },
      empty(),
      new Error('database unavailable'),
      empty(),
    ])

    await expect(recordProjectRemix(asPoolClient(client), 'project-1', 'actor'))
      .rejects.toThrow('database unavailable')
    expect(client.calls.at(-1)?.sql).toBe('ROLLBACK')
  })
})
