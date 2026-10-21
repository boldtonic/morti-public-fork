import { createError, getHeader, getRouterParam, send, setHeader, setResponseStatus } from 'h3'
import { getCurrentUser } from '~~/server/utils/auth'
import { dbQuery } from '~~/server/utils/db'
import {
  PROJECT_SNAPSHOT_CONTENT_DISPOSITION,
  PROJECT_SNAPSHOT_CONTENT_TYPE,
} from '~~/server/utils/project-snapshot'
import {
  PROJECT_METADATA_SELECT,
  assertCanReadProject,
  ifNoneMatchMatches,
  projectHasSnapshot,
  projectSnapshotEtag,
  type ProjectRow,
} from '~~/server/utils/projects'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project id is required.' })
  const result = await dbQuery<ProjectRow>(`SELECT ${PROJECT_METADATA_SELECT} FROM projects WHERE id = $1 LIMIT 1`, [id])
  const row = result.rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  assertCanReadProject(row, await getCurrentUser(event))
  if (!projectHasSnapshot(row)) throw createError({ statusCode: 404, statusMessage: 'No snapshot found.' })

  const etag = projectSnapshotEtag(row)
  if (etag) setHeader(event, 'etag', etag)
  setHeader(event, 'content-type', PROJECT_SNAPSHOT_CONTENT_TYPE)
  setHeader(event, 'content-disposition', PROJECT_SNAPSHOT_CONTENT_DISPOSITION)
  setHeader(event, 'content-security-policy', "default-src 'none'; sandbox")
  // `no-cache` (not `no-store`) so the browser keeps a copy and revalidates
  // via If-None-Match — server returns 304 and the body is reused from cache.
  setHeader(event, 'cache-control', row.visibility === 'public' ? 'public, max-age=60, must-revalidate' : 'private, no-cache')

  if (etag && ifNoneMatchMatches(getHeader(event, 'if-none-match'), etag)) {
    setResponseStatus(event, 304)
    return send(event, '')
  }

  const snapshotResult = await dbQuery<Pick<ProjectRow, 'snapshot'>>('SELECT snapshot FROM projects WHERE id = $1 LIMIT 1', [id])
  const bytes = snapshotResult.rows[0]?.snapshot
  if (!bytes) throw createError({ statusCode: 404, statusMessage: 'No snapshot found.' })
  return bytes
})
