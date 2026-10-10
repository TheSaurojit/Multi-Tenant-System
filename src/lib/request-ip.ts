import 'server-only'
import { headers } from 'next/headers'

/**
 * Returns the verified client IP for the current request.
 *
 * Security considerations:
 * 1. Checks trusted platform headers first (cf-connecting-ip, x-vercel-forwarded-for).
 * 2. Checks x-real-ip set by trusted reverse proxies.
 * 3. For standard x-forwarded-for, avoids trusting client-prepended spoofed IPs:
 *    proxies append IPs to the right of the header, so the rightmost hop is the
 *    immediate upstream client rather than a spoofed preamble.
 * 4. Caps length to 45 chars (max textual length of IPv6 address).
 */
export async function getClientIp(): Promise<string> {
  try {
    const headerList = await headers()

    // 1. Cloudflare connecting IP (verified at edge)
    const cfConnectingIp = headerList.get('cf-connecting-ip')?.trim()
    if (cfConnectingIp) {
      return cfConnectingIp.slice(0, 45)
    }

    // 2. Vercel verified client IP
    const vercelForwardedFor = headerList.get('x-vercel-forwarded-for')?.trim()
    if (vercelForwardedFor) {
      const vercelIp = vercelForwardedFor.split(',')[0]?.trim()
      if (vercelIp) return vercelIp.slice(0, 45)
    }

    // 3. Direct single-hop reverse proxy IP
    const realIp = headerList.get('x-real-ip')?.trim()
    if (realIp) {
      return realIp.slice(0, 45)
    }

    // 4. Standard X-Forwarded-For fallback (take rightmost trusted hop if proxy chain)
    const forwarded = headerList.get('x-forwarded-for')
    if (forwarded) {
      const parts = forwarded
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
      if (parts.length > 0) {
        // Take the last hop added by the outermost trusted edge/reverse proxy
        return parts[parts.length - 1].slice(0, 45)
      }
    }

    return '127.0.0.1'
  } catch {
    // Non-request scope (e.g. background tasks or seed scripts)
    return '127.0.0.1'
  }
}
