import { requireUser } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function err(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Cross-site write guard (CSRF belt+braces alongside SameSite=Lax cookies):
 *  state-changing JSON requests must carry a same-host Origin header. Browsers
 *  always send Origin on fetch POSTs; plain same-site navigations may omit it
 *  and non-browser clients (curl) are allowed through — session is the gate. */
export function guardMutation(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  let host = req.headers.get('host') ?? '';
  // behind CF tunnel + NPM, host header is intact (NPM preserves it)
  try {
    if (new URL(origin).host !== host) return err('cross-site request blocked', 403);
  } catch {
    return err('bad origin', 403);
  }
  return null;
}

/** Session guard. Returns [user, errorResponse]. */
export async function session(): Promise<
  [{ id: string; name: string; role: string }, null] | [null, NextResponse]
> {
  const user = await requireUser();
  if (!user) return [null, err('unauthorized', 401)];
  return [user, null];
}

export async function requireAdmin(): Promise<
  [{ id: string; name: string; role: string }, null] | [null, NextResponse]
> {
  const [user, e] = await session();
  if (e) return [null, e];
  if (user.role !== 'admin') return [null, err('admin only', 403)];
  return [user, null];
}

export function uuid(): string {
  return crypto.randomUUID();
}
