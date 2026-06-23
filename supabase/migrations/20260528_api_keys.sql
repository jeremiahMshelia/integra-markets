-- API keys table. Each row is a key a user has provisioned for calling the
-- public Integra Markets API from their own apps/scripts. The full key value
-- is never stored; only sha256(key) and a public prefix for identification.

create table if not exists public.api_keys (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    name text not null,
    key_prefix text not null,
    key_hash text not null,
    scopes jsonb not null default '[]'::jsonb,
    last_used_at timestamptz,
    created_at timestamptz not null default timezone('utc'::text, now()),
    revoked_at timestamptz
);

create unique index if not exists idx_api_keys_prefix
    on public.api_keys(key_prefix);
create index if not exists idx_api_keys_user_active
    on public.api_keys(user_id)
    where revoked_at is null;

-- Usage log. One row per authenticated API call. Used for rate limits,
-- billing analytics, and the customer-visible "last used" timestamp.
create table if not exists public.api_key_usage (
    id uuid primary key default gen_random_uuid(),
    key_id uuid not null references public.api_keys(id) on delete cascade,
    endpoint text not null,
    method text not null,
    status_code integer,
    latency_ms integer,
    ts timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_api_key_usage_key_ts
    on public.api_key_usage(key_id, ts desc);

alter table public.api_keys enable row level security;
alter table public.api_key_usage enable row level security;

drop policy if exists api_keys_own on public.api_keys;
create policy api_keys_own on public.api_keys
    for all using (auth.uid()::text = user_id)
    with check (auth.uid()::text = user_id);

drop policy if exists api_key_usage_own on public.api_key_usage;
create policy api_key_usage_own on public.api_key_usage
    for select using (
        exists (
            select 1 from public.api_keys
            where api_keys.id = api_key_usage.key_id
              and api_keys.user_id = auth.uid()::text
        )
    );

-- Backend (service role) bypasses RLS for all writes.
