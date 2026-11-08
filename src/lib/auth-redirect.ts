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
      const result = u.pathname + u.search
      // URL normalises dot-segments (%2e, ., ..) before we ever see u.pathname.
      // A crafted input like /.//example.com or /x/..//example.com normalises to
      // //example.com — a valid protocol-relative URL the browser treats as external.
      // Reject anything whose normalised output still starts with // or /\.
      if (result.startsWith('//') || result.startsWith('/\\')) {
        return fallback
      }
      return result
    }
  } catch {
    return fallback
  }

  return fallback
}
