import { loadEnvConfig } from '@next/env'

import { db } from '../lib/db'
import { orgs } from './schema'

// Load env the same way Next.js does: .env, then .env.local (gitignored) wins.
loadEnvConfig(process.cwd())

async function seed() {
  // Idempotent: the unique slug means re-running is a no-op.
  await db
    .insert(orgs)
    .values({ slug: 'demo', name: 'Demo Facilities' })
    .onConflictDoNothing({ target: orgs.slug })

  const rows = await db.select().from(orgs)
  console.log(`Seed complete. ${rows.length} org(s):`)
  for (const row of rows) {
    console.log(`  - ${row.slug} (${row.name})`)
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
