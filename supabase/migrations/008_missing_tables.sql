-- Migration 008: All tables referenced in application code but not yet in schema
-- Covers: subscriptions, tips, payouts, arcs, reading_rooms, buddy_reads, debates,
--         events, writing_challenges, writing_prompts, writing_workshops,
--         reading_goals, reading_challenges, reading_lists, referrals,
--         referral_commissions, promoted_listings, seasonal_events,
--         leaderboard_snapshots, ai_taste_profiles, author_posts,
--         pass_the_book_chains, email_verification_tokens, community_notes

-- ─────────────────────────────────────────────────────────────────────────────
-- Email verification tokens
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists email_verification_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  email        text not null,
  token        text not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  constraint uq_evtoken_user unique (user_id)
);

alter table users
  add column if not exists email_verified       boolean not null default false,
  add column if not exists email_digest_enabled boolean not null default true,
  add column if not exists is_premium           boolean not null default false,
  add column if not exists unsubscribe_token    text,
  add column if not exists account_hardening_email_prompted_at  timestamptz,
  add column if not exists account_hardening_2fa_prompted_at    timestamptz;

create index if not exists idx_evt_token on email_verification_tokens(token);

-- ─────────────────────────────────────────────────────────────────────────────
-- Subscriptions
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users(id) on delete cascade,
  provider            text not null check (provider in ('dodopayments', 'paystack')),
  status              text not null default 'pending'
                        check (status in ('pending', 'active', 'cancelled', 'expired', 'past_due')),
  amount              numeric(10,2) not null,
  currency            text not null default 'USD',
  provider_event_id   text unique,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_sub_user on subscriptions(user_id);
create index if not exists idx_sub_status on subscriptions(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tips
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists tips (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete set null,
  recipient_id      uuid references users(id) on delete set null,
  creator_id        uuid references users(id) on delete set null,
  amount            numeric(10,2) not null,
  platform_fee      numeric(10,2) not null,
  recipient_amount  numeric(10,2),
  creator_amount    numeric(10,2),
  currency          text not null default 'USD',
  status            text not null default 'pending'
                      check (status in ('pending', 'completed', 'failed', 'refunded')),
  provider_reference text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_tips_user on tips(user_id);
create index if not exists idx_tips_recipient on tips(recipient_id);
create index if not exists idx_tips_creator on tips(creator_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Payouts
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists payouts (
  id           uuid primary key default gen_random_uuid(),
  tip_id       uuid references tips(id) on delete set null,
  recipient_id uuid references users(id) on delete set null,
  amount       numeric(10,2) not null,
  currency     text not null default 'USD',
  status       text not null default 'pending'
                 check (status in ('pending', 'processing', 'completed', 'failed')),
  provider     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Referrals and commissions
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references users(id) on delete cascade,
  referred_id  uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique(referrer_id, referred_id)
);

create table if not exists referral_commissions (
  id                        uuid primary key default gen_random_uuid(),
  referrer_id               uuid not null references users(id) on delete cascade,
  referred_user_id          uuid references users(id) on delete set null,
  transaction_id            text not null,
  transaction_type          text not null,
  gross_transaction_amount  numeric(12,4) not null,
  platform_fee_amount       numeric(12,4) not null,
  commission_rate           numeric(5,4) not null default 0.10,
  commission_amount         numeric(12,4) not null,
  credited_at               timestamptz not null default now(),
  reversed_at               timestamptz,
  idempotency_key           text unique,
  created_at                timestamptz not null default now()
);

create index if not exists idx_rc_referrer on referral_commissions(referrer_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Promoted listings
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists promoted_listings (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references books(id) on delete cascade,
  author_id   uuid references users(id) on delete set null,
  placement   text not null default 'discover_top',
  is_active   boolean not null default false,
  start_date  timestamptz,
  end_date    timestamptz,
  clicks      integer not null default 0,
  price_usd   numeric(10,2),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_pl_active on promoted_listings(is_active, start_date, end_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seasonal events
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists seasonal_events (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  theme        text,
  start_date   timestamptz not null,
  end_date     timestamptz not null,
  badge_name   text,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists seasonal_event_participants (
  event_id    uuid not null references seasonal_events(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reading goals
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists reading_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  year         integer not null,
  target_books integer not null check (target_books > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(user_id, year)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reading challenges (community)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists challenges (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  type         text not null default 'reading' check (type in ('reading', 'writing')),
  start_date   timestamptz,
  end_date     timestamptz,
  badge_name   text,
  is_active    boolean not null default true,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists challenge_participants (
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  progress     integer not null default 0,
  completed    boolean not null default false,
  joined_at    timestamptz not null default now(),
  completed_at timestamptz,
  primary key (challenge_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reading lists
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists reading_lists (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  title        text not null,
  description  text,
  cover_url    text,
  is_public    boolean not null default true,
  forked_from  uuid references reading_lists(id) on delete set null,
  follower_count integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists reading_list_books (
  list_id    uuid not null references reading_lists(id) on delete cascade,
  book_id    uuid not null references books(id) on delete cascade,
  position   integer not null default 0,
  added_at   timestamptz not null default now(),
  primary key (list_id, book_id)
);

create table if not exists reading_list_follows (
  list_id    uuid not null references reading_lists(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create index if not exists idx_rl_user on reading_lists(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Buddy reads
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists buddy_reads (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references books(id) on delete cascade,
  creator_id   uuid not null references users(id) on delete cascade,
  title        text,
  max_members  integer not null default 20,
  is_private   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists buddy_read_members (
  buddy_read_id uuid not null references buddy_reads(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  primary key (buddy_read_id, user_id)
);

create table if not exists buddy_read_messages (
  id            uuid primary key default gen_random_uuid(),
  buddy_read_id uuid not null references buddy_reads(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  content       text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_brm_brid on buddy_read_messages(buddy_read_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reading Together Rooms
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists reading_rooms (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references books(id) on delete cascade,
  creator_id   uuid not null references users(id) on delete cascade,
  title        text not null,
  is_public    boolean not null default true,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists reading_room_members (
  room_id    uuid not null references reading_rooms(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists reading_room_milestones (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references reading_rooms(id) on delete cascade,
  title        text not null,
  unlock_date  timestamptz not null,
  created_at   timestamptz not null default now()
);

create table if not exists reading_room_posts (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references reading_rooms(id) on delete cascade,
  milestone_id uuid references reading_room_milestones(id) on delete set null,
  user_id      uuid not null references users(id) on delete cascade,
  content      text not null,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Book Debates
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists debates (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references books(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  claim        text not null,
  agree_count  integer not null default 0,
  disagree_count integer not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists debate_votes (
  debate_id  uuid not null references debates(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  vote       text not null check (vote in ('agree', 'disagree')),
  argument   text,
  voted_at   timestamptz not null default now(),
  primary key (debate_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Events
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references users(id) on delete cascade,
  book_id      uuid references books(id) on delete set null,
  title        text not null,
  description  text,
  event_date   timestamptz not null,
  external_url text,
  is_paid      boolean not null default false,
  ticket_price numeric(10,2),
  currency     text default 'USD',
  platform_fee_pct numeric(4,2) not null default 10.00,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists event_rsvps (
  event_id   uuid not null references events(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  rsvped_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists event_tickets (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  amount_paid  numeric(10,2) not null,
  currency     text not null default 'USD',
  status       text not null default 'pending'
                 check (status in ('pending', 'confirmed', 'refunded')),
  created_at   timestamptz not null default now()
);

create table if not exists event_revenue (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  organizer_id uuid not null references users(id) on delete cascade,
  amount       numeric(10,2) not null,
  currency     text not null default 'USD',
  recorded_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Author features
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists author_posts (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references users(id) on delete cascade,
  title        text not null,
  content      text not null,
  book_id      uuid references books(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists arcs (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references users(id) on delete cascade,
  book_id      uuid not null references books(id) on delete cascade,
  description  text,
  reader_slots integer not null default 5,
  close_date   timestamptz,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists arc_applications (
  id          uuid primary key default gen_random_uuid(),
  arc_id      uuid not null references arcs(id) on delete cascade,
  reader_id   uuid not null references users(id) on delete cascade,
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  applied_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(arc_id, reader_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Writing features
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists writing_prompts (
  id           uuid primary key default gen_random_uuid(),
  prompt_text  text not null,
  topic_seed   text,
  is_active    boolean not null default true,
  prompt_date  date,
  created_at   timestamptz not null default now()
);

create table if not exists writing_prompt_submissions (
  id           uuid primary key default gen_random_uuid(),
  prompt_id    uuid not null references writing_prompts(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  content      text not null,
  word_count   integer,
  ai_feedback  text,
  created_at   timestamptz not null default now(),
  unique(prompt_id, user_id)
);

create table if not exists writing_challenges (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  type         text not null default 'weekly'
                 check (type in ('daily', 'weekly', 'monthly')),
  start_date   timestamptz,
  end_date     timestamptz,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists writing_challenge_submissions (
  id             uuid primary key default gen_random_uuid(),
  challenge_id   uuid not null references writing_challenges(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  content        text not null,
  word_count     integer,
  ai_feedback    text,
  community_votes integer not null default 0,
  submitted_at   timestamptz not null default now(),
  unique(challenge_id, user_id)
);

create table if not exists writing_workshops (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references users(id) on delete cascade,
  title        text not null,
  description  text,
  max_members  integer not null default 8,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists writing_workshop_members (
  workshop_id uuid not null references writing_workshops(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (workshop_id, user_id)
);

create table if not exists writing_workshop_submissions (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references writing_workshops(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  content      text not null,
  word_count   integer,
  created_at   timestamptz not null default now()
);

create table if not exists writing_workshop_feedback (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references writing_workshop_submissions(id) on delete cascade,
  reviewer_id     uuid not null references users(id) on delete cascade,
  what_worked     text,
  what_to_improve text,
  specific_suggestion text,
  created_at      timestamptz not null default now(),
  unique(submission_id, reviewer_id)
);

create table if not exists ask_writer_questions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  question        text not null,
  best_answer_id  uuid,
  created_at      timestamptz not null default now()
);

create table if not exists ask_writer_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references ask_writer_questions(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  answer      text not null,
  created_at  timestamptz not null default now()
);

alter table ask_writer_questions
  add constraint fk_best_answer
  foreign key (best_answer_id) references ask_writer_answers(id) on delete set null
  deferrable initially deferred;

create table if not exists writing_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  plan_text    text not null,
  week_start   date not null,
  created_at   timestamptz not null default now(),
  unique(user_id, week_start)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Pass the Book chains
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists pass_the_book_chains (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references books(id) on delete cascade,
  creator_id   uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table if not exists pass_the_book_nodes (
  id          uuid primary key default gen_random_uuid(),
  chain_id    uuid not null references pass_the_book_chains(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  nominee_id  uuid references users(id) on delete set null,
  note        text,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Community notes (moderation)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists community_notes (
  id              uuid primary key default gen_random_uuid(),
  content_type    text not null check (content_type in ('review', 'quote', 'post', 'comment')),
  content_id      uuid not null,
  author_id       uuid not null references users(id) on delete cascade,
  note_text       text not null,
  helpful_votes   integer not null default 0,
  unhelpful_votes integer not null default 0,
  is_visible      boolean not null default false,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists community_note_ratings (
  note_id    uuid not null references community_notes(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  is_helpful boolean not null,
  rated_at   timestamptz not null default now(),
  primary key (note_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- AI taste profiles
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists ai_taste_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  profile_text text not null,
  generated_at timestamptz not null default now(),
  unique(user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Leaderboard snapshots
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists leaderboard_snapshots (
  id           uuid primary key default gen_random_uuid(),
  board_type   text not null,
  snapshot_date date not null,
  data         jsonb not null default '[]',
  created_at   timestamptz not null default now(),
  unique(board_type, snapshot_date)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS enable on all new tables (default deny)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'email_verification_tokens', 'subscriptions', 'tips', 'payouts',
    'referrals', 'referral_commissions', 'promoted_listings', 'seasonal_events',
    'seasonal_event_participants', 'reading_goals', 'challenges',
    'challenge_participants', 'reading_lists', 'reading_list_books',
    'reading_list_follows', 'buddy_reads', 'buddy_read_members',
    'buddy_read_messages', 'reading_rooms', 'reading_room_members',
    'reading_room_milestones', 'reading_room_posts', 'debates', 'debate_votes',
    'events', 'event_rsvps', 'event_tickets', 'event_revenue', 'author_posts',
    'arcs', 'arc_applications', 'writing_prompts', 'writing_prompt_submissions',
    'writing_challenges', 'writing_challenge_submissions', 'writing_workshops',
    'writing_workshop_members', 'writing_workshop_submissions',
    'writing_workshop_feedback', 'ask_writer_questions', 'ask_writer_answers',
    'writing_plans', 'pass_the_book_chains', 'pass_the_book_nodes',
    'community_notes', 'community_note_ratings', 'ai_taste_profiles',
    'leaderboard_snapshots'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Core RLS policies for new tables
-- ─────────────────────────────────────────────────────────────────────────────

-- subscriptions: users see their own
create policy "subscriptions_select_own" on subscriptions
  for select using (user_id = auth.uid());

-- tips: sender and recipient see their rows
create policy "tips_select_own" on tips
  for select using (user_id = auth.uid() or recipient_id = auth.uid() or creator_id = auth.uid());

-- reading_lists: public lists visible to all, private only to owner
create policy "rl_select_public" on reading_lists
  for select using (is_public or user_id = auth.uid());

create policy "rl_insert_own" on reading_lists
  for insert with check (user_id = auth.uid());

create policy "rl_update_own" on reading_lists
  for update using (user_id = auth.uid());

create policy "rl_delete_own" on reading_lists
  for delete using (user_id = auth.uid());

-- reading_list_books: readable if list is public or user is owner
create policy "rlb_select" on reading_list_books
  for select using (
    exists (
      select 1 from reading_lists rl
      where rl.id = list_id and (rl.is_public or rl.user_id = auth.uid())
    )
  );

-- debates: public read
create policy "debates_select_all" on debates for select using (true);
create policy "debates_insert_own" on debates for insert with check (user_id = auth.uid());

-- debate_votes: public read
create policy "dv_select_all" on debate_votes for select using (true);
create policy "dv_insert_own" on debate_votes for insert with check (user_id = auth.uid());

-- events: published events visible to all
create policy "events_select" on events for select using (is_published or organizer_id = auth.uid());
create policy "events_insert_own" on events for insert with check (organizer_id = auth.uid());
create policy "events_update_own" on events for update using (organizer_id = auth.uid());

-- writing_prompts: public read
create policy "wp_select_all" on writing_prompts for select using (true);

-- writing_challenges: public read
create policy "wc_select_all" on writing_challenges for select using (true);

-- writing_challenge_submissions: own + public read
create policy "wcs_select_all" on writing_challenge_submissions for select using (true);
create policy "wcs_insert_own" on writing_challenge_submissions
  for insert with check (user_id = auth.uid());

-- community_notes: visible notes readable by all
create policy "cn_select_visible" on community_notes
  for select using (is_visible and deleted_at is null);
create policy "cn_insert_own" on community_notes
  for insert with check (author_id = auth.uid());
create policy "cn_delete_own" on community_notes
  for delete using (author_id = auth.uid());

-- leaderboard_snapshots: public read
create policy "ls_select_all" on leaderboard_snapshots for select using (true);

-- email_verification_tokens: own only
create policy "evt_select_own" on email_verification_tokens
  for select using (user_id = auth.uid());

-- ai_taste_profiles: own only
create policy "atp_select_own" on ai_taste_profiles
  for select using (user_id = auth.uid());

-- pass the book: public read
create policy "ptbc_select_all" on pass_the_book_chains for select using (true);
create policy "ptbn_select_all" on pass_the_book_nodes for select using (true);
