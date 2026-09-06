import { countOrgs } from '@/lib/repos/orgs'

// This page reads from the database on every request. It exists only to prove
// the DB connection works in production, so it must never be prerendered.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const count = await countOrgs()

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-2xl font-medium">{count} orgs</p>
    </main>
  )
}
