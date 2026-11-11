import { matchesVerifiedMerchant } from "./nameSimilarity";
import { supabaseRegistry } from "./supabaseRegistry";
import type { Merchant } from "./types";

/**
 * Read-only view of the verified merchant registry.
 * Any backend that implements this interface can be plugged in at `registry` (below).
 */
export interface MerchantRegistry {
  findByNameAndEmail(name: string, email: string): Promise<Merchant | null>;
  listAll(): Promise<Merchant[]>;
}

/**
 * Fallback data: an exact copy of the verified_merchants rows in Supabase
 * (read with scripts/print-merchants.ts). Update it from that script, never by hand.
 */
const STUB_MERCHANTS: readonly Merchant[] = [
  { id: "f3a042d3-49cf-4eff-bbe8-72c04e14b06c", name: "Naivas Supermarket", email: "payments@naivas.co.ke", emailDomain: "naivas.co.ke", typicalAmount: 2500 },
  { id: "a739a484-fb21-411f-a7f9-0a66e42254a7", name: "Equity Bank", email: "settlements@equitybank.co.ke", emailDomain: "equitybank.co.ke", typicalAmount: 5000 },
  { id: "6b4eb8fe-e5cf-449a-9d65-80d983811d4e", name: "QuickMart", email: "pos@quickmart.co.ke", emailDomain: "quickmart.co.ke", typicalAmount: 1500 },
  { id: "5738b74a-d648-4a3a-8045-3283a508c030", name: "Java House", email: "orders@javahouse.africa", emailDomain: "javahouse.africa", typicalAmount: 1200 },
  { id: "7542362e-43ee-43dc-8cf2-5bfab90a811e", name: "Safaricom", email: "paybills@safaricom.co.ke", emailDomain: "safaricom.co.ke", typicalAmount: 3000 },
  { id: "cf960b5c-4e57-49b1-87e1-64b8f4cffee6", name: "KPLC", email: "tokens@kplc.co.ke", emailDomain: "kplc.co.ke", typicalAmount: 2000 },
  { id: "3503e082-1446-46fe-8cb9-e2bd3b82d50e", name: "Zuku", email: "billing@zuku.co.ke", emailDomain: "zuku.co.ke", typicalAmount: 3500 },
];

export const inMemoryRegistry: MerchantRegistry = {
  async findByNameAndEmail(name, email) {
    return STUB_MERCHANTS.find((m) => matchesVerifiedMerchant(m, name, email)) ?? null;
  },
  async listAll() {
    return [...STUB_MERCHANTS];
  },
};

const DB_TIMEOUT_MS = 3000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Registry timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

let warnedAboutFallback = false;

/**
 * Use `primary`; if it throws, is not configured, or is too slow, use `fallback`.
 * A "not found" answer from `primary` is final and never triggers the fallback,
 * so a merchant removed from the database cannot be revived by stale stub data.
 */
export function withFallback(
  primary: MerchantRegistry,
  fallback: MerchantRegistry,
  timeoutMs: number = DB_TIMEOUT_MS,
): MerchantRegistry {
  async function attempt<T>(run: (registry: MerchantRegistry) => Promise<T>): Promise<T> {
    try {
      return await withTimeout(run(primary), timeoutMs);
    } catch (error) {
      if (!warnedAboutFallback) {
        warnedAboutFallback = true;
        console.warn(
          "[payment-guard] merchant database unavailable, using in-memory fallback:",
          error instanceof Error ? error.message : error,
        );
      }
      return run(fallback);
    }
  }

  return {
    findByNameAndEmail: (name, email) => attempt((r) => r.findByNameAndEmail(name, email)),
    listAll: () => attempt((r) => r.listAll()),
  };
}

/** The single place the rest of the app gets its registry from: Supabase, then the stub. */
const registry: MerchantRegistry = withFallback(supabaseRegistry, inMemoryRegistry);

/**
 * Tool the Guard Agent calls. Returns the verified merchant only when the name
 * is the same merchant AND the email domain is that merchant's domain; otherwise null (= unverified payee).
 */
export function lookupMerchant(payeeName: string, targetEmail: string): Promise<Merchant | null> {
  return registry.findByNameAndEmail(payeeName, targetEmail);
}

/** All verified merchants, for the later name-similarity check. */
export function listVerifiedMerchants(): Promise<Merchant[]> {
  return registry.listAll();
}
