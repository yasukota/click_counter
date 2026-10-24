import "server-only";

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedEmail, isAuthConfigured } from "@/lib/auth-policy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ account, profile }) {
      return (
        isAuthConfigured() &&
        account?.provider === "google" &&
        profile?.email_verified === true &&
        isAllowedEmail(profile.email)
      );
    },
    jwt({ token, account, profile }) {
      // Only Google's verified OAuth result may establish the identity.
      // Ignore client-supplied session updates.
      if (account) {
        token.googleEmailVerified =
          account.provider === "google" && profile?.email_verified === true;
        token.email = token.googleEmailVerified ? profile?.email : null;
      }
      return token;
    },
    session({ session, token }) {
      session.user.email = token.email ?? "";
      session.user.googleEmailVerified = token.googleEmailVerified === true;
      return session;
    },
  },
  logger: {
    // Do not print OAuth credentials, tokens, or provider error details.
    error() {
      console.error("認証処理に失敗しました。認証設定を確認してください。");
    },
  },
});
