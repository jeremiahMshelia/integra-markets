// Soft-delete: marks the caller's account for deletion in 30 days.
//
// Auth: caller must send their user JWT in the Authorization header.
// We use the JWT to derive user_id — never trust a request body claim.
//
// Side effects:
//   - Inserts a row into public.account_deletion_requests for the caller.
//   - Idempotent: if a row already exists, returns the existing expires_at
//     rather than failing. This means tapping "Delete" twice is safe.
//
// Returns: { requested_at, expires_at }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return json({ error: "server_misconfigured" }, 500);
  }

  // Client uses the caller's JWT — all writes go through RLS.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: "invalid_jwt", detail: userErr?.message }, 401);
  }
  const userId = userData.user.id;

  // Idempotent insert: ON CONFLICT DO NOTHING keeps the existing row.
  const { error: insertErr } = await supabase
    .from("account_deletion_requests")
    .upsert(
      { user_id: userId },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

  if (insertErr) {
    return json({ error: "insert_failed", detail: insertErr.message }, 500);
  }

  // Return the (existing or new) row so the caller knows the cutoff.
  const { data: row, error: readErr } = await supabase
    .from("account_deletion_requests")
    .select("requested_at, expires_at")
    .eq("user_id", userId)
    .single();

  if (readErr || !row) {
    return json({ error: "read_failed", detail: readErr?.message }, 500);
  }

  return json({
    requested_at: row.requested_at,
    expires_at: row.expires_at,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
