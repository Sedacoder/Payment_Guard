-- Payment Guard — Supabase schema
--
-- Apply this once in the Supabase SQL editor. It is idempotent: existing
-- tables are extended rather than dropped, so it is safe to re-run after the
-- team's manual setup.
--
-- The app still runs without Supabase. When NEXT_PUBLIC_SUPABASE_URL and
-- NEXT_PUBLIC_SUPABASE_ANON_KEY exist, the registry and telemetry switch to
-- these tables; writes use SUPABASE_SERVICE_ROLE_KEY when provided.

-- ---------------------------------------------------------------------------
-- Verified merchant registry
-- ---------------------------------------------------------------------------
create table if not exists public.verified_merchants (
  id uuid primary key default gen_random_uuid(),
  merchant_name text not null,
  target_email text not null,
  email_domain text,
  historical_median_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (merchant_name, target_email)
);

insert into public.verified_merchants
  (merchant_name, target_email, email_domain, historical_median_amount)
values
  ('Naivas Supermarket', 'payments@naivas.co.ke', 'naivas.co.ke', 2500),
  ('Equity Bank', 'settlements@equitybank.co.ke', 'equitybank.co.ke', 10000),
  ('QuickMart', 'pos@quickmart.co.ke', 'quickmart.co.ke', 3400)
on conflict (merchant_name, target_email) do update
  set email_domain = excluded.email_domain,
      historical_median_amount = excluded.historical_median_amount;

-- ---------------------------------------------------------------------------
-- Security audit log (feeds the AG Grid dashboard)
-- ---------------------------------------------------------------------------
create table if not exists public.security_audits (
  id text primary key,
  created_at timestamptz not null default now(),
  transaction_id text,
  merchant_id text not null default 'unverified',
  payee_name text not null,
  target_email text not null,
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
  ai_used boolean not null default false
);

-- Extend a table created before the dashboard contract was finalised.
alter table public.security_audits add column if not exists transaction_id text;
alter table public.security_audits add column if not exists merchant_id text not null default 'unverified';
alter table public.security_audits add column if not exists ip_address text not null default '—';
alter table public.security_audits add column if not exists domain_signature text not null default 'unknown';
alter table public.security_audits add column if not exists similarity numeric;
alter table public.security_audits add column if not exists suggestion text;
alter table public.security_audits add column if not exists ai_used boolean not null default false;

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

-- Writes are intentionally server-only. The API uses the service-role key,
-- which bypasses RLS. Do not add anon insert/update policies: that would let
-- a browser forge audit rows or mark its own payment as ALLOW.

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
