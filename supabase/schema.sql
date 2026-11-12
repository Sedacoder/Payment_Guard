-- Payment Guard — Supabase schema
--
-- Apply this in the Supabase SQL editor. It is idempotent and non-destructive:
-- existing tables are extended rather than dropped, so it is safe to re-run on
-- top of the team's earlier setup.
--
-- The app still runs without Supabase. When NEXT_PUBLIC_SUPABASE_URL and
-- NEXT_PUBLIC_SUPABASE_ANON_KEY exist, the registry and telemetry switch to
-- these tables. Reads and Realtime use the anon key; writes use
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Verified merchant registry
-- ---------------------------------------------------------------------------
create table if not exists public.verified_merchants (
  id uuid primary key default gen_random_uuid(),
  merchant_name text not null,
  target_email text not null,
  email_domain text,
  historical_median_amount numeric not null default 0,
  legitimacy_score numeric not null default 0.95,
  created_at timestamptz not null default now(),
  unique (merchant_name, target_email)
);

-- Extend a table created by an earlier revision of the project.
alter table public.verified_merchants
  add column if not exists email_domain text;
alter table public.verified_merchants
  add column if not exists legitimacy_score numeric not null default 0.95;
alter table public.verified_merchants
  add column if not exists created_at timestamptz not null default now();

-- Seed only missing rows; never overwrite values the team already tuned.
insert into public.verified_merchants
  (merchant_name, target_email, email_domain, historical_median_amount, legitimacy_score)
values
  ('Naivas Supermarket', 'payments@naivas.co.ke', 'naivas.co.ke', 2500, 0.98),
  ('Equity Bank', 'settlements@equitybank.co.ke', 'equitybank.co.ke', 10000, 0.99),
  ('QuickMart', 'pos@quickmart.co.ke', 'quickmart.co.ke', 3400, 0.95)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Security audit log (feeds the AG Grid dashboard)
-- ---------------------------------------------------------------------------
create table if not exists public.security_audits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  transaction_id text,
  merchant_id text not null default 'unverified',
  payee_name text not null,
  target_email text not null default '',
  transaction_amount numeric not null default 0,
  currency text not null default 'KES',
  ip_address text not null default '—',
  domain_signature text not null default 'unknown',
  risk_score numeric not null default 0,
  verdict text not null check (verdict in ('ALLOW', 'WARN', 'BLOCK')),
  rule_flags text[] not null default '{}',
  execution_time_ms integer not null default 0,
  reason text not null default '',
  suggestion text,
  similarity numeric,
  ai_used boolean not null default false,
  -- Legacy column from the first revision; kept so older code still inserts.
  amount numeric
);

-- Extend a table created before the dashboard contract was finalised.
alter table public.security_audits
  add column if not exists created_at timestamptz not null default now();
alter table public.security_audits
  add column if not exists transaction_id text;
alter table public.security_audits
  add column if not exists merchant_id text not null default 'unverified';
alter table public.security_audits
  add column if not exists target_email text not null default '';
alter table public.security_audits
  add column if not exists transaction_amount numeric not null default 0;
alter table public.security_audits
  add column if not exists currency text not null default 'KES';
alter table public.security_audits
  add column if not exists ip_address text not null default '—';
alter table public.security_audits
  add column if not exists domain_signature text not null default 'unknown';
alter table public.security_audits
  add column if not exists risk_score numeric not null default 0;
alter table public.security_audits
  add column if not exists rule_flags text[] not null default '{}';
alter table public.security_audits
  add column if not exists execution_time_ms integer not null default 0;
alter table public.security_audits
  add column if not exists suggestion text;
alter table public.security_audits
  add column if not exists similarity numeric;
alter table public.security_audits
  add column if not exists ai_used boolean not null default false;
alter table public.security_audits
  add column if not exists amount numeric;

-- The first revision required these at insert time; the app links them later.
alter table public.security_audits alter column transaction_id drop not null;
alter table public.security_audits alter column amount drop not null;
alter table public.security_audits alter column amount set default 0;

-- The first revision also made payee_name and transaction_id unique. An audit
-- log records every attempt, so the same merchant must be allowed to appear
-- many times, and one order may be touched by several events.
alter table public.security_audits
  drop constraint if exists security_audits_payee_name_key;
alter table public.security_audits
  drop constraint if exists security_audits_transaction_id_key;

-- Backfill the legacy amount into the dashboard column.
update public.security_audits
  set transaction_amount = amount
  where transaction_amount = 0 and amount is not null;

create index if not exists security_audits_created_at_idx
  on public.security_audits (created_at desc);
create index if not exists security_audits_transaction_id_idx
  on public.security_audits (transaction_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.verified_merchants enable row level security;
alter table public.security_audits enable row level security;

drop policy if exists "verified_merchants_public_read" on public.verified_merchants;
create policy "verified_merchants_public_read"
  on public.verified_merchants for select
  to anon, authenticated
  using (true);

drop policy if exists "security_audits_public_read" on public.security_audits;
create policy "security_audits_public_read"
  on public.security_audits for select
  to anon, authenticated
  using (true);

-- Writes go through SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. The anon key
-- must therefore not be able to insert or update audit rows: otherwise any
-- browser holding it could forge a verdict or mark its own payment as ALLOW.
-- These drops remove the sandbox policies from the first revision.
--
-- Local demo without a service-role key? Uncomment the two policies below to
-- restore the old behaviour. Never do this on a shared or production project.
drop policy if exists "security_audits_demo_insert" on public.security_audits;
drop policy if exists "security_audits_demo_update" on public.security_audits;

-- create policy "security_audits_demo_insert"
--   on public.security_audits for insert
--   to anon, authenticated
--   with check (true);
--
-- create policy "security_audits_demo_update"
--   on public.security_audits for update
--   to anon, authenticated
--   using (true)
--   with check (true);

-- ---------------------------------------------------------------------------
-- Realtime (used by the admin dashboard)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'security_audits'
  ) then
    alter publication supabase_realtime add table public.security_audits;
  end if;
end $$;

-- Realtime UPDATE payloads need the full row.
alter table public.security_audits replica identity full;

-- Remove connection-probe rows left by the setup checks.
delete from public.security_audits where payee_name = 'Probe';
