/**
 * next-auth configuration: credentials provider, JWT session and role lookup.
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { headers } from 'next/headers';
import { rawDb } from '@/lib/db';
import { verifyPassword, rateLimit } from '@/lib/core/crypto';
import { resolveToken, TOKEN_PREFIX } from '@/lib/services/apitoken';

/** Client address for the login throttle: first x-forwarded-for hop. */
function requestIp(req: unknown): string {
  const hasHeaders = typeof req === 'object' && req !== null && 'headers' in req;
  const headers = hasHeaders ? new Headers((req as Request).headers) : new Headers();
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

type UserRow = { id: string; name: string; role: string; password_hash: string | null };

/** Username and password out of the provider's bag, or null when either missing. */
function readCreds(
  creds: Partial<Record<'username' | 'password', unknown>> | undefined,
): { name: string; password: string } | null {
  const name = typeof creds?.username === 'string' ? creds.username.trim() : '';
  const password = typeof creds?.password === 'string' ? creds.password : '';
  if (!name || !password) return null;
  return { name, password };
}

function findUser(name: string): UserRow | undefined {
  return rawDb().prepare('select id, name, role, password_hash from users where name=?').get(name) as
    | UserRow
    | undefined;
}

const authConfig = NextAuth({
  session: { strategy: 'jwt', maxAge: 12 * 3600 },
  pages: { signIn: '/signin' },
  providers: [
    Credentials({
      name: 'machina',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      /** Username + password against the users table. Per-name+IP attempt
       *  throttling (in-memory, single process) blunts brute force; success
       *  clears the bucket. */
      authorize(creds, req) {
        const credsBag = readCreds(creds);
        if (!credsBag) return null;
        if (!rateLimit(`auth:${credsBag.name}@${requestIp(req)}`, 8, 5 * 60_000)) return null; // >8 tries / 5min == locked out
        const row = findUser(credsBag.name);
        if (!row?.password_hash) return null;
        if (!verifyPassword(credsBag.password, row.password_hash)) return null;
        return { id: row.id, name: row.name, role: row.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role?: string }).role ?? 'user';
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
});

export const handlers = authConfig.handlers;
export const auth = authConfig.auth;
export const signIn = authConfig.signIn;
export const signOut = authConfig.signOut;

type TokenUser = { id: string; name: string; role: string };

/** Bearer-token path: resolve the secret, load the (still-active) user. */
async function userFromToken(secret: string): Promise<TokenUser | null> {
  const resolved = resolveToken(secret);
  if (!resolved) return null;
  const row = rawDb().prepare('select id, name, role from users where id=?').get(resolved.token.user_id) as
    | { id: string; name: string; role: string } | undefined;
  return row ?? null;
}

/** Session guard for API routes and pages. Accepts a next-auth session OR a
 *  machina_ bearer token; the token path exists so scripts and integrations
 *  can call the same routes without a cookie jar. */
export async function requireUser(): Promise<{ id: string; name: string; role: string } | null> {
  const session = await auth();
  if (session?.user?.id) {
    return {
      id: String((session.user as { id: string }).id),
      name: String(session.user.name ?? ''),
      role: String((session.user as { role?: string }).role ?? 'user'),
    };
  }
  const headerList = await headers();
  const authHeader = headerList.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const secret = authHeader.slice(7).trim();
  if (!secret.startsWith(TOKEN_PREFIX)) return null;
  return userFromToken(secret);
}
