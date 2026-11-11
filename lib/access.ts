import "server-only";

import { connection } from "next/server";
import { auth } from "@/auth";
import { isAllowedEmail, isAuthConfigured } from "@/lib/auth-policy";

export async function getAccess(): Promise<"allowed" | "unauthenticated" | "forbidden" | "unconfigured"> {
  // Never prerender an environment-dependent authorization decision.
  await connection();
  if (!isAuthConfigured()) return "unconfigured";
  const session = await auth();
  if (!session?.user?.email || !session.user.googleEmailVerified) {
    return "unauthenticated";
  }
  // Check the current list on every request, including for existing sessions.
  return isAllowedEmail(session.user.email) ? "allowed" : "forbidden";
}
