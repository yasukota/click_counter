import { neon } from "@neondatabase/serverless";

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

async function handle(action: "read" | "add" | "reset") {
  try {
    const rows = await updateCount(action);

    if (rows.length === 0) {
      return Response.json(
        { error: "Counter not found" },
        { status: 404 }
      );
    }

    return Response.json({ count: rows[0].count });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Database error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return handle("read");
}

export async function POST() {
  return handle("add");
}

export async function DELETE() {
  return handle("reset");
}
