// Cancels a pending account deletion. The caller's account returns to
// normal status; their data was never touched.
//
// Auth: caller's JWT in Authorization header. user_id derived from JWT.
//
// Side effects:
//   - Deletes the caller's row from public.account_deletion_requests.
//   - Idempotent: if no pending deletion exists, returns success anyway —
//     restoring something that isn't pending is a no-op, not an error.
//
// Returns: { restored: true }

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

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: "invalid_jwt", detail: userErr?.message }, 401);
  }

  // RLS scopes the delete to auth.uid() = user_id, so the .eq is defensive
  // but matches the policy. Returns success even if no row existed.
  const { error: deleteErr } = await supabase
    .from("account_deletion_requests")
    .delete()
    .eq("user_id", userData.user.id);

  if (deleteErr) {
    return json({ error: "delete_failed", detail: deleteErr.message }, 500);
  }

  return json({ restored: true });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
