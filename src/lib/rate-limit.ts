interface RateLimitRecord {
  attempts: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitRecord>()

// Clean up expired records every 10 minutes to prevent memory leak
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetTime) {
        rateLimitStore.delete(key)
      }
    }
  }, 10 * 60 * 1000).unref?.()
}

export function checkRateLimit(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000 // 15 minutes window
): { allowed: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now()
  const record = rateLimitStore.get(identifier)

  if (!record || now > record.resetTime) {
    rateLimitStore.set(identifier, {
      attempts: 1,
      resetTime: now + windowMs,
    })
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetInSeconds: Math.ceil(windowMs / 1000),
    }
  }

  if (record.attempts >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.ceil((record.resetTime - now) / 1000),
    }
  }

  record.attempts += 1
  return {
    allowed: true,
    remaining: maxAttempts - record.attempts,
    resetInSeconds: Math.ceil((record.resetTime - now) / 1000),
  }
}

export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier)
}
