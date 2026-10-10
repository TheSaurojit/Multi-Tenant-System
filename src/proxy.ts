import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is missing or shorter than 32 characters. Set a secure secret in .env.'
  )
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET)

async function isValidSessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return Boolean(payload?.userId)
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const authToken = request.cookies.get('saas_auth_token')?.value

  const protectedPaths = ['/dashboard', '/datasets', '/reports', '/workspace', '/organization']
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  const authPaths = ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email']
  const isAuthPage = authPaths.some((p) => pathname.startsWith(p))

  if (isProtected) {
    // If no token exists, immediately redirect to login
    if (!authToken) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Verify token cryptographically and check expiration (zero extra network hops)
    const valid = await isValidSessionToken(authToken)
    if (!valid) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('from', pathname)
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete('saas_auth_token')
      response.cookies.delete('saas_active_org')
      response.cookies.delete('saas_active_workspace')
      return response
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
    '/organization/:path*',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ],
}
