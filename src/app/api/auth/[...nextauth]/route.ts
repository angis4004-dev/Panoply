import NextAuth, { type AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getUserByEmail, updateUser, createUser } from '@/lib/auth-store';

// Annotated rather than inferred so the callback parameters pick up NextAuth's
// own types. Left bare, each destructured argument is an implicit any under
// strict mode, and the object as a whole then fails to satisfy AuthOptions.
const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.SESSION_SECRET,
  callbacks: {
    async signIn({ user, account: _account, profile }) {
      // user: { name, email, image }
      // profile: { sub, name, email, picture, ... }
      try {
        const email = user.email;
        if (!email) {
          return false;
        }

        const existingUser = await getUserByEmail(email);
        if (existingUser) {
          // User exists, update with Google data
          await updateUser(existingUser.id, {
            name: user.name ?? existingUser.name,
            email: user.email ?? existingUser.email,
            image: user.image ?? existingUser.image,
            googleId: profile?.sub,
          });
        } else {
          // User does not exist, create a new one
          await createUser({
            email: user.email!,
            name: user.name!,
            // Google may return null for a missing avatar; the store expects
            // the field absent rather than explicitly null.
            image: user.image ?? undefined,
            role: 'Trader', // default role for new users
            createdAt: new Date().toISOString(),
            googleId: profile?.sub,
          });
        }
        return true;
      } catch (error) {
        console.error('Error in NextAuth signIn callback:', error);
        return false;
      }
    },
    async jwt({ token, user }) {
      // This is called when creating or updating the JWT token.
      // We want to store the user data we need for the session in the token.
      if (user) {
        // user is the OAuth user object (from Google)
        const email = user.email;
        if (email) {
          const dbUser = await getUserByEmail(email);
          if (dbUser) {
            // Map the dbUser to the token shape we want for the session.
            // We'll include the fields we need for the session: id, email, name, role, createdAt.
            return {
              id: dbUser.id,
              email: dbUser.email,
              name: dbUser.name,
              role: dbUser.role,
              // We don't have picture in AuthUser, but we can keep it in the token if needed.
              picture: dbUser.image,
              // We'll store the createdAt from the user (when the user was created)
              createdAt: dbUser.createdAt,
              // Carried so an OAuth session can be revoked on the same terms
              // as a password one - getSessionFromRequest compares this
              // against the stored value on every request.
              tokenVersion: 'tokenVersion' in dbUser ? ((dbUser.tokenVersion as number) ?? 0) : 0,
            };
          }
        }
      }
      // If we don't have a user from the provider or we didn't find in DB, return the token as is (which will be the default JWT token from NextAuth)
      return token;
    },
    async session({ session, token }) {
      // This is called when a session is checked.
      // We want to set the session.user to be the object we stored in the token.
      if (token) {
        // NextAuth's DefaultSession['user'] carries only name/email/image. The
        // app has always attached id, role and createdAt here and read them
        // downstream; the cast states that rather than widening the library's
        // type globally, which would affect every consumer of Session.
        session.user = {
          id: token.id as string,
          email: token.email as string,
          name: token.name as string,
          role: token.role as 'Admin' | 'Trader',
          createdAt: token.createdAt as string,
        } as typeof session.user;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
