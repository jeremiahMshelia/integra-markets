-- Learning loop foundation: tables that capture predictions, outcomes,
-- user feedback, keyword stats, and training events. These are the
-- inputs/outputs for backend/services/learning_loop.py.

-- Predictions emitted by the sentiment model for every analyzed article.
create table if not exists public.predictions (
    id uuid primary key default gen_random_uuid(),
    article_id text not null,
    article_title text,
    source text,
    commodity text,
    keywords jsonb not null default '[]'::jsonb,
    feature_hash text,
    predicted_sentiment text not null
        check (predicted_sentiment in ('bullish', 'bearish', 'neutral')),
    predicted_distribution jsonb not null default '{}'::jsonb,
    confidence real not null,
    model_version text not null default 'v1',
    user_id text,
    predicted_at timestamptz not null default timezone('utc'::text, now()),
    evaluated boolean not null default false
);

create index if not exists idx_predictions_evaluated_at
    on public.predictions(evaluated, predicted_at);
create index if not exists idx_predictions_article
    on public.predictions(article_id, predicted_at desc);
create index if not exists idx_predictions_commodity
    on public.predictions(commodity, predicted_at desc);

-- Realized outcome for each prediction. Written by the outcome evaluator
-- after the configured horizon (default 24h) elapses.
create table if not exists public.prediction_outcomes (
    prediction_id uuid primary key references public.predictions(id) on delete cascade,
    actual_direction text
        check (actual_direction in ('bullish', 'bearish', 'neutral')),
    price_change_pct real,
    reward real,
    evaluated_at timestamptz not null default timezone('utc'::text, now()),
    horizon_hours integer not null default 24,
    notes text
);

create index if not exists idx_prediction_outcomes_evaluated_at
    on public.prediction_outcomes(evaluated_at desc);

-- Per-user reaction to an article. Acts as supervised label and also
-- contributes to reward when explicit market outcome is unavailable.
create table if not exists public.user_feedback (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    article_id text not null,
    prediction_id uuid references public.predictions(id) on delete set null,
    action text not null
        check (action in ('like', 'dislike', 'save', 'dismiss', 'share', 'agree', 'disagree')),
    sentiment_vote text
        check (sentiment_vote in ('bullish', 'bearish', 'neutral')),
    note text,
    created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_user_feedback_user
    on public.user_feedback(user_id, created_at desc);
create index if not exists idx_user_feedback_article
    on public.user_feedback(article_id, created_at desc);

-- Rolling per-keyword statistics used by the UCB1 bandit. Updated by
-- the learning loop after each evaluated prediction or user feedback.
create table if not exists public.keyword_weights (
    keyword text primary key,
    commodity text,
    n_observations integer not null default 0,
    n_correct integer not null default 0,
    sum_reward real not null default 0.0,
    weight real not null default 1.0,
    sentiment_bias text
        check (sentiment_bias in ('bullish', 'bearish', 'neutral')),
    last_updated timestamptz not null default timezone('utc'::text, now()),
    first_seen timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_keyword_weights_observations
    on public.keyword_weights(n_observations desc);

-- Training event log. Every gradient step or bandit update writes one
-- row. Source of truth for the metrics endpoint.
create table if not exists public.training_events (
    id uuid primary key default gen_random_uuid(),
    ts timestamptz not null default timezone('utc'::text, now()),
    kind text not null
        check (kind in ('gradient_step', 'bandit_update', 'snapshot', 'cold_start')),
    n_experiences integer,
    batch_size integer,
    reward_mean real,
    loss real,
    learning_rate real,
    model_version text,
    notes jsonb not null default '{}'::jsonb
);

create index if not exists idx_training_events_ts
    on public.training_events(ts desc);

-- Row-level security: predictions and training events are global to
-- the tenant; user_feedback is per-user.
alter table public.predictions enable row level security;
alter table public.prediction_outcomes enable row level security;
alter table public.user_feedback enable row level security;
alter table public.keyword_weights enable row level security;
alter table public.training_events enable row level security;

drop policy if exists predictions_read on public.predictions;
create policy predictions_read on public.predictions
    for select using (true);

drop policy if exists prediction_outcomes_read on public.prediction_outcomes;
create policy prediction_outcomes_read on public.prediction_outcomes
    for select using (true);

drop policy if exists user_feedback_own on public.user_feedback;
create policy user_feedback_own on public.user_feedback
    for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists keyword_weights_read on public.keyword_weights;
create policy keyword_weights_read on public.keyword_weights
    for select using (true);

drop policy if exists training_events_read on public.training_events;
create policy training_events_read on public.training_events
    for select using (true);

-- Service role bypasses RLS for the backend to write everywhere via
-- SUPABASE_SERVICE_ROLE_KEY. No additional grants needed.
