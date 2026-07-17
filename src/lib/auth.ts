import { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { isStaff, getRegistrationByEmail } from './sheets';
import bcrypt from 'bcryptjs';

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const registration = await getRegistrationByEmail(credentials.email);
          if (!registration || !registration.password_hash) {
            return null;
          }

          const passwordValid = bcrypt.compareSync(credentials.password, registration.password_hash);
          if (!passwordValid) {
            return null;
          }

          return {
            id: registration.row_id,
            name: registration.name,
            email: registration.user_email,
          };
        } catch (error) {
          console.error('NextAuth authorize credentials error:', error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (token.email) {
        try {
          // Check if this email is in the staff sheet allowlist
          token.isStaff = await isStaff(token.email);
        } catch (e) {
          console.error('Error checking staff status on JWT creation:', e);
          token.isStaff = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).isStaff = !!token.isStaff;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
};

