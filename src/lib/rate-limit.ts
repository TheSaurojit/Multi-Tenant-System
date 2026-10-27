import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

interface RateLimitRecord {
  attempts: number
  resetTime: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetInSeconds: number
}

// In-memory fallback store for local development, test environments, or when Upstash is unconfigured
const inMemoryStore = new Map<string, RateLimitRecord>()

// Periodically clean up expired records in memory
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of inMemoryStore.entries()) {
      if (now > record.resetTime) {
        inMemoryStore.delete(key)
      }
    }
  }, 10 * 60 * 1000).unref?.()
}

// Initialize Upstash Redis client if credentials are configured
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

export const isUpstashConfigured = Boolean(upstashUrl && upstashToken)

const redisClient: Redis | null = isUpstashConfigured
  ? new Redis({
      url: upstashUrl!,
      token: upstashToken!,
    })
  : null

const upstashLimiters = new Map<string, Ratelimit>()

function getUpstashLimiter(redis: Redis, maxAttempts: number, windowMs: number): Ratelimit {
  const cacheKey = `${maxAttempts}:${windowMs}`
  let limiter = upstashLimiters.get(cacheKey)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxAttempts, `${windowMs} ms`),
      prefix: 'saas_rl',
    })
    upstashLimiters.set(cacheKey, limiter)
  }
  return limiter
}

/**
 * Distributed rate limiter.
 * Backed by Upstash Redis (@upstash/ratelimit) when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN environment variables are set. This prevents rate-limit
 * bypasses across multiple Vercel serverless function instances and cold starts.
 *
 * Falls back to an in-memory sliding window store in local dev / test suites.
 */
export async function checkRateLimit(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000 // 15 minutes window
): Promise<RateLimitResult> {
  if (redisClient) {
    try {
      const limiter = getUpstashLimiter(redisClient, maxAttempts, windowMs)
      const res = await limiter.limit(identifier)
      const now = Date.now()
      const resetInSeconds = Math.max(0, Math.ceil((res.reset - now) / 1000))

      return {
        allowed: res.success,
        remaining: res.remaining,
        resetInSeconds,
      }
    } catch (err) {
      console.error('[RateLimit:Upstash] Failed to check rate limit with Upstash, falling back to in-memory store:', err)
    }
  }

  // In-memory sliding window fallback
  const now = Date.now()
  const record = inMemoryStore.get(identifier)

  if (!record || now > record.resetTime) {
    inMemoryStore.set(identifier, {
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

export async function resetRateLimit(identifier: string): Promise<void> {
  inMemoryStore.delete(identifier)

  if (redisClient) {
    try {
      for (const limiter of upstashLimiters.values()) {
        await limiter.resetUsedTokens(identifier)
      }
      const keys = await redisClient.keys(`saas_rl:*${identifier}*`)
      if (keys.length > 0) {
        await redisClient.del(...keys)
      }
    } catch (err) {
      console.error('[RateLimit:Upstash] Failed to reset rate limit tokens in Upstash:', err)
    }
  }
}
