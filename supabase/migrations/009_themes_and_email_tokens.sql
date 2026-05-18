-- Migration 009: Custom themes table and email digest fields

create table if not exists custom_themes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  css_overrides text not null default '',
  is_active    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table custom_themes enable row level security;

-- Only admins can manage themes; public can read the active theme for rendering
create policy "themes_select_all" on custom_themes for select using (true);

-- Trigger to keep updated_at current
create trigger custom_themes_updated_at
  before update on custom_themes
  for each row execute function moddatetime(updated_at);
