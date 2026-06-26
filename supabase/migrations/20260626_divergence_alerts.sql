-- Divergence alerts: user preferences + alert log
--
-- Two changes:
--   1. Extend `alert_preferences` (added by PR #4) with three columns
--      for the prediction-market divergence feature:
--          divergence_alerts_enabled  bool
--          divergence_threshold       int (5..50, in percentage points)
--          divergence_topics          jsonb (array of topic_taxonomy keys)
--          divergence_providers       jsonb (array: ["polymarket","kalshi"])
--
--   2. New `divergence_alerts_log` table — append-only history of
--      every divergence notification fired, so users can review past
--      alerts and we can debug false-positives.

-- ====================================================================
-- 1. Extend alert_preferences
-- ====================================================================

alter table if exists public.alert_preferences
    add column if not exists divergence_alerts_enabled boolean not null default false;

alter table if exists public.alert_preferences
    add column if not exists divergence_threshold integer not null default 20
        check (divergence_threshold between 5 and 50);

alter table if exists public.alert_preferences
    add column if not exists divergence_topics jsonb not null default
        '["crude_oil","natural_gas","fed_rates","opec_decisions","iran_middle_east"]'::jsonb;

alter table if exists public.alert_preferences
    add column if not exists divergence_providers jsonb not null default
        '["polymarket","kalshi"]'::jsonb;

-- ====================================================================
-- 2. Divergence alerts log
-- ====================================================================

create table if not exists public.divergence_alerts_log (
    id                   uuid        primary key default gen_random_uuid(),
    user_id              uuid        not null,
    topic                text        not null,
    provider             text        not null check (provider in ('polymarket', 'kalshi')),
    sentiment_score      real,
    market_implied       real,
    delta                real        not null,
    threshold            real        not null,
    related_market_id    text,
    fired_at             timestamptz not null default timezone('utc'::text, now()),
    delivered_via        text        not null default 'push'
                            check (delivered_via in ('push', 'email', 'in_app')),
    seen_by_user_at      timestamptz,

    foreign key (user_id) references auth.users(id) on delete cascade
);

create index if not exists idx_divergence_alerts_log_user_fired
    on public.divergence_alerts_log (user_id, fired_at desc);
create index if not exists idx_divergence_alerts_log_topic_fired
    on public.divergence_alerts_log (topic, fired_at desc);

-- Anti-spam: a user shouldn't get the same (topic, provider) alert more
-- than once per 4 hours. Enforced in the poller via this view's most-
-- recent-row check rather than a unique constraint (we want history).

-- Row-level security: users read their own log only.
alter table public.divergence_alerts_log enable row level security;

create policy divergence_alerts_log_select_own
    on public.divergence_alerts_log for select
    to authenticated
    using (auth.uid() = user_id);

create policy divergence_alerts_log_service_all
    on public.divergence_alerts_log for all
    to service_role
    using (true) with check (true);
