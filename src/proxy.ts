import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'multi-tenant-saas-jwt-secret-key-32-chars-long'
)

async function verifyTokenAndUser(request: NextRequest, token: string): Promise<boolean> {
  try {
    // 1. Check if token is cryptographically valid and not expired
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (!payload?.userId) return false

    // 2. Check if user actually exists in the database via internal verify endpoint
    const verifyUrl = new URL('/api/auth/verify', request.url)
    const res = await fetch(verifyUrl, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) return false
    const data = await res.json()
    return data?.ok === true
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const authToken = request.cookies.get('saas_auth_token')?.value

  const protectedPaths = ['/dashboard', '/datasets', '/reports', '/workspace']
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  const authPaths = ['/login', '/signup']
  const isAuthPage = authPaths.some((p) => pathname.startsWith(p))

  if (isProtected) {
    // If no token exists, immediately redirect to login
    if (!authToken) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Verify token validity and user existence
    const isValidUser = await verifyTokenAndUser(request, authToken)
    if (!isValidUser) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      const response = NextResponse.redirect(loginUrl)
      // Clear invalid/stale cookies
      response.cookies.delete('saas_auth_token')
      response.cookies.delete('saas_active_org')
      return response
    }
  }

  if (isAuthPage && authToken) {
    const isValidUser = await verifyTokenAndUser(request, authToken)
    if (isValidUser) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/datasets/:path*',
    '/reports/:path*',
    '/workspace/:path*',
    '/login',
    '/signup',
  ],
}
