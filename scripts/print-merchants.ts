/**
 * READ-ONLY: prints the exact verified_merchants rows from Supabase.
 * Uses only dbListVerifiedMerchants (a select).
 * Run from the project root:  npx vite-node scripts/print-merchants.ts
 */
import { loadLocalEnv } from "../lib/loadEnv";

async function main(): Promise<void> {
  console.log(loadLocalEnv() ? "Loaded .env.local" : "No .env.local found");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.log("Supabase variables are missing.");
    process.exit(2);
  }

  const { dbListVerifiedMerchants } = await import("../lib/dbConnection");
  const merchants = await dbListVerifiedMerchants();
  console.log(`Listed ${merchants.length} merchants.`);
  for (const merchant of merchants) {
    console.log(JSON.stringify(merchant));
  }
}

main().catch((error) => {
  console.error("Supabase NOT reachable:", error instanceof Error ? error.message : error);
  process.exit(1);
});
