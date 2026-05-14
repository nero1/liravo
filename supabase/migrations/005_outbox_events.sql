-- Bugfix: durable outbox for non-critical side effects to reduce thundering herd and preserve intent under failures.
create table if not exists outbox_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processed','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_outbox_pending_created on outbox_events(status, created_at);
create index if not exists idx_outbox_aggregate on outbox_events(aggregate_type, aggregate_id);
