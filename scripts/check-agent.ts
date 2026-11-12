/**
 * Runs the Guard Agent on every case in lib/mock-exploits.json and shows, per case,
 * what the RULES said, what the AI said on its own, and the FINAL combined verdict.
 *
 * runSecurityAgent does not expose the AI's own answer, so this script repeats its
 * three steps with the same exported pieces (one AI call per case, no extra cost):
 *   checkDeterministic -> runAiAdvisory -> combineVerdicts
 *
 * With ANTHROPIC_API_KEY set this makes real API calls (a few cents in total).
 * Run from the project root:  npx vite-node scripts/check-agent.ts
 */
import { readFileSync } from "node:fs";

import { combineVerdicts, runAiAdvisory } from "../lib/agent";
import { loadLocalEnv } from "../lib/loadEnv";
import { checkDeterministic } from "../lib/verdict";
import type { GuardInput, GuardResult, Verdict } from "../lib/types";

interface ExploitCase extends GuardInput {
  id: number;
  expectedVerdict: Verdict;
}

/** One line, shortened, so injection payloads with newlines stay readable. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

type AiOutcome =
  | { kind: "answered"; result: GuardResult; ms: number }
  | { kind: "none"; why: string }
  | { kind: "error"; why: string };

async function askAi(input: GuardInput, enabled: boolean): Promise<AiOutcome> {
  if (!enabled) return { kind: "none", why: "AI is off (no key, or PAYMENT_GUARD_AI=off)" };
  const started = performance.now();
  try {
    const result = await runAiAdvisory(input);
    if (!result) return { kind: "none", why: "no usable answer (bad JSON or too many tool turns)" };
    return { kind: "answered", result, ms: Math.round(performance.now() - started) };
  } catch (error) {
    return { kind: "error", why: error instanceof Error ? error.message : String(error) };
  }
}

async function main(): Promise<void> {
  console.log(loadLocalEnv() ? "Loaded .env.local" : "No .env.local found (using shell env only)");

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const aiOff = process.env.PAYMENT_GUARD_AI === "off";
  const aiEnabled = hasKey && !aiOff;
  console.log(`API key present: ${hasKey ? "yes" : "NO"}   PAYMENT_GUARD_AI=off: ${aiOff ? "yes" : "no"}`);
  console.log(`Model: ${process.env.ANTHROPIC_MODEL ?? "(default in lib/agent.ts)"}`);
  if (!aiEnabled) console.log("The AI will NOT run: every answer below comes from the rules alone.");
  console.log("");

  const cases = JSON.parse(readFileSync("lib/mock-exploits.json", "utf8")) as ExploitCase[];
  const rows: Array<Record<string, string | number>> = [];
  let mismatches = 0;
  let aiAnswers = 0;
  let aiWeaker = 0;
  let aiStricter = 0;
  const rank: Record<Verdict, number> = { ALLOW: 0, WARN: 1, BLOCK: 2 };

  for (const c of cases) {
    const input: GuardInput = {
      payeeName: c.payeeName,
      targetEmail: c.targetEmail,
      transactionAmount: c.transactionAmount,
    };
    const rule = await checkDeterministic(input);
    const ai = await askAi(input, aiEnabled);
    const advisory = ai.kind === "answered" ? ai.result : null;
    const final = combineVerdicts(rule, advisory);

    if (advisory) {
      aiAnswers++;
      if (rank[advisory.verdict] < rank[rule.verdict]) aiWeaker++;
      if (rank[advisory.verdict] > rank[rule.verdict]) aiStricter++;
    }
    const ok = final.verdict === c.expectedVerdict;
    if (!ok) mismatches++;

    rows.push({
      id: c.id,
      payee: oneLine(c.payeeName, 24),
      expected: c.expectedVerdict,
      rules: rule.verdict,
      ai: ai.kind === "answered" ? ai.result.verdict : ai.kind === "error" ? "ERROR" : "-",
      final: final.verdict,
      match: ok ? "OK" : "BAD",
      aiReason: oneLine(ai.kind === "answered" ? ai.result.reason : ai.why, 62),
    });
  }

  console.table(rows);
  console.log(`${cases.length - mismatches}/${cases.length} final verdicts match.`);
  console.log(
    `AI answered ${aiAnswers}/${cases.length}; AI stricter than rules in ${aiStricter}; ` +
      `AI weaker than rules in ${aiWeaker} (the rules win in that case).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
