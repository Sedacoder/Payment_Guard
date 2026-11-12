/**
 * Runs the full Guard Agent (rules + optional AI) on every case in
 * lib/mock-exploits.json and prints a comparison table.
 * With ANTHROPIC_API_KEY set this makes real API calls (a few cents in total).
 * Run from the project root:  npx vite-node scripts/check-agent.ts
 */
import { readFileSync } from "node:fs";

import { runSecurityAgent } from "../lib/agent";
import { loadLocalEnv } from "../lib/loadEnv";
import type { GuardInput, Verdict } from "../lib/types";

interface ExploitCase extends GuardInput {
  id: number;
  expectedVerdict: Verdict;
}

/** One line, shortened, so injection payloads with newlines stay readable. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

async function main(): Promise<void> {
  console.log(loadLocalEnv() ? "Loaded .env.local" : "No .env.local found (using shell env only)");

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const aiOff = process.env.PAYMENT_GUARD_AI === "off";
  console.log(`API key present: ${hasKey ? "yes" : "NO"}   PAYMENT_GUARD_AI=off: ${aiOff ? "yes" : "no"}`);
  console.log(`Model: ${process.env.ANTHROPIC_MODEL ?? "(default in lib/agent.ts)"}`);
  if (!hasKey || aiOff) console.log("The AI will NOT run: every answer below comes from the rules alone.\n");

  const cases = JSON.parse(readFileSync("lib/mock-exploits.json", "utf8")) as ExploitCase[];
  const rows: Array<Record<string, string | number>> = [];
  let mismatches = 0;
  let aiAnswers = 0;

  for (const c of cases) {
    const result = await runSecurityAgent({
      payeeName: c.payeeName,
      targetEmail: c.targetEmail,
      transactionAmount: c.transactionAmount,
    });
    if (result.aiUsed) aiAnswers++;
    const ok = result.verdict === c.expectedVerdict;
    if (!ok) mismatches++;
    rows.push({
      id: c.id,
      payee: oneLine(c.payeeName, 28),
      expected: c.expectedVerdict,
      final: result.verdict,
      match: ok ? "OK" : "BAD",
      answeredBy: result.aiUsed ? "AI + rules" : "rules only",
      ms: result.latencyMs,
      reason: oneLine(result.reason, 70),
    });
  }

  console.table(rows);
  console.log(`${cases.length - mismatches}/${cases.length} match. AI answered ${aiAnswers}/${cases.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
