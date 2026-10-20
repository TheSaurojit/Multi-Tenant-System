import 'server-only'
import { headers } from 'next/headers'

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
const IPV6_REGEX = /^[0-9a-fA-F:]{2,45}$/

export function sanitizeIp(ip: string | undefined | null): string | null {
  if (!ip) return null
  const cleaned = ip.trim().slice(0, 45)
  if (IPV4_REGEX.test(cleaned) || IPV6_REGEX.test(cleaned)) {
    return cleaned
  }
  return null
}

/**
 * Returns the verified client IP for the current request, or null if the client
 * IP cannot be verified safely.
 *
 * Security considerations:
 * Only trusts proxy headers if explicitly configured via TRUSTED_IP_HEADER (e.g. 'cf-connecting-ip',
 * 'x-real-ip', 'x-forwarded-for') or when running in a detected platform environment (like Vercel).
 * Blindly trusting arbitrary incoming headers allows attackers to forge headers (e.g. rotating
 * cf-connecting-ip) to bypass rate limits or pollute audit logs.
 *
 * If no trusted proxy header is configured or valid:
 * - In development or test environments, returns '127.0.0.1' for convenient local testing.
 * - In production, returns null so callers can skip per-IP rate-limiting instead of
 *   collapsing all clients onto 127.0.0.1 and locking out the entire site.
 */
export async function getClientIp(): Promise<string | null> {
  try {
    const headerList = await headers()

    // 1. Explicit trusted header configured via environment variable
    const configuredHeader = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase()

    if (configuredHeader) {
      if (configuredHeader === 'x-forwarded-for') {
        const forwarded = headerList.get('x-forwarded-for')
        if (forwarded) {
          const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean)
          if (parts.length > 0) {
            const ip = sanitizeIp(parts[parts.length - 1]) || sanitizeIp(parts[0])
            if (ip) return ip
          }
        }
      } else {
        const val = headerList.get(configuredHeader)?.trim()
        const ip = sanitizeIp(val?.split(',')[0])
        if (ip) return ip
      }
      return null
    }

    // 2. Platform auto-detection: Vercel environment
    if (process.env.VERCEL) {
      const vercelForwardedFor = headerList.get('x-vercel-forwarded-for')?.trim()
      const ip = sanitizeIp(vercelForwardedFor?.split(',')[0])
      if (ip) return ip
    }

    // 3. Local development / test fallback
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      return '127.0.0.1'
    }

    // In production without trusted proxy configuration, do not forge or share 127.0.0.1
    return null
  } catch {
    // Non-request scope (e.g. background tasks or seed scripts)
    return null
  }
}

