-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================
-- FEATURE FLAGS
-- ============================
create table feature_flags (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,
  enabled boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default flags
insert into feature_flags (name, enabled, description) values
  ('google_auth', true, 'Enable Google OAuth login'),
  ('telegram_auth', true, 'Enable Telegram OAuth login'),
  ('community_notes', false, 'Community contextual notes on content'),
  ('premium_subscriptions', true, 'Premium tier subscriptions'),
  ('creator_tips', true, 'Tip creators and authors'),
  ('events', true, 'Author/creator events'),
  ('newbie_writer_track', true, 'Newbie writer features'),
  ('referral_system', true, 'Referral codes and commissions');

-- ============================
-- USERS
-- ============================
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  bio text check (char_length(bio) <= 280),
  avatar_url text,
  banner_url text,
  country text,
  user_types text[] not null default '{"reader"}',
  genres text[] not null default '{}',
  is_admin boolean not null default false,
  is_moderator boolean not null default false,
  is_verified_author boolean not null default false,
  is_creator boolean not null default false,
  is_suspended boolean not null default false,
  is_banned boolean not null default false,
  suspension_reason text,
  xp integer not null default 0,
  reading_streak integer not null default 0,
  streak_freeze_tokens integer not null default 0,
  last_streak_date date,
  annual_reading_goal integer,
  books_read_count integer not null default 0,
  referral_code text unique not null,
  referred_by uuid references users(id),
  email text unique,
  email_verified boolean not null default false,
  pin_hash text,
  totp_secret text,
  totp_enabled boolean not null default false,
  recovery_codes text[],
  external_links text[] not null default '{}',
  profile_visibility text not null default 'public' check (profile_visibility in ('public', 'followers_only')),
  shelf_visibility text not null default 'public' check (shelf_visibility in ('public', 'followers_only', 'private')),
  show_referrer boolean not null default true,
  onboarding_complete boolean not null default false,
  email_prompt_shown_at timestamptz,
  email_prompt_dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_users_username on users(username);
create index idx_users_referral_code on users(referral_code);

-- ============================
-- SECURITY EVENTS
-- ============================
create table security_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete set null,
  event_type text not null,
  ip_hash text,
  auth_provider text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_security_events_user on security_events(user_id);
create index idx_security_events_created on security_events(created_at);

-- ============================
-- BOOKS
-- ============================
create table books (
  id uuid primary key default uuid_generate_v4(),
  google_books_id text unique,
  open_library_id text unique,
  isbn_10 text,
  isbn_13 text unique,
  title text not null,
  subtitle text,
  author_name text not null,
  author_names text[] not null default '{}',
  publisher text,
  published_year integer,
  description text,
  cover_url text,
  page_count integer,
  genres text[] not null default '{}',
  language text not null default 'en',
  has_audiobook boolean not null default false,
  average_rating numeric(3,2),
  ratings_count integer not null default 0,
  currently_reading_count integer not null default 0,
  want_to_read_count integer not null default 0,
  have_read_count integer not null default 0,
  similar_book_ids uuid[],
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_books_google_id on books(google_books_id);
create index idx_books_isbn13 on books(isbn_13);
create index idx_books_search on books using gin(search_vector);
create index idx_books_author on books(author_name);

-- Auto-update search vector
create or replace function books_search_vector_update() returns trigger as $$
begin
  new.search_vector := to_tsvector('english',
    coalesce(new.title, '') || ' ' ||
    coalesce(new.author_name, '') || ' ' ||
    coalesce(new.isbn_13, '') || ' ' ||
    coalesce(new.isbn_10, '')
  );
  return new;
end;
$$ language plpgsql;

create trigger books_search_vector_trigger
  before insert or update on books
  for each row execute function books_search_vector_update();

-- ============================
-- AFFILIATE STORES
-- ============================
create table affiliate_stores (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  countries text[] not null default '{}',
  url_template text not null,
  affiliate_tag text,
  is_active boolean not null default true,
  priority integer not null default 100,
  is_non_affiliate boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed Amazon stores per region
insert into affiliate_stores (name, countries, url_template, affiliate_tag, priority) values
  ('Amazon US', '{"US"}', 'https://www.amazon.com/s?k={isbn}&tag={tag}', 'liravo-20', 1),
  ('Amazon UK', '{"GB"}', 'https://www.amazon.co.uk/s?k={isbn}&tag={tag}', 'liravo-uk-21', 1),
  ('Amazon CA', '{"CA"}', 'https://www.amazon.ca/s?k={isbn}&tag={tag}', 'liravo-ca-21', 1),
  ('Amazon AU', '{"AU"}', 'https://www.amazon.com.au/s?k={isbn}&tag={tag}', 'liravo-au-22', 1),
  ('Project Gutenberg', '{}', 'https://www.gutenberg.org/ebooks/search/?query={title}', null, 200),
  ('WorldCat', '{}', 'https://www.worldcat.org/search?q={isbn}', null, 300);

update affiliate_stores set is_non_affiliate = true where name in ('Project Gutenberg', 'WorldCat');

-- ============================
-- AFFILIATE LINK CLICKS
-- ============================
create table affiliate_link_clicks (
  id uuid primary key default uuid_generate_v4(),
  book_id uuid not null references books(id) on delete cascade,
  user_id_hash text,
  link_type text not null,
  store_name text,
  country text,
  is_affiliate boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_affiliate_clicks_book on affiliate_link_clicks(book_id);
create index idx_affiliate_clicks_created on affiliate_link_clicks(created_at);

-- ============================
-- SHELVES
-- ============================
create table shelves (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  slug text not null,
  is_default boolean not null default false,
  default_type text check (default_type in ('currently_reading', 'have_read', 'want_to_read')),
  is_public boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, slug)
);

create index idx_shelves_user on shelves(user_id);

-- ============================
-- SHELF BOOKS (reading tracker)
-- ============================
create table shelf_books (
  id uuid primary key default uuid_generate_v4(),
  shelf_id uuid not null references shelves(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  progress_pages integer,
  progress_percent numeric(5,2),
  started_at date,
  finished_at date,
  edition_read text,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(shelf_id, book_id)
);

create index idx_shelf_books_user on shelf_books(user_id);
create index idx_shelf_books_book on shelf_books(book_id);

-- ============================
-- REVIEWS
-- ============================
create table reviews (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  review_type text not null default 'short' check (review_type in ('short', 'long', 'one_line')),
  rating integer not null check (rating between 1 and 5),
  content text,
  mood_tags text[] not null default '{}',
  has_spoilers boolean not null default false,
  read_date date,
  edition_read text,
  likes_count integer not null default 0,
  want_to_read_count integer not null default 0,
  helpful_votes integer not null default 0,
  unhelpful_votes integer not null default 0,
  is_hidden boolean not null default false,
  moderation_status text not null default 'published' check (moderation_status in ('published', 'pending', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_reviews_book on reviews(book_id);
create index idx_reviews_user on reviews(user_id);
create index idx_reviews_created on reviews(created_at desc);

-- ============================
-- QUOTES
-- ============================
create table quotes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  content text not null,
  page_number integer,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_quotes_book on quotes(book_id);

-- ============================
-- FOLLOWS
-- ============================
create table follows (
  follower_id uuid not null references users(id) on delete cascade,
  following_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id, following_id)
);

create index idx_follows_following on follows(following_id);

-- ============================
-- NOTIFICATIONS
-- ============================
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  actor_id uuid references users(id) on delete set null,
  entity_type text,
  entity_id uuid,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on notifications(user_id, is_read);
create index idx_notifications_created on notifications(created_at desc);

-- ============================
-- CONTENT REPORTS
-- ============================
create table content_reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references users(id) on delete cascade,
  entity_type text not null check (entity_type in ('review', 'quote', 'comment', 'user')),
  entity_id uuid not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'removed', 'warned', 'escalated')),
  moderator_id uuid references users(id),
  moderator_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_reports_status on content_reports(status);

-- ============================
-- RLS POLICIES
-- ============================
alter table users enable row level security;
alter table books enable row level security;
alter table shelves enable row level security;
alter table shelf_books enable row level security;
alter table reviews enable row level security;
alter table quotes enable row level security;
alter table follows enable row level security;
alter table notifications enable row level security;
alter table content_reports enable row level security;
alter table feature_flags enable row level security;
alter table affiliate_stores enable row level security;
alter table affiliate_link_clicks enable row level security;
alter table security_events enable row level security;

-- Users: public profiles readable by all authenticated users
create policy "Public profiles readable" on users
  for select using (true);

create policy "Users can update own profile" on users
  for update using (auth.uid() = id);

-- Books: readable by all
create policy "Books readable by all" on books
  for select using (true);

-- Shelves: own shelves full access, public shelves readable
create policy "Users manage own shelves" on shelves
  for all using (auth.uid() = user_id);

create policy "Public shelves readable" on shelves
  for select using (is_public = true);

-- Shelf books
create policy "Users manage own shelf books" on shelf_books
  for all using (auth.uid() = user_id);

create policy "Public shelf books readable" on shelf_books
  for select using (
    exists (
      select 1 from shelves s where s.id = shelf_id and s.is_public = true
    )
  );

-- Reviews
create policy "Published reviews readable" on reviews
  for select using (moderation_status = 'published' and not is_hidden);

create policy "Users manage own reviews" on reviews
  for all using (auth.uid() = user_id);

-- Quotes
create policy "Quotes readable" on quotes
  for select using (not is_hidden);

create policy "Users manage own quotes" on quotes
  for all using (auth.uid() = user_id);

-- Follows
create policy "Follows readable" on follows
  for select using (true);

create policy "Users manage own follows" on follows
  for all using (auth.uid() = follower_id);

-- Notifications: own only
create policy "Users see own notifications" on notifications
  for all using (auth.uid() = user_id);

-- Reports
create policy "Users submit reports" on content_reports
  for insert with check (auth.uid() = reporter_id);

-- Feature flags: readable by all authenticated
create policy "Feature flags readable" on feature_flags
  for select using (auth.role() = 'authenticated');

-- Affiliate stores: readable by all
create policy "Affiliate stores readable" on affiliate_stores
  for select using (is_active = true);

-- Affiliate clicks: insert by authenticated users
create policy "Log affiliate clicks" on affiliate_link_clicks
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'anon');

-- ============================
-- UPDATED_AT TRIGGER
-- ============================
create or replace function handle_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on users
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on books
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on shelves
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on shelf_books
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on reviews
  for each row execute function handle_updated_at();

create trigger set_updated_at before update on affiliate_stores
  for each row execute function handle_updated_at();

-- ============================
-- AUTO CREATE USER PROFILE ON SIGNUP
-- ============================
create or replace function handle_new_user() returns trigger as $$
declare
  v_referral_code text;
begin
  -- Generate unique 12-digit referral code
  loop
    v_referral_code := lpad(floor(random() * 1000000000000)::text, 12, '0');
    exit when not exists (select 1 from users where referral_code = v_referral_code);
  end loop;

  insert into users (id, username, display_name, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Reader'),
    v_referral_code
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
