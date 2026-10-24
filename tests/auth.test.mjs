import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Load the real source with explicit dependency doubles. No Next server,
// .env.local, Google service, or real database is used by these tests.
function load(file, mocks) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const loaded = { exports: {} };
  const fakeRequire = (name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected dependency in test: ${name}`);
  };
  // Only project source is evaluated, with no fallback to real dependencies.
  new Function("require", "module", "exports", outputText)(fakeRequire, loaded, loaded.exports);
  return loaded.exports;
}

test("server authorization and API protection", async (t) => {
  const names = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_URL", "ALLOWED_EMAILS", "DATABASE_URL"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  Object.assign(process.env, {
    AUTH_SECRET: "test-only-secret-which-is-at-least-32-characters",
    AUTH_GOOGLE_ID: "test-client",
    AUTH_GOOGLE_SECRET: "test-client-secret",
    AUTH_URL: "http://127.0.0.1:3000",
    ALLOWED_EMAILS: "owner@example.com, doctor@example.com",
    DATABASE_URL: "test-only-no-real-database",
  });
  const policy = load("lib/auth-policy.ts", {});

  await t.test("allowlist defaults to deny and compares whole addresses", () => {
    assert.equal(policy.isAllowedEmail(" OWNER@example.com "), true);
    assert.equal(policy.isAllowedEmail("other@example.com"), false);
    assert.equal(policy.isAllowedEmail("owner@example.com.evil.test"), false);
    assert.equal(policy.isAllowedEmail("owner+other@example.com"), false);
    assert.equal(policy.isAllowedEmail(null), false);
    process.env.ALLOWED_EMAILS = " , ";
    assert.equal(policy.isAllowedEmail("owner@example.com"), false);
    assert.equal(policy.hasAllowedEmails(), false);
    delete process.env.ALLOWED_EMAILS;
    assert.equal(policy.isAllowedEmail("owner@example.com"), false);
    process.env.ALLOWED_EMAILS = "owner@example.com, doctor@example.com";
  });

  await t.test("missing authentication settings and invalid URLs fail closed", () => {
    for (const name of names.slice(0, 4)) {
      const value = process.env[name];
      delete process.env[name];
      assert.equal(policy.isAuthConfigured(), false);
      process.env[name] = value;
    }
    process.env.AUTH_URL = "not-a-url";
    assert.equal(policy.isAuthConfigured(), false);
    process.env.AUTH_URL = "http://127.0.0.1:3000";
  });

  let config;
  load("auth.ts", {
    "next-auth": (options) => { config = options; return {}; },
    "next-auth/providers/google": () => ({}),
    "@/lib/auth-policy": policy,
  });
  await t.test("Google must provide a verified, allowed email", async () => {
    const signIn = config.callbacks.signIn;
    const input = { account: { provider: "google" }, profile: { email: "owner@example.com", email_verified: true } };
    assert.equal(await signIn(input), true);
    assert.equal(await signIn({ ...input, profile: { ...input.profile, email_verified: false } }), false);
    assert.equal(await signIn({ ...input, profile: { ...input.profile, email_verified: "true" } }), false);
    assert.equal(await signIn({ ...input, profile: { email: "stranger@example.com", email_verified: true } }), false);
    assert.equal(await signIn({ ...input, account: { provider: "other" } }), false);
    assert.equal(await signIn({ account: null, profile: undefined }), false);
    process.env.ALLOWED_EMAILS = "";
    assert.equal(await signIn(input), false);
    process.env.ALLOWED_EMAILS = "owner@example.com, doctor@example.com";
  });

  await t.test("client session updates cannot replace the verified identity", async () => {
    const token = await config.callbacks.jwt({ token: {}, account: { provider: "google" }, profile: { email: "owner@example.com", email_verified: true } });
    const updated = await config.callbacks.jwt({ token, trigger: "update", session: { email: "stranger@example.com", googleEmailVerified: true } });
    const session = await config.callbacks.session({ session: { user: {} }, token: updated });
    assert.equal(session.user.email, "owner@example.com");
    assert.equal(session.user.googleEmailVerified, true);
  });

  let session = null;
  const access = load("lib/access.ts", {
    "next/server": { connection: async () => {} },
    "@/auth": { auth: async () => session },
    "@/lib/auth-policy": policy,
  });
  await t.test("each request checks the current allowlist, even for existing sessions", async () => {
    assert.equal(await access.getAccess(), "unauthenticated");
    session = { user: { email: "owner@example.com", googleEmailVerified: true } };
    assert.equal(await access.getAccess(), "allowed");
    process.env.ALLOWED_EMAILS = "doctor@example.com";
    assert.equal(await access.getAccess(), "forbidden");
    delete process.env.ALLOWED_EMAILS;
    assert.equal(await access.getAccess(), "forbidden");
    process.env.ALLOWED_EMAILS = "owner@example.com, doctor@example.com";
    session.user.googleEmailVerified = false;
    assert.equal(await access.getAccess(), "unauthenticated");
  });

  let state = "unauthenticated";
  let databaseCalls = 0;
  const route = load("app/api/count/route.ts", {
    "@/lib/access": { getAccess: async () => state },
    "@/lib/auth-policy": policy,
    "@neondatabase/serverless": { neon: () => { databaseCalls++; return async () => [{ count: 7 }]; } },
  });
  await t.test("all three API methods reject unauthorized requests before database access", async () => {
    for (const [accessState, status] of [["unauthenticated", 401], ["forbidden", 403], ["unconfigured", 503]]) {
      state = accessState;
      for (const method of ["GET", "POST", "DELETE"]) {
        const response = await route[method](new Request("http://127.0.0.1:3000/api/count", { method }));
        assert.equal(response.status, status);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(databaseCalls, 0);
        assert.equal(Object.hasOwn(await response.json(), "count"), false);
      }
    }
  });
  await t.test("authorized mutations require the application's Origin", async () => {
    state = "allowed";
    for (const method of ["POST", "DELETE"]) {
      for (const headers of [{}, { Origin: "https://other.example.com" }]) {
        const response = await route[method](new Request("http://127.0.0.1:3000/api/count", { method, headers }));
        assert.equal(response.status, 403);
        assert.equal(databaseCalls, 0);
      }
    }
  });
  await t.test("authorized requests reach only the mocked database", async () => {
    for (const method of ["GET", "POST", "DELETE"]) {
      const response = await route[method](new Request("http://127.0.0.1:3000/api/count", { method, headers: { Origin: "http://127.0.0.1:3000" } }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { count: 7 });
    }
    assert.equal(databaseCalls, 3);
  });
});
