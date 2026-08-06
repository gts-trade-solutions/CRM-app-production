// API rate limiting (published limits — see README):
//   credential sign-in:  10 attempts / minute / IP  (brute-force guard)
//   API writes:          60 requests / minute / IP
//   API reads:          300 requests / minute / IP

import { NextRequest, NextResponse } from 'next/server';
import { checkLimit } from '@/lib/ratelimit';

export const config = {
  matcher: '/api/:path*',
};

export function middleware(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const path = req.nextUrl.pathname;

  let kind: 'auth' | 'write' | 'read';
  let limit: number;
  if (path.startsWith('/api/auth/callback/credentials')) {
    kind = 'auth';
    limit = 10;
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    kind = 'read';
    limit = 300;
  } else {
    kind = 'write';
    limit = 60;
  }

  const result = checkLimit(`${ip}:${kind}`, limit, 60_000);
  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Too many requests — slow down' },
      {
        status: 429,
        headers: { 'Retry-After': String(result.retryAfterSeconds) },
      },
    );
  }
  return NextResponse.next();
}
