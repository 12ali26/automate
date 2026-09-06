import { NextResponse, type NextRequest } from 'next/server'

/**
 * Makes the current path available to server components as the `x-pathname`
 * request header, so requireStaffSession can build the ?next= redirect back to
 * where the user was heading. Deliberately does no DB work: slug -> org id
 * resolution needs the Postgres driver and happens in the [org] layout.
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
}
