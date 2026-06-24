-- Historical Sentiment Archive
--
-- The Integra moat: every news headline and prediction market snapshot
-- we observe is persisted indefinitely, scored against the current
-- sentiment model, and made queryable as a proprietary time series.
--
-- Five layers:
--   1. raw_documents       — truth layer; raw upstream payloads, never
--                            mutated, deduped on url_hash
--   2. sentiment_scores    — one row per (document, model_version),
--                            so the fine-tuned commodity model can
--                            re-score the full archive without
--                            destroying historical VADER scores
--   3. entity_mentions     — extracted commodities / orgs / countries
--                            per document, with per-entity sentiment
--   4. daily_asset_sentiment — pre-aggregated daily rollups that
--                              power charts; rebuilt nightly by a job
--   5. market_sentiment_overlay — links prediction-market snapshots
--                                 to contemporaneous news sentiment
--                                 (the unique cross-market product)
--
-- Storage strategy: append-only. We do not delete or mutate rows in
-- raw_documents or sentiment_scores. Aggregations can be rebuilt.

-- =====================================================================
-- Layer 1: TRUTH LAYER
-- =====================================================================

create table if not exists public.raw_documents (
    id              uuid        primary key default gen_random_uuid(),
    source          text        not null,
    source_type     text        not null check (source_type in
                       ('news', 'prediction_market', 'social', 'official_report')),
    url             text        not null,
    url_hash        text        not null,
    title           text,
    content         text,
    raw_payload     jsonb,
    published_at    timestamptz not null,
    fetched_at      timestamptz not null default timezone('utc'::text, now()),
    -- Idempotent re-ingestion: same URL from same source upserts.
    unique (source, url_hash)
);

create index if not exists idx_raw_documents_published_at
    on public.raw_documents (published_at desc);
create index if not exists idx_raw_documents_source_published
    on public.raw_documents (source, published_at desc);
create index if not exists idx_raw_documents_source_type
    on public.raw_documents (source_type, published_at desc);

-- =====================================================================
-- Layer 2: SENTIMENT SCORES (versioned)
-- =====================================================================

create table if not exists public.sentiment_scores (
    id              uuid        primary key default gen_random_uuid(),
    document_id     uuid        not null
                       references public.raw_documents(id) on delete cascade,
    model_name      text        not null,
    model_version   text        not null,
    sentiment       text        not null
                       check (sentiment in ('bullish', 'bearish', 'neutral')),
    score           real        not null,
    confidence      real        not null,
    distribution    jsonb,
    scored_at       timestamptz not null default timezone('utc'::text, now()),
    -- A given (model_name, model_version) scores each document at most once.
    -- Re-running the same model is a no-op; shipping a new fine-tuned
    -- model adds new rows alongside the old ones.
    unique (document_id, model_name, model_version)
);

create index if not exists idx_sentiment_scores_document
    on public.sentiment_scores (document_id);
create index if not exists idx_sentiment_scores_model
    on public.sentiment_scores (model_name, model_version, scored_at desc);

-- =====================================================================
-- Layer 3: ENTITY MENTIONS
-- =====================================================================

create table if not exists public.entity_mentions (
    id              uuid        primary key default gen_random_uuid(),
    document_id     uuid        not null
                       references public.raw_documents(id) on delete cascade,
    entity          text        not null,
    entity_type     text        not null,
    sentiment       text        check (sentiment in ('bullish', 'bearish', 'neutral')),
    score           real,
    confidence      real,
    model_version   text        not null,
    extracted_at    timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_entity_mentions_entity
    on public.entity_mentions (entity, extracted_at desc);
create index if not exists idx_entity_mentions_document
    on public.entity_mentions (document_id);
create index if not exists idx_entity_mentions_entity_type
    on public.entity_mentions (entity_type, entity);

-- =====================================================================
-- Layer 4: DAILY AGGREGATIONS (cache)
-- =====================================================================

create table if not exists public.daily_asset_sentiment (
    id                  uuid        primary key default gen_random_uuid(),
    asset               text        not null,
    date                date        not null,
    model_version       text        not null,
    avg_sentiment       real        not null,
    article_count       integer     not null,
    sentiment_momentum  real,
    bullish_count       integer     not null default 0,
    bearish_count       integer     not null default 0,
    neutral_count       integer     not null default 0,
    computed_at         timestamptz not null default timezone('utc'::text, now()),
    unique (asset, date, model_version)
);

create index if not exists idx_daily_asset_sentiment_asset_date
    on public.daily_asset_sentiment (asset, date desc);

-- =====================================================================
-- Layer 5: PREDICTION-MARKET OVERLAY
-- =====================================================================

create table if not exists public.market_sentiment_overlay (
    id                       uuid        primary key default gen_random_uuid(),
    market_id                text        not null,
    market_provider          text        not null,
    snapshot_at              timestamptz not null,
    market_yes_price         real,
    related_sentiment        real,
    sentiment_model_version  text        not null,
    article_count            integer     not null default 0,
    unique (market_id, snapshot_at, sentiment_model_version)
);

create index if not exists idx_market_sentiment_overlay_market
    on public.market_sentiment_overlay (market_id, snapshot_at desc);
create index if not exists idx_market_sentiment_overlay_provider
    on public.market_sentiment_overlay (market_provider, snapshot_at desc);

-- =====================================================================
-- Row-level security
-- =====================================================================
-- The archive is a backend asset: writes come from the service role,
-- reads come from authenticated API users with appropriate scopes.
-- We do not expose raw documents to anonymous users to avoid republishing
-- third-party copyrighted content; aggregated layers are safer.

alter table public.raw_documents          enable row level security;
alter table public.sentiment_scores       enable row level security;
alter table public.entity_mentions        enable row level security;
alter table public.daily_asset_sentiment  enable row level security;
alter table public.market_sentiment_overlay enable row level security;

-- Service role can do everything.
create policy raw_documents_service_all
    on public.raw_documents for all to service_role using (true) with check (true);
create policy sentiment_scores_service_all
    on public.sentiment_scores for all to service_role using (true) with check (true);
create policy entity_mentions_service_all
    on public.entity_mentions for all to service_role using (true) with check (true);
create policy daily_asset_sentiment_service_all
    on public.daily_asset_sentiment for all to service_role using (true) with check (true);
create policy market_sentiment_overlay_service_all
    on public.market_sentiment_overlay for all to service_role using (true) with check (true);

-- Authenticated users (i.e. paid API customers) can SELECT from the
-- aggregated layers only. Raw documents and per-doc scores stay
-- behind the backend.
create policy daily_asset_sentiment_authenticated_read
    on public.daily_asset_sentiment for select to authenticated using (true);
create policy market_sentiment_overlay_authenticated_read
    on public.market_sentiment_overlay for select to authenticated using (true);
