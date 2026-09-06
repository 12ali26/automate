import type { NextConfig } from 'next'

// When the app is reached through a reverse proxy (GitHub Codespaces port
// forwarding, in particular), the browser's Origin header is the public
// *.app.github.dev host while the server sees localhost. Next.js's Server
// Action CSRF check then rejects the request as cross-origin ("Invalid Server
// Actions request"). Trust the forwarded host in that case. Absent in
// production, so this is a no-op there.
const codespaceHost =
  process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : undefined

const allowedOrigins = [
  ...(codespaceHost ? [codespaceHost] : []),
  ...(process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? [`*.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`]
    : []),
]

const nextConfig: NextConfig = {
  ...(allowedOrigins.length > 0
    ? { experimental: { serverActions: { allowedOrigins } } }
    : {}),
}

export default nextConfig
