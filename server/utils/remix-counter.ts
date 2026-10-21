import type pg from 'pg'
import { PROJECT_METADATA_SELECT, type ProjectRow } from '~~/server/utils/projects'

export const REMIXES_PER_PROJECT_PER_HOUR = 12
export const REMIXES_PER_ACTOR_PER_HOUR = 60

export type RecordRemixResult
  = | { status: 'recorded', project: ProjectRow }
    | { status: 'not-found' }
    | { status: 'rate-limited' }

interface RemixCountRow {
  total_count: number | string
  project_count: number | string
}

export async function recordProjectRemix(
  client: pg.PoolClient,
  projectId: string,
  actorHash: string,
): Promise<RecordRemixResult> {
  await client.query('BEGIN')
  try {
    // Serialize all remix attempts from one actor so concurrent requests cannot
    // pass the hourly counters together.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`remix:${actorHash}`])

    const available = await client.query<{ id: string }>(
      `
        SELECT id
        FROM projects
        WHERE id = $1
          AND deleted_at IS NULL
          AND visibility = 'public'
          AND snapshot IS NOT NULL
        LIMIT 1
        FOR UPDATE
      `,
      [projectId],
    )
    if (!available.rows[0]) {
      await client.query('COMMIT')
      return { status: 'not-found' }
    }

    const countResult = await client.query<RemixCountRow>(
      `
        SELECT
          count(*)::integer AS total_count,
          count(*) FILTER (WHERE project_id = $2)::integer AS project_count
        FROM project_remix_events
        WHERE actor_hash = $1
          AND created_at > now() - interval '1 hour'
      `,
      [actorHash, projectId],
    )
    const counts = countResult.rows[0]
    if (
      Number(counts?.total_count ?? 0) >= REMIXES_PER_ACTOR_PER_HOUR
      || Number(counts?.project_count ?? 0) >= REMIXES_PER_PROJECT_PER_HOUR
    ) {
      await client.query('COMMIT')
      return { status: 'rate-limited' }
    }

    await client.query(
      'INSERT INTO project_remix_events (project_id, actor_hash) VALUES ($1, $2)',
      [projectId, actorHash],
    )
    const updated = await client.query<ProjectRow>(
      `
        UPDATE projects
        SET remix_count = remix_count + 1,
            updated_at = now()
        WHERE id = $1
        RETURNING ${PROJECT_METADATA_SELECT}
      `,
      [projectId],
    )
    const project = updated.rows[0]
    if (!project) throw new Error('Remix target disappeared during the transaction.')

    await client.query('COMMIT')
    return { status: 'recorded', project }
  }
  catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
