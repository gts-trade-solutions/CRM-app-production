// Authentication: NextAuth credentials provider over the users table.
// JWT sessions carry {id, role}; requireUser() is the single identity
// gate every API handler calls.

import { NextAuthOptions, getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { NextRequest } from 'next/server';
import { prisma } from './db';
import type { Role, User } from '@prisma/client';

/**
 * Checks email + password against the users table. Returns the user when
 * valid and active; null otherwise. Exported for direct testing.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<User | null> {
  const user = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase(), active: true },
  });
  if (!user?.passwordHash) return null;
  const ok = await compare(password, user.passwordHash);
  return ok ? user : null;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await verifyCredentials(
          credentials.email,
          credentials.password,
        );
        if (!user) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: Role }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.uid as string;
        (session.user as { role?: Role }).role = token.role as Role;
      }
      return session;
    },
  },
};

/**
 * Resolves the acting user for an API request.
 * Order: NextAuth session → x-user-id header (development only — the
 * scaffold that let the API be exercised before auth existed; it is
 * disabled outside development).
 */
export async function requireUser(req?: NextRequest): Promise<User | null> {
  const session = await getServerSession(authOptions);
  const sessionId = (session?.user as { id?: string } | undefined)?.id;
  if (sessionId) {
    return prisma.user.findFirst({ where: { id: sessionId, active: true } });
  }
  if (process.env.NODE_ENV === 'development' && req) {
    const headerId = req.headers.get('x-user-id');
    if (headerId) {
      return prisma.user.findFirst({ where: { id: headerId, active: true } });
    }
  }
  return null;
}
