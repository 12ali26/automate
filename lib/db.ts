import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Relative import (not the "@/" alias) so this module also resolves when run
// outside Next.js, e.g. by the seed script via tsx.
import * as schema from '../db/schema'

type Db = PostgresJsDatabase<typeof schema>

// Reuse a single connection across hot reloads in development so we do not
// exhaust Postgres connection slots.
const globalForDb = globalThis as unknown as {
  __sqlClient?: ReturnType<typeof postgres>
  __db?: Db
}

function createDb(): Db {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and fill in the connection string.',
    )
  }

  const client =
    globalForDb.__sqlClient ?? postgres(connectionString, { prepare: false })

  if (process.env.NODE_ENV !== 'production') {
    globalForDb.__sqlClient = client
  }

  return drizzle(client, { schema })
}

function getDb(): Db {
  const existing = globalForDb.__db ?? createDb()
  if (process.env.NODE_ENV !== 'production') {
    globalForDb.__db = existing
  }
  return existing
}

// The single Drizzle client instance. Connecting is deferred to first use so
// that merely importing this module has no side effects (needed for `next
// build`, which loads route modules to read their config).
//
// This is the ONLY file that imports the postgres driver; every other module
// reaches the database through lib/repos/*.
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb()
    const value = Reflect.get(real, prop, receiver)
    return typeof value === 'function' ? value.bind(real) : value
  },
}) as Db
