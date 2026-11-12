import { dbListVerifiedMerchants } from "./dbConnection";
import type { MerchantRegistry } from "./lookupMerchant";
import { matchesVerifiedMerchant } from "./nameSimilarity";
import type { Merchant } from "./types";

/**
 * READ-ONLY merchant registry backed by the `verified_merchants` table.
 *
 * It only calls dbListVerifiedMerchants (a select) and matches in memory, so
 * the payee's name and email never reach a database query and the Guard Agent
 * cannot write to the database through it.
 */

const CACHE_TTL_MS = 30_000;
let cache: { at: number; merchants: Merchant[] } | null = null;

/** Fetch every verified merchant. Cached briefly so a payment does not cost one query per merchant. */
async function fetchAll(): Promise<Merchant[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.merchants;

  const merchants = await dbListVerifiedMerchants();
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
