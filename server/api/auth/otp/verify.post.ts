import { createError, readBody } from 'h3'
import { authUserFromRow, createAuthSession } from '~~/server/utils/auth'
import { withDbClient } from '~~/server/utils/db'
import { verifyOtpChallenge } from '~~/server/utils/otp-verification'
import { normalizeOtpCode } from '~~/server/utils/security'

function invalidCode(): never {
  throw createError({ statusCode: 400, statusMessage: 'Invalid or expired code.' })
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ otpId?: string, code?: string }>(event)
  const otpId = String(body?.otpId || '')
  const code = normalizeOtpCode(String(body?.code || ''))
  if (!otpId || code.length !== 6) invalidCode()

  const verification = await withDbClient(client => verifyOtpChallenge(client, otpId, code))
  if (verification.status === 'invalid') invalidCode()
  if (verification.status === 'too-many-attempts') {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts for this code. Request a new one.' })
  }
  const user = authUserFromRow(verification.user)

  await createAuthSession(event, user.id)
  return { user }
})
