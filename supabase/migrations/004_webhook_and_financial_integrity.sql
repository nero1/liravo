-- Bugfix: enforce webhook idempotency at DB layer for payment integrity.
alter table if exists subscriptions
  add column if not exists provider_event_id text;

do $$ begin
  if to_regclass('public.subscriptions') is not null then
    create unique index if not exists ux_subscriptions_provider_event
      on subscriptions(provider, provider_event_id) where provider_event_id is not null;
  end if;
end $$;

-- Bugfix: immutable audit trail for money-affecting operations.
create table if not exists financial_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null,
  target_user_id uuid null,
  action text not null,
  amount numeric(12,2) null,
  currency text null,
  idempotency_key text null,
  provider text null,
  provider_event_id text null,
  correlation_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_audit_created_at on financial_audit_log(created_at desc);
create index if not exists idx_financial_audit_actor on financial_audit_log(actor_user_id);
