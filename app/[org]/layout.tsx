import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { IdentityBar } from '@/components/IdentityBar'
import { getStaffSession } from '@/lib/auth/session'
import { findBySlug } from '@/lib/repos/orgs'

export const viewport: Viewport = {
  themeColor: '#111827',
}

// The manifest link must carry the org slug so an install from this tenant's
// pages opens this tenant's fleet. See app/[org]/manifest.webmanifest/route.ts.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string }>
}): Promise<Metadata> {
  const { org: slug } = await params
  return {
    manifest: `/${slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Automate' },
    icons: {
      icon: '/icons/icon-192.png',
      apple: '/icons/icon-192.png',
    },
  }
}

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

  // The manager area is desktop-first — no mobile shell, no staff identity bar.
  const pathname = (await headers()).get('x-pathname') ?? ''
  if (pathname === `/${slug}/manage` || pathname.startsWith(`/${slug}/manage/`)) {
    return <div className="min-h-screen bg-gray-50 text-gray-900">{children}</div>
  }

  const session = await getStaffSession(org.id)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white">
      {session ? <IdentityBar orgSlug={slug} fullName={session.fullName} /> : null}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
