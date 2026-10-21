import { createError, getRouterParam, readMultipartFormData } from 'h3'
import { requireUser } from '~~/server/utils/auth'
import { dbQuery } from '~~/server/utils/db'
import {
  InvalidProjectSnapshotError,
  PROJECT_SNAPSHOT_CONTENT_TYPE,
  PROJECT_SNAPSHOT_MAX_BYTES,
  validateProjectSnapshotBytes,
} from '~~/server/utils/project-snapshot'
import { PROJECT_METADATA_SELECT, cleanProjectName, cleanPublicStyle, projectRecordFromRow, type ProjectRow } from '~~/server/utils/projects'

function partString(parts: Awaited<ReturnType<typeof readMultipartFormData>>, name: string): string | undefined {
  const part = parts?.find(item => item.name === name)
  return part?.data ? Buffer.from(part.data).toString('utf8') : undefined
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project id is required.' })

  const existing = await dbQuery<ProjectRow>(`SELECT ${PROJECT_METADATA_SELECT} FROM projects WHERE id = $1 LIMIT 1`, [id])
  const row = existing.rows[0]
  if (!row || row.deleted_at) throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  if (row.owner_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'You do not have access to this project.' })

  const parts = await readMultipartFormData(event)
  const snapshot = parts?.find(part => part.name === 'snapshot')
  if (!snapshot?.data || snapshot.data.byteLength === 0) {
    throw createError({ statusCode: 400, statusMessage: 'snapshot is required.' })
  }
  if (snapshot.data.byteLength > PROJECT_SNAPSHOT_MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Snapshot is too large.' })
  }
  let snapshotBytes: Buffer
  try {
    snapshotBytes = validateProjectSnapshotBytes(snapshot.data)
  }
  catch (error) {
    if (error instanceof InvalidProjectSnapshotError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    throw error
  }

  const result = await dbQuery<ProjectRow>(
    `
      UPDATE projects
      SET name = $2,
          visibility = 'public',
          published_at = now(),
          public_style = COALESCE($3, public_style),
          snapshot = $4,
          snapshot_filename = $5,
          snapshot_content_type = $6,
          snapshot_updated_at = now(),
          updated_at = now()
      WHERE id = $1
      RETURNING ${PROJECT_METADATA_SELECT}
    `,
    [
      id,
      cleanProjectName(partString(parts, 'name') ?? row.name),
      cleanPublicStyle(partString(parts, 'public_style')),
      snapshotBytes,
      `snapshot-${row.client_project_id}.bin`,
      PROJECT_SNAPSHOT_CONTENT_TYPE,
    ],
  )
  return projectRecordFromRow(result.rows[0])
})
