import { handlers } from "@/auth";
import type { NextRequest } from "next/server";
import { isAuthConfigured } from "@/lib/auth-policy";

function unavailable() {
  return Response.json(
    { error: "認証の設定が完了していません" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthConfigured()) return unavailable();
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthConfigured()) return unavailable();
  return handlers.POST(request);
}
