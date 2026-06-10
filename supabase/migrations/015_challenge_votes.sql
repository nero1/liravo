-- Migration 015: Community voting on writing challenge submissions

create table if not exists writing_challenge_votes (
  submission_id uuid not null references writing_challenge_submissions(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  voted_at      timestamptz not null default now(),
  primary key (submission_id, user_id)
);

create index if not exists idx_wcv_submission on writing_challenge_votes(submission_id);

alter table writing_challenge_votes enable row level security;

create policy "wcv_select_all" on writing_challenge_votes for select using (true);
create policy "wcv_insert_own" on writing_challenge_votes for insert with check (auth.uid() = user_id);
create policy "wcv_delete_own" on writing_challenge_votes for delete using (auth.uid() = user_id);

-- Atomic increment/decrement function
create or replace function increment_challenge_vote(p_submission_id uuid, p_delta integer)
returns void language plpgsql security definer as $$
begin
  update writing_challenge_submissions
  set community_votes = greatest(0, community_votes + p_delta)
  where id = p_submission_id;
end;
$$;
