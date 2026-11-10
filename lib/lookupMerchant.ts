import {
  dbListVerifiedMerchants,
  dbLookupMerchant,
  isSupabaseConfigured,
} from "./dbConnection";
import type { Merchant } from "./types";

/**
 * Read-only view of the verified merchant registry.
 * The app talks to this interface, never to Supabase directly, so the demo can
 * fall back to the seeded registry when no credentials are present.
 */
export interface MerchantRegistry {
  findByNameAndEmail(name: string, email: string): Promise<Merchant | null>;
  listAll(): Promise<Merchant[]>;
}

const normalize = (value: string): string => value.trim().toLowerCase();

/** Seed data mirroring the verified rows in Supabase. */
const STUB_MERCHANTS: readonly Merchant[] = [
  { id: "m1", name: "Naivas Supermarket", email: "payments@naivas.co.ke", typicalAmount: 2500 },
  { id: "m2", name: "Equity Bank", email: "settlements@equitybank.co.ke", typicalAmount: 10000 },
  { id: "m3", name: "QuickMart", email: "pos@quickmart.co.ke", typicalAmount: 3400 },
];

export const inMemoryRegistry: MerchantRegistry = {
  async findByNameAndEmail(name, email) {
    const n = normalize(name);
    const e = normalize(email);
    return (
      STUB_MERCHANTS.find((m) => normalize(m.name) === n && normalize(m.email) === e) ?? null
    );
  },
  async listAll() {
    return [...STUB_MERCHANTS];
  },
};

/**
 * Supabase-backed registry with a safety net: if the network or credentials
 * fail, fall back to the seed so checkout never hard-fails. A legitimate
 * "not found" (null) is NOT a failure and must stay a BLOCK.
 */
export const supabaseRegistry: MerchantRegistry = {
  async findByNameAndEmail(name, email) {
    try {
      return await dbLookupMerchant(name, email);
    } catch (error) {
      console.error(
        "[payment-guard] Supabase merchant lookup failed, using seeded registry:",
        error,
      );
      return inMemoryRegistry.findByNameAndEmail(name, email);
    }
  },
  async listAll() {
    try {
      return await dbListVerifiedMerchants();
    } catch (error) {
      console.error(
        "[payment-guard] Supabase registry read failed, using seeded registry:",
        error,
      );
      return inMemoryRegistry.listAll();
    }
  },
};

/** Resolved per call so a build-time import cannot freeze the choice. */
function getRegistry(): MerchantRegistry {
  return isSupabaseConfigured() ? supabaseRegistry : inMemoryRegistry;
}

/**
 * Tool the Guard Agent calls. Returns the verified merchant only when BOTH
 * name and email match exactly; otherwise null (= unverified payee).
 */
export function lookupMerchant(payeeName: string, targetEmail: string): Promise<Merchant | null> {
  return getRegistry().findByNameAndEmail(payeeName, targetEmail);
}

/** All verified merchants, for the name-similarity check. */
export function listVerifiedMerchants(): Promise<Merchant[]> {
  return getRegistry().listAll();
}

/** Exposed for diagnostics and tests. */
export function activeRegistryName(): "supabase" | "in-memory" {
  return isSupabaseConfigured() ? "supabase" : "in-memory";
}
