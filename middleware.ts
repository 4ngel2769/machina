import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ['/login'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // API auth routes
  const isAuthApi = pathname.startsWith('/api/auth');

  // Allow public routes and auth API
  if (isPublicRoute || isAuthApi) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionToken = request.cookies.get('authjs.session-token')?.value || 
                       request.cookies.get('__Secure-authjs.session-token')?.value;

  // Redirect to login if not authenticated
  if (!sessionToken) {
    const url = new URL('/login', request.url);
    url.searchParams.set('callbackUrl', pathname);
    url.searchParams.set('error', 'SessionRequired');
    return NextResponse.redirect(url);
  }

  // For admin-only routes, we'll check permissions in the page itself
  // because we can't decode JWT in Edge runtime easily
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
