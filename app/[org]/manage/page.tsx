import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getManagerSession } from '@/lib/auth/manager-session'
import { findBySlug } from '@/lib/repos/orgs'

import { ManagerLoginForm } from './ManagerLoginForm'

// Login state depends on a cookie — never cache.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ManageLoginPage({
  params,
}: {
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params

  const org = await findBySlug(slug)
  if (!org) notFound()

  const session = await getManagerSession(org.id)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {org.name}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-950">Manager sign in</h1>
      </div>

      {session ? (
        <div className="flex flex-col gap-4">
          <p className="text-gray-700">
            Signed in as <span className="font-semibold">{session.fullName}</span>.
          </p>
          <Link
            href={`/${slug}/manage/dashboard`}
            className="rounded-lg bg-gray-950 px-5 py-3 text-center text-base font-semibold text-white hover:bg-gray-800"
          >
            Go to dashboard
          </Link>
        </div>
      ) : (
        <ManagerLoginForm orgSlug={slug} />
      )}
    </main>
  )
}
