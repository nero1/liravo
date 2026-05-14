-- Bugfix: retry scheduling support for durable outbox worker.
alter table if exists outbox_events
  add column if not exists next_attempt_at timestamptz not null default now();

create index if not exists idx_outbox_retry_scan
  on outbox_events(status, next_attempt_at, created_at);
