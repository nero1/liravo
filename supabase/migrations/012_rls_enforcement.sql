-- Migration 012: Close all RLS gaps identified in security audit.
--
-- Fixes three categories:
--   (A) financial_audit_log and outbox_events had no RLS at all.
--   (B) ~30 tables had RLS enabled but zero policies (default DENY → broken features).
--   (C) payout_requests was missing INSERT / UPDATE policies.

-- ─────────────────────────────────────────────────────────────────────────────
-- (A) Enable RLS on tables that were missing it entirely
-- ─────────────────────────────────────────────────────────────────────────────

-- financial_audit_log: users may read entries where they are actor or target.
-- service_role (webhooks / backend functions) bypasses RLS automatically.
alter table financial_audit_log enable row level security;

create policy "financial_audit_log_select_own" on financial_audit_log
  for select using (
    actor_user_id = auth.uid() or target_user_id = auth.uid()
  );

-- outbox_events: internal event queue — no direct user access.
-- Default DENY for all non-service-role connections is intentional.
alter table outbox_events enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-1) security_events — RLS enabled since 001, no SELECT policy existed
-- ─────────────────────────────────────────────────────────────────────────────

create policy "security_events_select_own" on security_events
  for select using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (C) payout_requests — SELECT existed; INSERT / UPDATE were missing
-- ─────────────────────────────────────────────────────────────────────────────

create policy "payout_requests_insert_own" on payout_requests
  for insert with check (auth.uid() = user_id);

create policy "payout_requests_update_own" on payout_requests
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-2) payouts — no policies defined after RLS was enabled
-- ─────────────────────────────────────────────────────────────────────────────

create policy "payouts_select_own" on payouts
  for select using (recipient_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-3) referrals + referral_commissions
-- ─────────────────────────────────────────────────────────────────────────────

create policy "referrals_select_own" on referrals
  for select using (referrer_id = auth.uid() or referred_id = auth.uid());

create policy "referral_commissions_select_own" on referral_commissions
  for select using (referrer_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-4) Buddy reads
-- ─────────────────────────────────────────────────────────────────────────────

create policy "buddy_reads_select" on buddy_reads
  for select using (
    not is_private
    or creator_id = auth.uid()
    or exists (
      select 1 from buddy_read_members
      where buddy_read_id = buddy_reads.id and user_id = auth.uid()
    )
  );

create policy "buddy_reads_insert" on buddy_reads
  for insert with check (creator_id = auth.uid());

create policy "buddy_reads_update_own" on buddy_reads
  for update using (creator_id = auth.uid());

create policy "buddy_reads_delete_own" on buddy_reads
  for delete using (creator_id = auth.uid());

create policy "buddy_read_members_select" on buddy_read_members
  for select using (
    exists (
      select 1 from buddy_reads br
      where br.id = buddy_read_id
        and (
          not br.is_private
          or br.creator_id = auth.uid()
          or buddy_read_members.user_id = auth.uid()
        )
    )
  );

create policy "buddy_read_members_insert" on buddy_read_members
  for insert with check (user_id = auth.uid());

create policy "buddy_read_members_delete_own" on buddy_read_members
  for delete using (user_id = auth.uid());

create policy "buddy_read_messages_select" on buddy_read_messages
  for select using (
    exists (
      select 1 from buddy_read_members
      where buddy_read_id = buddy_read_messages.buddy_read_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from buddy_reads br
      where br.id = buddy_read_messages.buddy_read_id and br.creator_id = auth.uid()
    )
  );

create policy "buddy_read_messages_insert" on buddy_read_messages
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from buddy_read_members
      where buddy_read_id = buddy_read_messages.buddy_read_id and user_id = auth.uid()
    )
  );

create policy "buddy_read_messages_delete_own" on buddy_read_messages
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-5) Reading rooms
-- ─────────────────────────────────────────────────────────────────────────────

create policy "reading_rooms_select" on reading_rooms
  for select using (
    is_public
    or creator_id = auth.uid()
    or exists (
      select 1 from reading_room_members
      where room_id = reading_rooms.id and user_id = auth.uid()
    )
  );

create policy "reading_rooms_insert" on reading_rooms
  for insert with check (creator_id = auth.uid());

create policy "reading_rooms_update_own" on reading_rooms
  for update using (creator_id = auth.uid());

create policy "reading_rooms_delete_own" on reading_rooms
  for delete using (creator_id = auth.uid());

create policy "reading_room_members_select" on reading_room_members
  for select using (
    exists (
      select 1 from reading_rooms rr
      where rr.id = room_id
        and (
          rr.is_public
          or rr.creator_id = auth.uid()
          or reading_room_members.user_id = auth.uid()
        )
    )
  );

create policy "reading_room_members_insert" on reading_room_members
  for insert with check (user_id = auth.uid());

create policy "reading_room_members_delete_own" on reading_room_members
  for delete using (user_id = auth.uid());

create policy "reading_room_milestones_select" on reading_room_milestones
  for select using (
    exists (
      select 1 from reading_rooms rr
      where rr.id = room_id
        and (
          rr.is_public
          or rr.creator_id = auth.uid()
          or exists (
            select 1 from reading_room_members
            where room_id = rr.id and user_id = auth.uid()
          )
        )
    )
  );

create policy "reading_room_milestones_insert" on reading_room_milestones
  for insert with check (
    exists (select 1 from reading_rooms where id = room_id and creator_id = auth.uid())
  );

create policy "reading_room_milestones_delete_own" on reading_room_milestones
  for delete using (
    exists (select 1 from reading_rooms where id = room_id and creator_id = auth.uid())
  );

create policy "reading_room_posts_select" on reading_room_posts
  for select using (
    exists (
      select 1 from reading_rooms rr
      where rr.id = room_id
        and (
          rr.is_public
          or rr.creator_id = auth.uid()
          or exists (
            select 1 from reading_room_members
            where room_id = rr.id and user_id = auth.uid()
          )
        )
    )
  );

create policy "reading_room_posts_insert" on reading_room_posts
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from reading_rooms rr
      where rr.id = room_id
        and (
          rr.creator_id = auth.uid()
          or exists (
            select 1 from reading_room_members
            where room_id = rr.id and user_id = auth.uid()
          )
        )
    )
  );

create policy "reading_room_posts_delete_own" on reading_room_posts
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-6) ARCs and applications
-- ─────────────────────────────────────────────────────────────────────────────

create policy "arcs_select" on arcs
  for select using (is_active or author_id = auth.uid());

create policy "arcs_insert_own" on arcs
  for insert with check (author_id = auth.uid());

create policy "arcs_update_own" on arcs
  for update using (author_id = auth.uid());

create policy "arcs_delete_own" on arcs
  for delete using (author_id = auth.uid());

create policy "arc_applications_select" on arc_applications
  for select using (
    reader_id = auth.uid()
    or exists (select 1 from arcs where id = arc_id and author_id = auth.uid())
  );

create policy "arc_applications_insert" on arc_applications
  for insert with check (reader_id = auth.uid());

-- Arc author can approve / reject applications.
create policy "arc_applications_update_author" on arc_applications
  for update using (
    exists (select 1 from arcs where id = arc_id and author_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-7) Event sub-tables
-- ─────────────────────────────────────────────────────────────────────────────

create policy "event_rsvps_select" on event_rsvps
  for select using (
    user_id = auth.uid()
    or exists (select 1 from events where id = event_id and organizer_id = auth.uid())
  );

create policy "event_rsvps_insert" on event_rsvps
  for insert with check (user_id = auth.uid());

create policy "event_rsvps_delete_own" on event_rsvps
  for delete using (user_id = auth.uid());

create policy "event_tickets_select" on event_tickets
  for select using (
    user_id = auth.uid()
    or exists (select 1 from events where id = event_id and organizer_id = auth.uid())
  );

-- event_revenue is financial — organizer-only, never expose across accounts.
create policy "event_revenue_select_own" on event_revenue
  for select using (organizer_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-8) Author posts
-- ─────────────────────────────────────────────────────────────────────────────

create policy "author_posts_select_all" on author_posts
  for select using (true);

create policy "author_posts_insert_own" on author_posts
  for insert with check (author_id = auth.uid());

create policy "author_posts_update_own" on author_posts
  for update using (author_id = auth.uid());

create policy "author_posts_delete_own" on author_posts
  for delete using (author_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-9) Seasonal events and participants
-- ─────────────────────────────────────────────────────────────────────────────

create policy "seasonal_events_select_published" on seasonal_events
  for select using (is_published);

create policy "seasonal_event_participants_select_all" on seasonal_event_participants
  for select using (true);

create policy "seasonal_event_participants_insert_own" on seasonal_event_participants
  for insert with check (user_id = auth.uid());

create policy "seasonal_event_participants_delete_own" on seasonal_event_participants
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-10) Challenges and participants
-- ─────────────────────────────────────────────────────────────────────────────

create policy "challenges_select_active" on challenges
  for select using (is_active);

create policy "challenge_participants_select_all" on challenge_participants
  for select using (true);

create policy "challenge_participants_insert_own" on challenge_participants
  for insert with check (user_id = auth.uid());

create policy "challenge_participants_update_own" on challenge_participants
  for update using (user_id = auth.uid());

create policy "challenge_participants_delete_own" on challenge_participants
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-11) Promoted listings
-- ─────────────────────────────────────────────────────────────────────────────

create policy "promoted_listings_select" on promoted_listings
  for select using (is_active or author_id = auth.uid());

create policy "promoted_listings_insert_own" on promoted_listings
  for insert with check (author_id = auth.uid());

create policy "promoted_listings_update_own" on promoted_listings
  for update using (author_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-12) Reading goals
-- ─────────────────────────────────────────────────────────────────────────────

create policy "reading_goals_select_own" on reading_goals
  for select using (user_id = auth.uid());

create policy "reading_goals_insert_own" on reading_goals
  for insert with check (user_id = auth.uid());

create policy "reading_goals_update_own" on reading_goals
  for update using (user_id = auth.uid());

create policy "reading_goals_delete_own" on reading_goals
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-13) Reading list follows
-- ─────────────────────────────────────────────────────────────────────────────

create policy "reading_list_follows_select_all" on reading_list_follows
  for select using (true);

create policy "reading_list_follows_insert_own" on reading_list_follows
  for insert with check (user_id = auth.uid());

create policy "reading_list_follows_delete_own" on reading_list_follows
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-14) Writing workshops and sub-tables
-- ─────────────────────────────────────────────────────────────────────────────

create policy "writing_workshops_select" on writing_workshops
  for select using (is_active or creator_id = auth.uid());

create policy "writing_workshops_insert_own" on writing_workshops
  for insert with check (creator_id = auth.uid());

create policy "writing_workshops_update_own" on writing_workshops
  for update using (creator_id = auth.uid());

create policy "writing_workshops_delete_own" on writing_workshops
  for delete using (creator_id = auth.uid());

create policy "writing_workshop_members_select" on writing_workshop_members
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from writing_workshops
      where id = workshop_id and creator_id = auth.uid()
    )
  );

create policy "writing_workshop_members_insert" on writing_workshop_members
  for insert with check (user_id = auth.uid());

create policy "writing_workshop_members_delete_own" on writing_workshop_members
  for delete using (user_id = auth.uid());

create policy "writing_workshop_submissions_select" on writing_workshop_submissions
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from writing_workshop_members
      where workshop_id = writing_workshop_submissions.workshop_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from writing_workshops
      where id = writing_workshop_submissions.workshop_id and creator_id = auth.uid()
    )
  );

create policy "writing_workshop_submissions_insert" on writing_workshop_submissions
  for insert with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from writing_workshop_members
        where workshop_id = writing_workshop_submissions.workshop_id
          and user_id = auth.uid()
      )
      or exists (
        select 1 from writing_workshops
        where id = writing_workshop_submissions.workshop_id and creator_id = auth.uid()
      )
    )
  );

create policy "writing_workshop_submissions_delete_own" on writing_workshop_submissions
  for delete using (user_id = auth.uid());

create policy "writing_workshop_feedback_select" on writing_workshop_feedback
  for select using (
    reviewer_id = auth.uid()
    or exists (
      select 1 from writing_workshop_submissions wws
      where wws.id = submission_id and wws.user_id = auth.uid()
    )
    or exists (
      select 1 from writing_workshop_submissions wws
      join writing_workshop_members wwm
        on wwm.workshop_id = wws.workshop_id and wwm.user_id = auth.uid()
      where wws.id = submission_id
    )
  );

create policy "writing_workshop_feedback_insert" on writing_workshop_feedback
  for insert with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from writing_workshop_submissions wws
      join writing_workshop_members wwm
        on wwm.workshop_id = wws.workshop_id and wwm.user_id = auth.uid()
      where wws.id = submission_id
    )
  );

create policy "writing_workshop_feedback_delete_own" on writing_workshop_feedback
  for delete using (reviewer_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-15) Writing prompt submissions
-- ─────────────────────────────────────────────────────────────────────────────

create policy "writing_prompt_submissions_select_own" on writing_prompt_submissions
  for select using (user_id = auth.uid());

create policy "writing_prompt_submissions_insert_own" on writing_prompt_submissions
  for insert with check (user_id = auth.uid());

create policy "writing_prompt_submissions_update_own" on writing_prompt_submissions
  for update using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-16) Ask writer Q&A
-- ─────────────────────────────────────────────────────────────────────────────

create policy "ask_writer_questions_select_all" on ask_writer_questions
  for select using (true);

create policy "ask_writer_questions_insert_own" on ask_writer_questions
  for insert with check (user_id = auth.uid());

create policy "ask_writer_questions_update_own" on ask_writer_questions
  for update using (user_id = auth.uid());

create policy "ask_writer_answers_select_all" on ask_writer_answers
  for select using (true);

create policy "ask_writer_answers_insert_own" on ask_writer_answers
  for insert with check (user_id = auth.uid());

create policy "ask_writer_answers_update_own" on ask_writer_answers
  for update using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-17) Writing plans
-- ─────────────────────────────────────────────────────────────────────────────

create policy "writing_plans_select_own" on writing_plans
  for select using (user_id = auth.uid());

create policy "writing_plans_insert_own" on writing_plans
  for insert with check (user_id = auth.uid());

create policy "writing_plans_update_own" on writing_plans
  for update using (user_id = auth.uid());

create policy "writing_plans_delete_own" on writing_plans
  for delete using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- (B-18) Community note ratings
-- ─────────────────────────────────────────────────────────────────────────────

create policy "community_note_ratings_select_all" on community_note_ratings
  for select using (true);

create policy "community_note_ratings_insert_own" on community_note_ratings
  for insert with check (user_id = auth.uid());

create policy "community_note_ratings_update_own" on community_note_ratings
  for update using (user_id = auth.uid());
