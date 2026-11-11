import type { MerchantRegistry } from "./lookupMerchant";
import { emailDomainOf, matchesVerifiedMerchant } from "./nameSimilarity";
import type { Merchant } from "./types";

/**
 * READ-ONLY merchant registry backed by the `verified_merchants` table.
 * It only calls dbLookupMerchant / dbGetMerchantRegistryStubs (both selects)
 * and never touches the shared `supabase` client directly, so the Guard Agent
 * cannot write to the database through it.
 */

type DbModule = typeof import("./dbConnection");

let dbModule: Promise<DbModule> | null = null;

/**
 * dbConnection creates the Supabase client the moment it is imported and
 * crashes if the env vars are missing. Import it lazily, and only when the
 * variables exist, so the in-memory fallback keeps working without config.
 */
function loadDb(): Promise<DbModule> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return Promise.reject(new Error("Supabase is not configured (missing URL or anon key)."));
  }
  dbModule ??= import("./dbConnection").catch((error: unknown) => {
    dbModule = null;
    throw error;
  });
  return dbModule;
}

/** Names go to dbLookupMerchant's ilike, where % _ and \ are pattern characters, not plain text. */
const hasPatternCharacters = (value: string): boolean => /[%_\\]/.test(value);

/** Convert a raw database row into a Merchant, or null if the row is unusable. */
function rowToMerchant(row: unknown): Merchant | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const amount = Number(r.historical_median_amount);
  if (
    r.id === null ||
    r.id === undefined ||
    typeof r.merchant_name !== "string" ||
    typeof r.target_email !== "string" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  // Prefer the email_domain column; fall back to the domain of target_email.
  const domain =
    typeof r.email_domain === "string" && r.email_domain.trim() !== ""
      ? r.email_domain.trim().toLowerCase()
      : emailDomainOf(r.target_email);
  if (!domain) return null;

  return {
    id: String(r.id),
    name: r.merchant_name,
    email: r.target_email,
    emailDomain: domain,
    typicalAmount: amount,
  };
}

const CACHE_TTL_MS = 30_000;
let cache: { at: number; merchants: Merchant[] } | null = null;

/** Fetch every verified merchant. Cached briefly so a payment does not cost one query per merchant. */
async function fetchAll(): Promise<Merchant[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.merchants;

  const db = await loadDb();
  const stubs: Array<{ merchant_name?: unknown }> = await db.dbGetMerchantRegistryStubs();

  // The stubs call has no id or amount, so fetch each full row by its own name.
  const names = stubs
    .map((s) => s.merchant_name)
    .filter((n): n is string => typeof n === "string" && !hasPatternCharacters(n));
  const rows = await Promise.all(names.map((n) => db.dbLookupMerchant(n)));

  const merchants = rows.map(rowToMerchant).filter((m): m is Merchant => m !== null);
  cache = { at: Date.now(), merchants };
  return merchants;
}

export const supabaseRegistry: MerchantRegistry = {
  async findByNameAndEmail(name, email) {
    // Match locally: the payee text never reaches a database query.
    const merchants = await fetchAll();
    return merchants.find((m) => matchesVerifiedMerchant(m, name, email)) ?? null;
  },

  async listAll() {
    return [...(await fetchAll())];
  },
};
