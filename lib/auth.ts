import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { rawDb } from '@/lib/db';
import { verifyPassword, rateLimit } from '@/lib/core/crypto';

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
        const name = typeof creds?.username === 'string' ? creds.username.trim() : '';
        const pass = typeof creds?.password === 'string' ? creds.password : '';
        if (!name || !pass) return null;
        const ip = (req && 'headers' in req ? new Headers((req as Request).headers) : new Headers())
          .get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
        if (!rateLimit(`auth:${name}@${ip}`, 8, 5 * 60_000)) return null; // >8 tries / 5min == locked out
        const row = rawDb().prepare('select id, name, role, password_hash from users where name=?').get(name) as
          | { id: string; name: string; role: string; password_hash: string | null }
          | undefined;
        if (!row || !row.password_hash) return null;
        if (!verifyPassword(pass, row.password_hash)) return null;
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

/** Session guard for API routes and pages. */
export async function requireUser(): Promise<{ id: string; name: string; role: string } | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: String((session.user as { id: string }).id),
    name: String(session.user.name ?? ''),
    role: String((session.user as { role?: string }).role ?? 'user'),
  };
}
