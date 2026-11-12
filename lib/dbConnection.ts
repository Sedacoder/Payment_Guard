import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { emailDomainOf, matchesVerifiedMerchant } from "./nameSimilarity";
import type { Merchant } from "./types";

/**
 * Supabase is optional. The demo runs on the in-memory registry and in-memory
 * telemetry until these variables exist, so nothing here may run at module
 * scope or throw during a build with no credentials.
 */
/** Treat an empty env var (e.g. `KEY=`) as absent. */
const envValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const SUPABASE_URL = envValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPABASE_ANON_KEY = envValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const SUPABASE_SERVICE_ROLE_KEY = envValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function hasSupabaseServiceRole(): boolean {
  return Boolean(SUPABASE_SERVICE_ROLE_KEY);
}

let anonClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function requireUrl(): string {
  if (!SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }
  return SUPABASE_URL;
}

/** Read-only client. Safe for public reads and Realtime subscriptions. */
export function getSupabaseClient(): SupabaseClient {
  if (!SUPABASE_ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
  }
  anonClient ??= createClient(requireUrl(), SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  return anonClient;
}

/**
 * Server-only client used for writes. Prefers the service-role key so RLS can
 * stay locked down; falls back to the anon key so local demos still work when
 * only the public credentials are present.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!SUPABASE_ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
  }
  const key = SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY;
  adminClient ??= createClient(requireUrl(), key, {
    auth: { persistSession: false },
  });
  return adminClient;
}

interface MerchantRow {
  id: string;
  merchant_name: string;
  target_email: string;
  email_domain?: string | null;
  historical_median_amount: number | string | null;
}

function mapMerchant(row: MerchantRow): Merchant {
  return {
    id: String(row.id),
    name: row.merchant_name,
    email: row.target_email,
    emailDomain:
      row.email_domain?.trim().toLowerCase() || emailDomainOf(row.target_email) || "",
    typicalAmount: Number(row.historical_median_amount ?? 0),
  };
}

const MERCHANT_COLUMNS =
  "id, merchant_name, target_email, email_domain, historical_median_amount";

const normalize = (value: string): string => value.trim().toLowerCase();

/**
 * Name + email-domain match against the verified registry.
 *
 * Matching happens in memory after one select, using the same rules as the
 * in-memory registry. The payee's text never becomes a query pattern, so `%`
 * or `_` in a name or email cannot wildcard its way into a verified merchant.
 */
export async function dbLookupMerchant(
  payeeName: string,
  targetEmail: string,
): Promise<Merchant | null> {
  const merchants = await dbListVerifiedMerchants();
  return merchants.find((merchant) => matchesVerifiedMerchant(merchant, payeeName, targetEmail)) ?? null;
}

export async function dbListVerifiedMerchants(): Promise<Merchant[]> {
  const { data, error } = await getSupabaseClient()
    .from("verified_merchants")
    .select(MERCHANT_COLUMNS);

  if (error) throw new Error(`Supabase registry read failed: ${error.message}`);
  return ((data ?? []) as MerchantRow[]).map(mapMerchant);
}

/** Compatibility helper: look a merchant up by name only, ignoring the email. */
export async function dbFindMerchantByName(name: string): Promise<Merchant | null> {
  const merchants = await dbListVerifiedMerchants();
  const target = normalize(name);
  return merchants.find((merchant) => normalize(merchant.name) === target) ?? null;
}
