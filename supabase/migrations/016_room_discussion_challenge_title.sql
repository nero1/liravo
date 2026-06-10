-- Migration 016: reading room discussion, pass_the_book chain policies, challenge title

-- Ensure room_participants table exists (API code uses this name, not reading_room_members)
create table if not exists room_participants (
  room_id    uuid not null references reading_rooms(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- RLS for room_participants
alter table room_participants enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='room_participants' and policyname='rp_select') then
    create policy "rp_select" on room_participants for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='room_participants' and policyname='rp_insert_own') then
    create policy "rp_insert_own" on room_participants for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='room_participants' and policyname='rp_delete_own') then
    create policy "rp_delete_own" on room_participants for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Ensure reading_rooms uses created_by (not creator_id)
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='reading_rooms' and column_name='created_by'
  ) then
    alter table reading_rooms add column created_by uuid references users(id) on delete cascade;
  end if;
end $$;

-- Ensure reading_rooms has name column (API uses name, migration used title)
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='reading_rooms' and column_name='name'
  ) then
    alter table reading_rooms add column name text;
    -- Backfill from title if it exists
    update reading_rooms set name = title where name is null;
  end if;
end $$;

-- Add title to writing_challenge_submissions
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='writing_challenge_submissions' and column_name='title'
  ) then
    alter table writing_challenge_submissions add column title text;
  end if;
end $$;

-- Rename content -> body alias: add body column to writing_challenge_submissions
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='writing_challenge_submissions' and column_name='body'
  ) then
    alter table writing_challenge_submissions add column body text;
    -- Backfill body from content
    update writing_challenge_submissions set body = content where body is null;
  end if;
end $$;

-- RLS for reading_room_milestones
alter table reading_room_milestones enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='reading_room_milestones' and policyname='rrm_select') then
    create policy "rrm_select" on reading_room_milestones for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='reading_room_milestones' and policyname='rrm_insert_creator') then
    create policy "rrm_insert_creator" on reading_room_milestones for insert with check (
      auth.uid() = (select created_by from reading_rooms where id = room_id)
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='reading_room_milestones' and policyname='rrm_delete_creator') then
    create policy "rrm_delete_creator" on reading_room_milestones for delete using (
      auth.uid() = (select created_by from reading_rooms where id = room_id)
    );
  end if;
end $$;

-- RLS for reading_room_posts
alter table reading_room_posts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='reading_room_posts' and policyname='rrp_select') then
    create policy "rrp_select" on reading_room_posts for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='reading_room_posts' and policyname='rrp_insert_member') then
    create policy "rrp_insert_member" on reading_room_posts for insert with check (
      auth.uid() = user_id and (
        auth.uid() = (select created_by from reading_rooms where id = room_id)
        or exists (select 1 from room_participants where room_id = reading_room_posts.room_id and user_id = auth.uid())
      )
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='reading_room_posts' and policyname='rrp_delete_own') then
    create policy "rrp_delete_own" on reading_room_posts for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Pass the book chain: insert/delete policies (select already exists in 008)
alter table pass_the_book_chains enable row level security;
alter table pass_the_book_nodes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='pass_the_book_chains' and policyname='ptbc_insert_own') then
    create policy "ptbc_insert_own" on pass_the_book_chains for insert with check (auth.uid() = creator_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='pass_the_book_nodes' and policyname='ptbn_insert_own') then
    create policy "ptbn_insert_own" on pass_the_book_nodes for insert with check (auth.uid() = user_id);
  end if;
end $$;
