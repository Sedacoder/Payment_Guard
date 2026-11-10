import type { Merchant } from "./types";

/**
 * Read-only view of the verified merchant registry.
 * To move to Supabase later, write another object that implements this
 * interface and point `registry` (below) at it. Nothing else changes.
 */
export interface MerchantRegistry {
  findByNameAndEmail(name: string, email: string): Promise<Merchant | null>;
  listAll(): Promise<Merchant[]>;
}

const normalize = (value: string): string => value.trim().toLowerCase();

/** Stub data: the legitimate merchants from lib/mock-exploits.json. */
const STUB_MERCHANTS: readonly Merchant[] = [
  { id: "m1", name: "Naivas Supermarket", email: "pay@naivas.co.ke", typicalAmount: 2500 },
  { id: "m2", name: "Equity Bank Teller", email: "cashier@equitybank.co.ke", typicalAmount: 10000 },
  { id: "m3", name: "QuickMart Supermarket", email: "till@quickmart.co.ke", typicalAmount: 3400 },
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

/** The single place the rest of the app gets its registry from. */
const registry: MerchantRegistry = inMemoryRegistry;

/**
 * Tool the Guard Agent calls. Returns the verified merchant only when BOTH
 * name and email match exactly; otherwise null (= unverified payee).
 */
export function lookupMerchant(payeeName: string, targetEmail: string): Promise<Merchant | null> {
  return registry.findByNameAndEmail(payeeName, targetEmail);
}

/** All verified merchants, for the later name-similarity check. */
export function listVerifiedMerchants(): Promise<Merchant[]> {
  return registry.listAll();
}
