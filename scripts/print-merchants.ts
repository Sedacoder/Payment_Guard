/**
 * READ-ONLY: prints the exact verified_merchants rows from Supabase.
 * Uses only dbGetMerchantRegistryStubs / dbLookupMerchant (both selects).
 * Run from the project root:  npx vite-node scripts/print-merchants.ts
 */
import { loadLocalEnv } from "../lib/loadEnv";

async function main(): Promise<void> {
  console.log(loadLocalEnv() ? "Loaded .env.local" : "No .env.local found");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.log("Supabase variables are missing.");
    process.exit(2);
  }

  const { dbGetMerchantRegistryStubs, dbLookupMerchant } = await import("../lib/dbConnection");
  const stubs = await dbGetMerchantRegistryStubs();
  console.log(`Listed ${stubs.length} merchants.`);
  for (const stub of stubs) {
    const row = await dbLookupMerchant(stub.merchant_name);
    console.log(JSON.stringify(row ?? { notFoundByName: stub }));
  }
}

main().catch((error) => {
  console.error("Supabase NOT reachable:", error instanceof Error ? error.message : error);
  process.exit(1);
});
