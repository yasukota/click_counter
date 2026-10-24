"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { hasAllowedEmails, isAuthConfigured } from "@/lib/auth-policy";

export async function login() {
  if (!isAuthConfigured() || !hasAllowedEmails()) {
    redirect("/login?error=Configuration");
  }
  try {
    await signIn("google", { redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=SignIn");
    throw error;
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
