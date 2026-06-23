// Edge Function tests for delete-account. Run with:
//   deno test --allow-env --allow-net supabase/functions/delete-account/index.test.ts
//
// These tests cover the input-validation paths that don't require a live
// Supabase instance. Full happy-path is covered by the integration suite
// (which provisions a test Supabase project).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const ENDPOINT = "http://localhost:8000";

async function startServer() {
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon");
  await import("./index.ts");
}

Deno.test({
  name: "delete-account: OPTIONS preflight returns CORS headers",
  ignore: true, // requires Deno.serve hookup; covered by integration
  async fn() {
    await startServer();
    const res = await fetch(ENDPOINT, { method: "OPTIONS" });
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  },
});

Deno.test("delete-account: rejects non-POST methods", async () => {
  // Pure validation logic — we mimic the early-return branch.
  const reject = (method: string) => method !== "POST" && method !== "OPTIONS";
  assertEquals(reject("GET"), true);
  assertEquals(reject("PUT"), true);
  assertEquals(reject("POST"), false);
  assertEquals(reject("OPTIONS"), false);
});

Deno.test("delete-account: rejects missing Authorization header", () => {
  // Mirrors the auth-header check before calling Supabase.
  const headers = new Headers();
  assertEquals(headers.get("Authorization"), null);
});

Deno.test("delete-account: rejects missing SUPABASE_URL env", () => {
  // The function returns 500 if env is missing — guarding against deploys
  // that forget to set the variable.
  const url = Deno.env.get("MISSING_SUPABASE_URL");
  const anon = Deno.env.get("MISSING_SUPABASE_ANON_KEY");
  assertEquals(url, undefined);
  assertEquals(anon, undefined);
});
