import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { encode } from "next-auth/jwt";

// All credentials here are disposable fixtures, overriding .env.local in the
// child process. There is deliberately no usable database connection.
const base = "http://127.0.0.1:3101";
const secret = "local-http-test-only-not-a-real-auth-secret";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3101"], {
  stdio: "ignore",
  env: {
    ...process.env,
    AUTH_URL: base,
    AUTH_SECRET: secret,
    AUTH_GOOGLE_ID: "test-only-client",
    AUTH_GOOGLE_SECRET: "test-only-client-secret",
    ALLOWED_EMAILS: "owner@example.com",
    DATABASE_URL: "invalid-test-database-no-network-access",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});

async function request(path, options = {}) {
  return fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(15000) });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (server.exitCode !== null) throw new Error("Isolated test server failed to start");
    try {
      const response = await request("/api/auth/session");
      if (response.status === 200) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, "Isolated Auth.js server became ready");

  for (const method of ["GET", "POST", "DELETE"]) {
    const response = await request("/api/count", { method, headers: { Origin: base } });
    assert.equal(response.status, 401, `${method}: anonymous request rejected`);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  console.log("PASS: GET / POST / DELETE reject anonymous requests (401)");

  const cookieName = "authjs.session-token";
  const token = await encode({
    secret, salt: cookieName,
    token: { sub: "test-only-user", email: "other@example.com", googleEmailVerified: true },
  });
  for (const method of ["GET", "POST", "DELETE"]) {
    const response = await request("/api/count", { method, headers: { Origin: base, Cookie: `${cookieName}=${token}` } });
    assert.equal(response.status, 403, `${method}: valid session outside allowlist rejected`);
  }
  console.log("PASS: real encrypted session outside allowlist rejected (403), all API methods");

  const unverified = await encode({
    secret, salt: cookieName,
    token: { sub: "test-only-user", email: "owner@example.com", googleEmailVerified: false },
  });
  const unverifiedResponse = await request("/api/count", { headers: { Cookie: `${cookieName}=${unverified}` } });
  assert.equal(unverifiedResponse.status, 401);
  console.log("PASS: unverified identity rejected (401)");

  const tampered = await request("/api/count", { headers: { Cookie: `${cookieName}=invalid-token` } });
  assert.equal(tampered.status, 401);
  console.log("PASS: invalid session cookie rejected (401)");

  // A valid allowed session reaches only the Origin guard, not the DB.
  const allowed = await encode({
    secret, salt: cookieName,
    token: { sub: "test-only-user", email: "owner@example.com", googleEmailVerified: true },
  });
  for (const method of ["POST", "DELETE"]) {
    const response = await request("/api/count", { method, headers: { Cookie: `${cookieName}=${allowed}`, Origin: "https://other.example.com" } });
    assert.equal(response.status, 403);
  }
  console.log("PASS: allowed session cannot update from another site's Origin (403)");
} finally {
  const exited = once(server, "exit");
  server.kill("SIGINT");
  if (server.exitCode === null) await exited;
}
