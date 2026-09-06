import type { ReactNode } from 'react'

import { notFound } from 'next/navigation'

import { IdentityBar } from '@/components/IdentityBar'
import { getStaffSession } from '@/lib/auth/session'
import { findBySlug } from '@/lib/repos/orgs'

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params

  const org = await findBySlug(slug)
  if (!org) notFound()

  const session = await getStaffSession(org.id)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white">
      {session ? <IdentityBar orgSlug={slug} fullName={session.fullName} /> : null}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
