import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token =
    authHeader?.replace('Bearer ', '') || req.cookies.get('saas_auth_token')?.value

  if (!token) {
    return NextResponse.json({ ok: false, error: 'No token provided' }, { status: 401 })
  }

  const session = await verifySessionToken(token)
  if (!session?.userId) {
    return NextResponse.json({ ok: false, error: 'Invalid or expired token' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true },
  })

  if (!user) {
    return NextResponse.json({ ok: false, error: 'User does not exist' }, { status: 401 })
  }

  return NextResponse.json({ ok: true, userId: user.id })
}
