import pg from 'pg'
import { createError } from 'h3'

const { Pool } = pg

let pool: pg.Pool | null = null
let migrationPromise: Promise<void> | null = null

interface SchemaMigration {
  version: number
  name: string
  sql: string
}

const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  {
    version: 1,
    name: 'baseline',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        email text NOT NULL,
        email_normalized text NOT NULL UNIQUE,
        email_verified_at timestamptz,
        is_admin boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS auth_sessions_token_hash_idx ON auth_sessions(token_hash);
      CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);

      CREATE TABLE IF NOT EXISTS otp_challenges (
        id text PRIMARY KEY,
        email text NOT NULL,
        email_normalized text NOT NULL,
        code_hash text NOT NULL,
        ip_hash text NOT NULL,
        user_agent text,
        attempts integer NOT NULL DEFAULT 0,
        consumed_at timestamptz,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS otp_challenges_email_created_idx ON otp_challenges(email_normalized, created_at DESC);
      CREATE INDEX IF NOT EXISTS otp_challenges_ip_created_idx ON otp_challenges(ip_hash, created_at DESC);

      CREATE TABLE IF NOT EXISTS email_send_events (
        id bigserial PRIMARY KEY,
        email_normalized text NOT NULL,
        ip_hash text NOT NULL,
        purpose text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS email_send_events_email_created_idx ON email_send_events(email_normalized, created_at DESC);
      CREATE INDEX IF NOT EXISTS email_send_events_ip_created_idx ON email_send_events(ip_hash, created_at DESC);

      CREATE TABLE IF NOT EXISTS ai_generation_events (
        id bigserial PRIMARY KEY,
        user_id text,
        ip_hash text NOT NULL,
        model text NOT NULL,
        prompt_hash text NOT NULL,
        status text NOT NULL DEFAULT 'started',
        error_code text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      ALTER TABLE ai_generation_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'started';
      ALTER TABLE ai_generation_events ADD COLUMN IF NOT EXISTS error_code text;

      CREATE INDEX IF NOT EXISTS ai_generation_events_user_created_idx ON ai_generation_events(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ai_generation_events_ip_created_idx ON ai_generation_events(ip_hash, created_at DESC);

      CREATE TABLE IF NOT EXISTS projects (
        id text PRIMARY KEY,
        owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
        client_project_id text NOT NULL,
        source_project_id text REFERENCES projects(id) ON DELETE SET NULL,
        is_demo boolean NOT NULL DEFAULT false,
        remix_count integer NOT NULL DEFAULT 0,
        public_style text,
        snapshot bytea,
        snapshot_filename text,
        snapshot_content_type text,
        snapshot_updated_at timestamptz,
        published_at timestamptz,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (owner_id, client_project_id)
      );

      CREATE INDEX IF NOT EXISTS projects_owner_updated_idx ON projects(owner_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS projects_public_idx ON projects(visibility, published_at DESC) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS projects_demo_idx ON projects(is_demo, visibility, updated_at DESC) WHERE deleted_at IS NULL;
    `,
  },
  {
    version: 2,
    name: 'release_0_1_hardening',
    sql: `
      CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS otp_challenges_expires_at_idx ON otp_challenges(expires_at);
      CREATE INDEX IF NOT EXISTS email_send_events_created_at_idx ON email_send_events(created_at);
      CREATE INDEX IF NOT EXISTS ai_generation_events_created_at_idx ON ai_generation_events(created_at);

      CREATE TABLE IF NOT EXISTS project_remix_events (
        id bigserial PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        actor_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS project_remix_events_actor_created_idx ON project_remix_events(actor_hash, created_at DESC);
      CREATE INDEX IF NOT EXISTS project_remix_events_project_actor_created_idx ON project_remix_events(project_id, actor_hash, created_at DESC);
      CREATE INDEX IF NOT EXISTS project_remix_events_created_at_idx ON project_remix_events(created_at);
    `,
  },
]

const RETENTION_CLEANUP_SQL = `
  DELETE FROM auth_sessions WHERE expires_at < now();
  DELETE FROM otp_challenges WHERE expires_at < now() - interval '7 days';
  DELETE FROM email_send_events WHERE created_at < now() - interval '30 days';
  DELETE FROM ai_generation_events WHERE created_at < now() - interval '30 days';
  DELETE FROM project_remix_events WHERE created_at < now() - interval '30 days';
`

function databaseUrl(): string {
  const config = useRuntimeConfig()
  const url = String(process.env.DATABASE_URL || config.databaseUrl || '')
  if (!url) {
    throw createError({
      statusCode: 503,
      statusMessage: 'DATABASE_URL is not configured.',
    })
  }
  return url
}

function sslConfig(url: string): pg.PoolConfig['ssl'] {
  if (process.env.PGSSLMODE === 'require' || /[?&]sslmode=require\b/i.test(url)) {
    return { rejectUnauthorized: false }
  }
  return undefined
}

export function getPool(): pg.Pool {
  if (!pool) {
    const url = databaseUrl()
    pool = new Pool({
      connectionString: url,
      ssl: sslConfig(url),
      max: 10,
      idleTimeoutMillis: 30_000,
    })
  }
  return pool
}

async function migrateSchema(): Promise<void> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('morti-schema-migrations'))")
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    const appliedResult = await client.query<{ version: number }>('SELECT version FROM schema_migrations')
    const applied = new Set(appliedResult.rows.map(row => Number(row.version)))

    for (const migration of SCHEMA_MIGRATIONS) {
      if (applied.has(migration.version)) continue
      await client.query(migration.sql)
      await client.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name],
      )
    }
    await client.query('COMMIT')
  }
  catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
  finally {
    client.release()
  }

  await getPool().query(RETENTION_CLEANUP_SQL)
}

export async function ensureSchema(): Promise<void> {
  migrationPromise ??= migrateSchema()
  await migrationPromise
}

export async function dbQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  await ensureSchema()
  return await getPool().query<T>(text, params)
}

export async function withDbClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema()
  const client = await getPool().connect()
  try {
    return await fn(client)
  }
  finally {
    client.release()
  }
}
