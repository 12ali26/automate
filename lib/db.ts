import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// Relative import (not the "@/" alias) so this module also resolves when run
// outside Next.js, e.g. by the seed script via tsx.
import * as schema from '../db/schema'

type Db = PostgresJsDatabase<typeof schema>

// Reuse one connection pool: memoised on the module (covers production, where
// the module is evaluated once) and mirrored onto globalThis so dev hot reloads
// reuse it too. Getting this wrong leaks a new pool per request and exhausts
// Postgres connection slots under load.
const globalForDb = globalThis as unknown as {
  __sqlClient?: ReturnType<typeof postgres>
  __db?: Db
}

let dbInstance: Db | undefined

function createDb(): Db {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and fill in the connection string.',
    )
  }

  const client = globalForDb.__sqlClient ?? postgres(connectionString, { prepare: false })
  globalForDb.__sqlClient = client

  return drizzle(client, { schema })
}

function getDb(): Db {
  if (dbInstance) return dbInstance
  dbInstance = globalForDb.__db ?? createDb()
  globalForDb.__db = dbInstance
  return dbInstance
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
