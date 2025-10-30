import { RateLimiterMemory } from 'rate-limiter-flexible';
import { NextRequest, NextResponse } from 'next/server';

// Create rate limiters for different endpoints
const rateLimiters = {
  // General API - 100 requests per minute
  api: new RateLimiterMemory({
    points: 100, // Number of requests
    duration: 60, // Per 60 seconds
  }),
  
  // Authentication - 10 attempts per minute (stricter)
  auth: new RateLimiterMemory({
    points: 10,
    duration: 60,
  }),
  
  // Resource creation - 20 per minute
  create: new RateLimiterMemory({
    points: 20,
    duration: 60,
  }),
};

/**
 * Rate limit middleware
 * @param request - The incoming request
 * @param identifier - Unique identifier (user ID, IP, etc.)
 * @param type - Type of rate limiter to use
 * @returns NextResponse or null if allowed
 */
export async function rateLimit(
  request: NextRequest,
  identifier: string,
  type: keyof typeof rateLimiters = 'api'
): Promise<NextResponse | null> {
  const limiter = rateLimiters[type];
  
  try {
    await limiter.consume(identifier, 1);
    return null; // Allow the request
  } catch (error) {
    const rateLimiterRes = error as { msBeforeNext: number; remainingPoints: number };
    const resetTime = new Date(Date.now() + rateLimiterRes.msBeforeNext);
    
    return NextResponse.json(
      {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000),
        resetAt: resetTime.toISOString(),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rateLimiterRes.msBeforeNext / 1000)),
          'X-RateLimit-Limit': String(limiter.points),
          'X-RateLimit-Remaining': String(rateLimiterRes.remainingPoints),
          'X-RateLimit-Reset': resetTime.toISOString(),
        },
      }
    );
  }
}

/**
 * Get identifier for rate limiting (user ID or IP address)
 */
export function getRateLimitIdentifier(request: NextRequest, userId?: string): string {
  if (userId) {
    return `user:${userId}`;
  }
  
  // Fallback to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
  return `ip:${ip}`;
}
