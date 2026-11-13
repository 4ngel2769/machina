/**
 * Shared route helpers: JSON/error responses, mutation guard and session checks.
 */
import { requireUser } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

export function json(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, { status });
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

/** Session guard. Exactly one of `user` / `response` is set, so callers
 *  destructure and guard on the one they need:
 *    const { user: admin, response } = await requireAdmin();
 *    if (!admin) return response; */
export type SessionUser = { id: string; name: string; role: string };

export type AuthResult =
  | { user: SessionUser; response: null }
  | { user: null; response: NextResponse };

export async function session(): Promise<AuthResult> {
  const user = await requireUser();
  if (!user) return { user: null, response: err('unauthorized', 401) };
  return { user, response: null };
}

export async function requireAdmin(): Promise<AuthResult> {
  const { user, response } = await session();
  if (!user) return { user: null, response };
  if (user.role !== 'admin') return { user: null, response: err('admin only', 403) };
  return { user, response: null };
}

export function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Parse a JSON request body through a zod schema. Two failure shapes collapse
 * to {} on purpose: unparseable JSON and a body that fails the schema both
 * mean "the fields the handler needs are absent", and every handler already
 * answers that with its own 400. Returning a typed record keeps `as {...}`
 * casts out of the routes; fields are still narrowed by the handlers.
 */
export async function jsonBody<S extends z.ZodTypeAny>(
  req: NextRequest,
  schema: S,
): Promise<z.infer<S> & Record<string, unknown>> {
  const raw = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(raw);
  return (parsed.success ? parsed.data : {}) as z.infer<S> & Record<string, unknown>;
}
