// Hard-deletes accounts whose 30-day cooldown has expired.
//
// Auth: this function is meant to run on a schedule (Supabase cron) — it
// authenticates with the service_role key, NOT a user JWT. It must NEVER be
// exposed to client traffic. Configure the route with --no-verify-jwt and
// guard it with a shared secret passed in the cron's Authorization header.
//
// Side effects (per expired row):
//   - Calls supabase.auth.admin.deleteUser(user_id), which deletes the
//     auth.users row. PostgreSQL FK cascade then removes:
//       - public.user_profiles
//       - public.account_deletion_requests (this very row)
//       - any future user-data tables that follow the same FK + ON DELETE CASCADE pattern
//   - One auth.admin.deleteUser call per expired user; failures on one row
//     do NOT abort the batch (logged + reported in the response).
//
// Returns: { processed, succeeded, failed, errors[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const BATCH_SIZE = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // Shared-secret guard. Set CRON_SECRET in the function's env; the cron
  // schedule must pass it as Bearer.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const auth = req.headers.get("Authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "server_misconfigured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: expired, error: queryErr } = await admin
    .from("account_deletion_requests")
    .select("user_id, expires_at")
    .lt("expires_at", new Date().toISOString())
    .limit(BATCH_SIZE);

  if (queryErr) {
    return json({ error: "query_failed", detail: queryErr.message }, 500);
  }
  if (!expired || expired.length === 0) {
    return json({ processed: 0, succeeded: 0, failed: 0, errors: [] });
  }

  const result = await purgeBatch(admin, expired);
  return json(result);
});

type PurgeRow = { user_id: string; expires_at: string };
type PurgeError = { user_id: string; message: string };
type PurgeResult = {
  processed: number;
  succeeded: number;
  failed: number;
  errors: PurgeError[];
};

async function purgeBatch(
  admin: ReturnType<typeof createClient>,
  rows: PurgeRow[],
): Promise<PurgeResult> {
  const errors: PurgeError[] = [];
  let succeeded = 0;

  for (const row of rows) {
    const { error } = await admin.auth.admin.deleteUser(row.user_id);
    if (error) {
      errors.push({ user_id: row.user_id, message: error.message });
    } else {
      succeeded += 1;
    }
  }

  return {
    processed: rows.length,
    succeeded,
    failed: errors.length,
    errors,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
