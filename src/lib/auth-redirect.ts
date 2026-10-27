/**
 * Safely resolves post-auth redirection paths.
 * Prevents open redirects, protocol-relative attacks, backslash escapes,
 * control character injection, and circular redirects to login/signup pages.
 */
export function resolveAuthRedirect(rawFrom: unknown, fallback: string = '/dashboard'): string {
  if (typeof rawFrom !== 'string' || !rawFrom.startsWith('/')) {
    return fallback
  }

  try {
    const u = new URL(rawFrom, 'http://x')
    if (
      u.origin === 'http://x' &&
      !u.pathname.startsWith('/login') &&
      !u.pathname.startsWith('/signup')
    ) {
      return u.pathname + u.search
    }
  } catch {
    return fallback
  }

  return fallback
}
