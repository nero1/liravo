-- Preserve deployments that created tables under the API's former names.
-- Legacy tables are retained for reconciliation; canonical rows win on conflicts.
do $$ begin
  if to_regclass('public.buddy_read_participants') is not null then
    insert into buddy_read_members(buddy_read_id,user_id)
      select buddy_read_id,user_id from buddy_read_participants on conflict do nothing;
  end if;
  if to_regclass('public.prompt_submissions') is not null then
    insert into writing_prompt_submissions(prompt_id,user_id,content,word_count,created_at)
      select prompt_id,user_id,content,word_count,created_at from prompt_submissions on conflict do nothing;
  end if;
end $$;
