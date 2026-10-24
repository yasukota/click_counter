import { neon } from "@neondatabase/serverless";
import { getAccess } from "@/lib/access";
import { getAppOrigin } from "@/lib/auth-policy";

async function updateCount(action: "read" | "add" | "reset") {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing");

  const sql = neon(url);

  if (action === "read") {
    return sql`SELECT count FROM counters WHERE id = 1`;
  }

  if (action === "add") {
    return sql`UPDATE counters
               SET count = count + 1
               WHERE id = 1
               RETURNING count`;
  }

  return sql`UPDATE counters
             SET count = 0
             WHERE id = 1
             RETURNING count`;
}

async function handle(action: "read" | "add" | "reset", request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const access = await getAccess();
    if (access !== "allowed") {
      const status = access === "unconfigured" ? 503 : access === "unauthenticated" ? 401 : 403;
      return Response.json({ error: "この操作は許可されていません" }, { status, headers });
    }

    // Cookie authentication alone must not allow cross-site mutations.
    if (action !== "read" && request.headers.get("origin") !== getAppOrigin()) {
      return Response.json({ error: "この操作は許可されていません" }, { status: 403, headers });
    }

    const rows = await updateCount(action);

    if (rows.length === 0) {
      return Response.json(
        { error: "Counter not found" },
        { status: 404, headers }
      );
    }

    return Response.json({ count: rows[0].count }, { headers });
  } catch {
    console.error("カウンターの処理に失敗しました。");
    return Response.json(
      { error: "Database error" },
      { status: 500, headers }
    );
  }
}

export async function GET(request: Request) {
  return handle("read", request);
}

export async function POST(request: Request) {
  return handle("add", request);
}

export async function DELETE(request: Request) {
  return handle("reset", request);
}
