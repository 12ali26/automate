import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getStaffSession } from '@/lib/auth/session'
import { findBySlug } from '@/lib/repos/orgs'

import { FmIdForm } from './FmIdForm'

export default async function IdPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { org: slug } = await params
  const { next } = await searchParams

  const org = await findBySlug(slug)
  if (!org) notFound()

  const session = await getStaffSession(org.id)

  if (session) {
    return (
      <main className="flex flex-1 flex-col justify-center gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Signed in as {session.fullName}
          </h1>
          <p className="mt-1 text-gray-600">FM ID {session.fmId}</p>
        </div>
        <Link
          href={`/${slug}/fleet`}
          className="rounded-xl bg-gray-900 px-5 py-5 text-center text-xl font-semibold text-white active:bg-gray-700"
        >
          Continue
        </Link>
        <p className="text-sm text-gray-500">
          Not you? Use the button at the top of the screen to switch.
        </p>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Enter your FM ID</h1>
        <p className="mt-1 text-gray-600">{org.name}</p>
      </div>
      <FmIdForm orgSlug={slug} next={typeof next === 'string' ? next : null} />
    </main>
  )
}
