import type pg from 'pg'
import { createId, hashOtpCode, isValidEmail, normalizeEmail, safeEqual } from '~~/server/utils/security'

const MAX_OTP_ATTEMPTS = 5

interface OtpRow {
  id: string
  email: string
  email_normalized: string
  code_hash: string
  attempts: number
  consumed_at: Date | string | null
  expires_at: Date | string
}

export interface OtpUserRow {
  id: string
  email: string
  email_verified_at: Date | string | null
  is_admin: boolean
  created_at: Date | string
  updated_at: Date | string
}

export type OtpVerificationResult =
  | { status: 'invalid' }
  | { status: 'too-many-attempts' }
  | { status: 'verified', user: OtpUserRow }

export async function verifyOtpChallenge(
  client: pg.PoolClient,
  otpId: string,
  code: string,
): Promise<OtpVerificationResult> {
  await client.query('BEGIN')

  try {
    const otpResult = await client.query<OtpRow>(
      `
        SELECT id, email, email_normalized, code_hash, attempts, consumed_at, expires_at
        FROM otp_challenges
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [otpId],
    )
    const challenge = otpResult.rows[0]

    let result: OtpVerificationResult
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
      result = { status: 'invalid' }
    }
    else if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      result = { status: 'too-many-attempts' }
    }
    else {
      // Count the attempt while the challenge row is locked. Invalid outcomes are
      // returned only after COMMIT so concurrent requests cannot lose increments.
      await client.query(
        'UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1',
        [challenge.id],
      )

      const expected = hashOtpCode(challenge.id, code)
      if (!safeEqual(expected, challenge.code_hash)) {
        result = { status: 'invalid' }
      }
      else {
        const emailNormalized = normalizeEmail(challenge.email_normalized)
        if (!isValidEmail(emailNormalized)) {
          result = { status: 'invalid' }
        }
        else {
          await client.query(
            'UPDATE otp_challenges SET consumed_at = now() WHERE id = $1',
            [challenge.id],
          )

          const existing = await client.query<OtpUserRow>(
            `
              SELECT id, email, email_verified_at, is_admin, created_at, updated_at
              FROM users
              WHERE email_normalized = $1
              LIMIT 1
            `,
            [emailNormalized],
          )

          let row = existing.rows[0]
          if (row) {
            const updated = await client.query<OtpUserRow>(
              `
                UPDATE users
                SET email = $2,
                    email_verified_at = COALESCE(email_verified_at, now()),
                    updated_at = now()
                WHERE id = $1
                RETURNING id, email, email_verified_at, is_admin, created_at, updated_at
              `,
              [row.id, challenge.email],
            )
            row = updated.rows[0]
          }
          else {
            const inserted = await client.query<OtpUserRow>(
              `
                INSERT INTO users (id, email, email_normalized, email_verified_at)
                VALUES ($1, $2, $3, now())
                RETURNING id, email, email_verified_at, is_admin, created_at, updated_at
              `,
              [createId('usr'), challenge.email, emailNormalized],
            )
            row = inserted.rows[0]
          }

          if (!row) throw new Error('OTP verification did not produce a user row.')
          result = { status: 'verified', user: row }
        }
      }
    }

    await client.query('COMMIT')
    return result
  }
  catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
