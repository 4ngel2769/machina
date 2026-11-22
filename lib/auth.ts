/**
 * next-auth configuration: credentials provider, JWT session and role lookup.
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { headers } from 'next/headers';
import { rawDb } from '@/lib/db';
import { verifyPassword, hashPassword, rateLimit, resetRateLimit } from '@/lib/core/crypto';
import { resolveToken, TOKEN_PREFIX } from '@/lib/services/apitoken';

/**
 * Client address for the IP-level throttle. Cloudflare overwrites
 * CF-Connecting-IP on every request, so the caller cannot forge it; nginx
 * sets X-Real-IP on direct access. X-Forwarded-For is a last resort and is
 * deliberately not trusted as the only limit — the account key below is the
 * authoritative one.
 */
function firstHeader(source: Headers, names: string[]): string {
  for (const name of names) {
    const value = source.get(name)?.trim();
    if (value) return value;
  }
  return 'unknown';
}

function requestIp(req: unknown): string {
  const hasHeaders = typeof req === 'object' && req !== null && 'headers' in req;
  const source = hasHeaders ? new Headers((req as Request).headers) : new Headers();
  const trusted = firstHeader(source, ['cf-connecting-ip', 'x-real-ip']);
  if (trusted !== 'unknown') return trusted;
  return source.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

/** A real bcrypt hash. Unknown names are compared against it so a missing
 *  user costs the same as a wrong password and cannot be timed out. */
const DUMMY_HASH = hashPassword('machina-login-timing-dummy');

type UserRow = {
  id: string; name: string; role: string;
  password_hash: string | null; session_epoch: number;
};

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
  return rawDb().prepare('select id, name, role, password_hash, session_epoch from users where name=?').get(name) as
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
      /** Throttle per account AND per client address. The account key cannot
       *  be reset by spoofing a proxy header; the IP key catches distributed
       *  guessing. Both buckets are cleared on success. */
      authorize(creds, req) {
        const bag = readCreds(creds);
        if (!bag) return null;
        const accountKey = `auth:account:${bag.name.toLowerCase()}`;
        const ipKey = `auth:ip:${requestIp(req)}`;
        if (!rateLimit(accountKey, 8, 5 * 60_000) || !rateLimit(ipKey, 40, 5 * 60_000)) return null;
        const row = findUser(bag.name);
        // One comparison either way: an unknown name must not return early.
        const matched = verifyPassword(bag.password, row?.password_hash ?? DUMMY_HASH);
        if (!row?.password_hash || !matched) return null;
        resetRateLimit(accountKey);
        resetRateLimit(ipKey);
        return { id: row.id, name: row.name, role: row.role, sessionEpoch: row.session_epoch };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role?: string }).role ?? 'user';
        token.epoch = (user as { sessionEpoch?: number }).sessionEpoch ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { epoch?: number }).epoch = Number(token.epoch ?? 0);
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

/** Validate a session cookie against the row it was minted from. */
async function userFromSession(): Promise<TokenUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const id = String((session.user as { id: string }).id);
  const epoch = Number((session.user as { epoch?: number }).epoch ?? 0);
  // The database is the authority for role and session validity: a demoted
  // admin or a password change takes effect before the JWT would expire.
  const row = rawDb().prepare('select id, name, role, session_epoch from users where id=?').get(id) as
    | { id: string; name: string; role: string; session_epoch: number }
    | undefined;
  if (!row || Number(row.session_epoch ?? 0) !== epoch) return null;
  return { id: row.id, name: row.name, role: row.role };
}

/** Session guard for API routes and pages. Accepts a next-auth session OR a
 *  machina_ bearer token; the token path exists so scripts and integrations
 *  can call the same routes without a cookie jar. */
export async function requireUser(): Promise<{ id: string; name: string; role: string } | null> {
  const sessionUser = await userFromSession();
  if (sessionUser) return sessionUser;
  const headerList = await headers();
  const authHeader = headerList.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const secret = authHeader.slice(7).trim();
  if (!secret.startsWith(TOKEN_PREFIX)) return null;
  return userFromToken(secret);
}
