/**
 * Smoke test: can we reach Supabase, and do the shipped exploit cases get the
 * expected verdicts against the real registry?
 * Run from the project root:  npx vite-node scripts/check-registry.ts
 */
import { readFileSync } from "node:fs";

import { loadLocalEnv } from "../lib/loadEnv";
import { supabaseRegistry } from "../lib/supabaseRegistry";
import { checkDeterministic } from "../lib/verdict";
import type { GuardInput, Verdict } from "../lib/types";

interface ExploitCase extends GuardInput {
  id: number;
  expectedVerdict: Verdict;
}

async function main(): Promise<void> {
  console.log(loadLocalEnv() ? "Loaded .env.local" : "No .env.local found (using shell env only)");

  try {
    const merchants = await supabaseRegistry.listAll();
    console.log(`Supabase reachable: ${merchants.length} verified merchants`);
    for (const m of merchants) console.log(`  - ${m.name} <${m.email}> usual amount ${m.typicalAmount}`);
  } catch (error) {
    console.log("Supabase NOT reachable, the app will use the in-memory fallback:");
    console.log(" ", error instanceof Error ? error.message : error);
  }

  const cases = JSON.parse(readFileSync("lib/mock-exploits.json", "utf8")) as ExploitCase[];
  let mismatches = 0;
  for (const c of cases) {
    const result = await checkDeterministic(c);
    const ok = result.verdict === c.expectedVerdict;
    if (!ok) mismatches++;
    console.log(`case ${c.id}: ${ok ? "OK " : "BAD"} got ${result.verdict}, expected ${c.expectedVerdict}`);
  }
  console.log(mismatches === 0 ? "All cases match." : `${mismatches} case(s) differ.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
