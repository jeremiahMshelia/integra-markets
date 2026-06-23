import { supabase } from '@/lib/supabase';

/**
 * Mirrors the row returned by /supabase/functions/delete-account.
 * `requested_at` and `expires_at` are ISO-8601 UTC strings.
 */
export type DeletionRequest = {
  requested_at: string;
  expires_at: string;
};

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Schedule the current user's account for deletion in 30 days.
 *
 * Idempotent: calling twice returns the same expires_at. The user remains
 * signed in; their session is unaffected. The app surface should switch
 * to the "pending deletion" banner immediately after this resolves.
 */
export async function requestAccountDeletion(): Promise<ServiceResult<DeletionRequest>> {
  const { data, error } = await supabase.functions.invoke<DeletionRequest>('delete-account', {
    method: 'POST',
  });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'empty_response' };
  return { ok: true, data };
}

/**
 * Cancel a pending deletion. Safe to call even if no request exists —
 * the function treats "nothing to restore" as success.
 */
export async function restoreAccount(): Promise<ServiceResult<{ restored: true }>> {
  const { data, error } = await supabase.functions.invoke<{ restored: true }>('restore-account', {
    method: 'POST',
  });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'empty_response' };
  return { ok: true, data };
}

/**
 * Returns the current user's pending deletion request, or null if none.
 * Used at app launch (and after sign-in) to decide whether to show the
 * restore banner.
 *
 * Reads via RLS — users can only see their own request.
 */
export async function getPendingDeletion(): Promise<ServiceResult<DeletionRequest | null>> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return { ok: false, error: userErr?.message ?? 'not_authenticated' };
  }

  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('requested_at, expires_at')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? null };
}
