-- Migration 013: Writing streak (separate from reading streak) + reading sessions + helpfulness votes

-- Separate writing streak tracking
alter table users
  add column if not exists writing_streak integer not null default 0,
  add column if not exists last_writing_date date,
  add column if not exists writing_freeze_tokens integer not null default 0,
  add column if not exists max_reading_streak integer not null default 0,
  add column if not exists books_read_count integer not null default 0;

-- Update books_read_count if column already exists (it does from migration 001)
-- No-op if already present via add column if not exists

-- Reading sessions
create table if not exists reading_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  book_id      uuid references books(id) on delete set null,
  shelf_book_id uuid references shelf_books(id) on delete set null,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  pages_read   integer,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_reading_sessions_user on reading_sessions(user_id);
create index if not exists idx_reading_sessions_book on reading_sessions(book_id);
create index if not exists idx_reading_sessions_started on reading_sessions(started_at);

-- Helpfulness votes on reviews (columns already exist in type definitions)
alter table reviews
  add column if not exists helpful_votes integer not null default 0,
  add column if not exists unhelpful_votes integer not null default 0;

-- Review replies (threaded comments)
create table if not exists review_replies (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references reviews(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  content    text not null check (char_length(content) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_review_replies_review on review_replies(review_id);
create index if not exists idx_review_replies_user on review_replies(user_id);

-- Helpfulness vote tracking (prevent double voting)
create table if not exists review_helpfulness_votes (
  id        uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  is_helpful boolean not null,
  created_at timestamptz not null default now(),
  unique(review_id, user_id)
);

-- Goal milestone notifications (track which milestones already fired)
create table if not exists reading_goal_milestones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  year       integer not null,
  milestone  integer not null check (milestone in (25, 50, 75, 100)),
  fired_at   timestamptz not null default now(),
  unique(user_id, year, milestone)
);

-- Similar books pre-computed (already have similar_book_ids[] on books, but add computed table for metadata)
create table if not exists similar_books_computed (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references books(id) on delete cascade,
  similar_ids  uuid[] not null default '{}',
  computed_at  timestamptz not null default now(),
  unique(book_id)
);
create index if not exists idx_similar_books_book on similar_books_computed(book_id);

-- Account hardening schedule (for day-7 and day-30 prompts)
alter table users
  add column if not exists hardening_prompt_7d_sent_at  timestamptz,
  add column if not exists hardening_prompt_30d_sent_at timestamptz;

-- RPC for atomic helpfulness vote increment
create or replace function increment_review_helpfulness(
  p_review_id uuid,
  p_helpful_delta integer,
  p_unhelpful_delta integer
) returns void language plpgsql as $$
begin
  update reviews
  set helpful_votes = greatest(0, helpful_votes + p_helpful_delta),
      unhelpful_votes = greatest(0, unhelpful_votes + p_unhelpful_delta)
  where id = p_review_id;
end;
$$;
