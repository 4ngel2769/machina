import NextAuth, { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        // Import user storage functions dynamically (only runs on server, not in Edge)
        const { getUserByUsername, verifyPassword, updateLastLogin } = await import('./user-storage');
        const { logAudit } = await import('../audit-logger');
        
        const user = getUserByUsername(credentials.username as string);
        
        if (!user) {
          // Log failed login attempt
          await logAudit({
            userId: 'unknown',
            username: credentials.username as string,
            action: 'login',
            resourceType: 'auth',
            success: false,
            errorMessage: 'User not found',
          });
          return null;
        }

        const isValidPassword = await verifyPassword(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValidPassword) {
          // Log failed login attempt
          await logAudit({
            userId: user.id,
            username: user.username,
            action: 'login',
            resourceType: 'auth',
            success: false,
            errorMessage: 'Invalid password',
          });
          return null;
        }

        // Update last login
        updateLastLogin(user.id);

        // Log successful login
        await logAudit({
          userId: user.id,
          username: user.username,
          action: 'login',
          resourceType: 'auth',
          success: true,
        });

        // Return user without password
        return {
          id: user.id,
          name: user.username,
          email: user.username, // NextAuth requires email field
          role: user.role,
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as 'admin' | 'user';
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET || 'machina-super-secret-change-in-production',
  trustHost: true, // Trust all hosts (required for production deployment on different IPs)
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
