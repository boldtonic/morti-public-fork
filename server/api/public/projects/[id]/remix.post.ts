import { createError, getHeader, getRequestIP, getRouterParam, setHeader } from 'h3'
import { withDbClient } from '~~/server/utils/db'
import { projectRecordFromRow } from '~~/server/utils/projects'
import { recordProjectRemix } from '~~/server/utils/remix-counter'
import { hmacValue } from '~~/server/utils/security'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Project id is required.' })

  const ip = getRequestIP(event, { xForwardedFor: true }) || getHeader(event, 'x-real-ip') || 'unknown'
  const userAgent = String(getHeader(event, 'user-agent') || '').slice(0, 256)
  const actorSource = ip === 'unknown' ? `unknown:${userAgent}` : ip
  const result = await withDbClient(client => recordProjectRemix(client, id, hmacValue(`remix:${actorSource}`)))

  if (result.status === 'not-found') {
    throw createError({
      statusCode: 404,
      statusMessage: 'This project is private or no longer available.',
    })
  }
  if (result.status === 'rate-limited') {
    setHeader(event, 'Retry-After', 3600)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many remixes. Try again later.',
    })
  }
  return projectRecordFromRow(result.project)
})
