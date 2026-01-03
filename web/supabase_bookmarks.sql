-- Create a bookmarks table for syncing between mobile and web
create table if not exists public.bookmarks (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    article_id text not null, -- URL or Title as ID
    title text,
    url text,
    source text,
    sentiment text,
    sentiment_score float,
    image_url text, -- Store image URL for consistency
    published_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    -- Prevent duplicate bookmarks for the same user and article
    unique(user_id, article_id)
);

-- Set up Row Level Security (RLS)
alter table public.bookmarks enable row level security;

-- Policy: Users can view their own bookmarks
create policy "Users can view their own bookmarks"
on public.bookmarks for select
using (auth.uid() = user_id);

-- Policy: Users can insert their own bookmarks
create policy "Users can insert their own bookmarks"
on public.bookmarks for insert
with check (auth.uid() = user_id);

-- Policy: Users can delete their own bookmarks
create policy "Users can delete their own bookmarks"
on public.bookmarks for delete
using (auth.uid() = user_id);
