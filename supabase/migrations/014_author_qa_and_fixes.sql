-- ============================================================
-- Migration 014: author_qa, author_books, author_posts fixes,
--                reading_list type, reading sessions UI support
-- ============================================================

-- Fix author_posts: add missing 'body' and 'type' columns
-- The initial migration used 'content' but the API uses 'body'
alter table author_posts add column if not exists body text;
alter table author_posts add column if not exists type text not null default 'blog'
  check (type in ('announcement', 'blog', 'arc_invite'));

-- Backfill body from content for existing rows
update author_posts set body = content where body is null and content is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Author Q&A
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists author_qa (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references users(id) on delete cascade,
  asked_by    uuid references users(id) on delete set null,
  question    text not null check (char_length(question) between 10 and 500),
  answer      text,
  is_public   boolean not null default true,
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_author_qa_author on author_qa(author_id);
create index if not exists idx_author_qa_asked_by on author_qa(asked_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- Author Books (claimed catalog)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists author_books (
  author_id  uuid not null references users(id) on delete cascade,
  book_id    uuid not null references books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (author_id, book_id)
);

create index if not exists idx_author_books_author on author_books(author_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reading lists: add list_type for "books that inspired me" author shelf
-- ─────────────────────────────────────────────────────────────────────────────
alter table reading_lists add column if not exists list_type text not null default 'standard'
  check (list_type in ('standard', 'inspired_by', 'wishlist', 'favorites'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Author posts: add notified_followers flag to avoid duplicate in-app notifs
-- ─────────────────────────────────────────────────────────────────────────────
alter table author_posts add column if not exists followers_notified boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- User notification preferences (per-type toggles)
-- ─────────────────────────────────────────────────────────────────────────────
alter table users add column if not exists notify_follows boolean not null default true;
alter table users add column if not exists notify_likes boolean not null default true;
alter table users add column if not exists notify_replies boolean not null default true;
alter table users add column if not exists notify_mentions boolean not null default true;
alter table users add column if not exists notify_author_announcements boolean not null default true;
alter table users add column if not exists notify_new_releases boolean not null default true;
alter table users add column if not exists notify_challenge_completions boolean not null default true;
alter table users add column if not exists notify_arc_grants boolean not null default true;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS for new tables
-- ─────────────────────────────────────────────────────────────────────────────
alter table author_qa enable row level security;
alter table author_books enable row level security;

-- author_qa: public questions and answers readable by all authenticated users
create policy "qa_select_public" on author_qa
  for select using (is_public = true or auth.uid() = asked_by or auth.uid() = author_id);

create policy "qa_insert_reader" on author_qa
  for insert with check (auth.uid() = asked_by);

create policy "qa_update_author" on author_qa
  for update using (auth.uid() = author_id);

-- author_books: readable by all, managed by the author
create policy "ab_select_all" on author_books
  for select using (true);

create policy "ab_insert_own" on author_books
  for insert with check (auth.uid() = author_id);

create policy "ab_delete_own" on author_books
  for delete using (auth.uid() = author_id);
