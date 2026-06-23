create table if not exists public.prediction_market_connectors (
    id uuid primary key default gen_random_uuid(),
    provider text not null default 'polymarket',
    name text not null,
    user_id text not null,
    source_mode text not null default 'tenant_private' check (source_mode in ('shared', 'hybrid', 'tenant_private')),
    base_url text not null default 'https://polymarket.com',
    event_url text,
    event_slug text,
    website_urls jsonb not null default '[]'::jsonb,
    custom_headers jsonb not null default '{}'::jsonb,
    use_personal_subscription boolean not null default true,
    bypass_shared_limits boolean not null default true,
    rate_limit_per_minute integer,
    cache_ttl_seconds integer not null default 60,
    auth_type text not null default 'none' check (auth_type in ('none', 'api_key', 'bearer')),
    api_key_header text,
    credential_mask text,
    credential_encrypted text,
    credential_persisted boolean not null default false,
    has_secret boolean not null default false,
    auth_via_app boolean not null default false,
    vendor_auth_still_required boolean not null default false,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_prediction_market_connectors_user_id
    on public.prediction_market_connectors(user_id);

create index if not exists idx_prediction_market_connectors_provider_user
    on public.prediction_market_connectors(provider, user_id);

alter table public.prediction_market_connectors enable row level security;

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

create policy "Users can view their own prediction market connectors"
    on public.prediction_market_connectors for select
    using (true);

create policy "Users can insert their own prediction market connectors"
    on public.prediction_market_connectors for insert
    with check (true);

create policy "Users can update their own prediction market connectors"
    on public.prediction_market_connectors for update
    using (true);

create policy "Users can delete their own prediction market connectors"
    on public.prediction_market_connectors for delete
    using (true);

drop trigger if exists update_prediction_market_connectors_updated_at on public.prediction_market_connectors;
create trigger update_prediction_market_connectors_updated_at
    before update on public.prediction_market_connectors
    for each row
    execute function update_updated_at_column();
