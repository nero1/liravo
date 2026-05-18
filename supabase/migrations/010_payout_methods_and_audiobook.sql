-- User payout methods (bank account details for Paystack transfers, etc.)
create table if not exists user_payout_methods (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references users(id) on delete cascade,
  provider                 text not null check (provider in ('paystack', 'dodopayments')),
  display_name             text not null,
  account_number           text not null,
  bank_code                text not null,
  currency                 text not null default 'NGN',
  paystack_recipient_code  text,
  is_default               boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique(user_id, provider)
);

alter table user_payout_methods enable row level security;

create policy "Users can manage their own payout methods"
  on user_payout_methods for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- books.has_audiobook (already in types/database.ts, ensure column exists)
alter table books
  add column if not exists has_audiobook boolean not null default false;

-- Trigger to keep updated_at current on user_payout_methods
create trigger user_payout_methods_updated_at
  before update on user_payout_methods
  for each row execute function moddatetime(updated_at);

-- payout_requests table (used by the request-payout route fallback path)
create table if not exists payout_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  amount           numeric(10,2) not null,
  method           text not null default 'dodopayments',
  status           text not null default 'pending'
                     check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  idempotency_key  text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table payout_requests enable row level security;

create policy "Users can view their own payout requests"
  on payout_requests for select
  using (auth.uid() = user_id);

create trigger payout_requests_updated_at
  before update on payout_requests
  for each row execute function moddatetime(updated_at);
