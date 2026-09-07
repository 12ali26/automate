import { findBySlug } from '@/lib/repos/orgs'

/**
 * Per-org web app manifest. It can't be a single static file because
 * `start_url` and `scope` are org-specific — installing from /acme/fleet must
 * open /acme/fleet, not some other tenant's.
 *
 * No service worker yet (that's the v2 offline groundwork); the manifest alone
 * is what makes the app installable.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ org: string }> },
) {
  const { org: slug } = await params
  const org = await findBySlug(slug)

  const label = org?.name ?? 'Automate'
  const manifest = {
    name: `${label} — Automate`,
    short_name: label,
    description: 'Shared machine tracking for facilities management',
    start_url: `/${slug}/fleet`,
    scope: `/${slug}/`,
    id: `/${slug}/`,
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#111827',
    background_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
