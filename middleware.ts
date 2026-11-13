/**
 * Request middleware: stamps the requested path so an auth redirect can return to it.
 */
import { NextRequest, NextResponse } from 'next/server';

/**
 * Stamps the request path onto a header so server components (the dash
 * layout's auth bounce) can send the user back to exactly where they were
 * after sign-in. Next does not expose the pathname to layouts otherwise.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
