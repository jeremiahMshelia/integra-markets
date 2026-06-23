-- App Store guideline 5.1.1(v): user-initiated account deletion with 30-day cooldown.
--
-- Flow:
--  1. User taps "Delete account" in the app.
--  2. delete-account Edge Function inserts a row here for that user.
--  3. The app treats the account as "pending deletion" — sign-in works, but the
--     UI surfaces a "Restore account" option instead of normal nav.
--  4. If the user restores, restore-account Edge Function deletes the row.
--  5. If 30 days elapse with no restore, the purge-deleted-accounts scheduled
--     Edge Function calls auth.admin.deleteUser(user_id), which cascades through
--     every public.* table that references auth.users with ON DELETE CASCADE.
--
-- This table itself uses ON DELETE CASCADE on user_id so that the cron's
-- auth.admin.deleteUser call also removes the row here — no orphan tracking
-- needed.

create table public.account_deletion_requests (
    user_id uuid primary key references auth.users (id) on delete cascade,
    requested_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '30 days')
);

-- Cron filter: WHERE expires_at < NOW() — needs an index for any meaningful
-- user count. The purge job runs daily; this avoids a full table scan.
create index account_deletion_requests_expires_at_idx
    on public.account_deletion_requests (expires_at);

alter table public.account_deletion_requests enable row level security;

-- Users can see their own pending deletion (so the app can render the
-- restore banner). They cannot see other users' requests.
create policy "Users read their own deletion request"
    on public.account_deletion_requests
    for select
    using (auth.uid() = user_id);

-- Inserts happen exclusively from the delete-account Edge Function, which
-- runs with the user's JWT. The function sets user_id from the JWT, so RLS
-- with auth.uid() = user_id is sufficient — clients cannot forge a request
-- for someone else.
create policy "Users insert their own deletion request"
    on public.account_deletion_requests
    for insert
    with check (auth.uid() = user_id);

-- Restore (delete-by-user) — RLS lets the user remove their own row, called
-- by the restore-account Edge Function with the user's JWT.
create policy "Users delete their own deletion request"
    on public.account_deletion_requests
    for delete
    using (auth.uid() = user_id);
