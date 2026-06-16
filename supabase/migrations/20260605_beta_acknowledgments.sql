-- Beta acknowledgement records.
--
-- Each row is a user's acceptance of a specific (terms_version, privacy_version)
-- pair at a specific moment. New versions trigger a fresh acknowledgement
-- request from the mobile app / dashboard at next launch.
--
-- Rationale for storing this server-side rather than on the device:
--   1. Survives device loss / OS reinstall.
--   2. Lets us prove acceptance in a dispute (immutable audit log).
--   3. Lets us refuse paid actions if no acknowledgement is on file.

create table if not exists public.beta_acknowledgments (
    id                  uuid        primary key default gen_random_uuid(),
    user_id             uuid        not null,
    terms_version       text        not null,
    privacy_version     text        not null,
    device_identifier   text,
    locale              text,
    acknowledged_at     timestamptz not null default now(),

    -- A user agrees to a given (terms, privacy) pair at most once.
    -- New versions create new rows because the pair changes.
    unique (user_id, terms_version, privacy_version),

    -- Cascade: when the auth user is deleted (account-deletion flow),
    -- this row goes with it. The acknowledgement is no longer
    -- meaningful when the user no longer exists.
    constraint beta_ack_user_fk
        foreign key (user_id) references auth.users(id) on delete cascade
);

create index if not exists beta_ack_user_id_idx
    on public.beta_acknowledgments (user_id);

create index if not exists beta_ack_recorded_at_idx
    on public.beta_acknowledgments (acknowledged_at desc);

-- Row-level security: users can read their own rows; service role
-- handles writes via the backend.
alter table public.beta_acknowledgments enable row level security;

create policy beta_ack_select_own
    on public.beta_acknowledgments
    for select
    to authenticated
    using (auth.uid() = user_id);

-- Inserts come from the backend service role; do not allow direct
-- client inserts.
create policy beta_ack_insert_service_role
    on public.beta_acknowledgments
    for insert
    to service_role
    with check (true);

-- No update or delete via public API. Acknowledgements are an
-- append-only audit log; the cascade on auth.users deletion is the
-- only path to row removal.
