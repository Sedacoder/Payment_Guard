import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { inMemoryRegistry } from "@/lib/lookupMerchant";
import { sameMerchantName } from "@/lib/nameSimilarity";
import { AMOUNT_MULTIPLIER } from "@/lib/verdict";

/**
 * The demo WARN amounts live in files that do not export them, so this test
 * reads their source text. It uses the in-memory stub (not Supabase) so CI is
 * predictable; keep the stub in sync with scripts/print-merchants.ts.
 */

interface DemoWarn {
  payeeName: string;
  amount: number;
}

const NUMBER = String.raw`(\d+(?:\.\d+)?)`;

const SOURCES: ReadonlyArray<{ file: string; path: string; pattern: RegExp }> = [
  {
    file: "app/terminal/page.tsx (Amount spike scenario)",
    path: "../app/terminal/page.tsx",
    pattern: new RegExp(
      String.raw`label:\s*"Amount spike"[\s\S]*?payeeName:\s*"([^"]+)"[\s\S]*?transactionAmount:\s*"?${NUMBER}"?`,
    ),
  },
  {
    file: "lib/telemetry-seed.ts (DEMO_WARN_CASE)",
    path: "../lib/telemetry-seed.ts",
    pattern: new RegExp(
      String.raw`DEMO_WARN_CASE[^=]*=\s*\{[\s\S]*?payeeName:\s*"([^"]+)"[\s\S]*?transactionAmount:\s*${NUMBER}`,
    ),
  },
];

function readDemoWarn(path: string, pattern: RegExp, file: string): DemoWarn {
  const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const match = pattern.exec(source);
  if (!match) {
    throw new Error(
      `Could not find the demo WARN payee and amount in ${file}. If the file was reformatted, update the pattern in tests/demoAmounts.test.ts.`,
    );
  }
  return { payeeName: match[1], amount: Number(match[2]) };
}

describe("demo WARN amounts stay above the WARN line", () => {
  it.each(SOURCES.map((s) => [s.file, s] as const))("%s", async (_file, source) => {
    const demo = readDemoWarn(source.path, source.pattern, source.file);

    const merchants = await inMemoryRegistry.listAll();
    const merchant = merchants.find((m) => sameMerchantName(demo.payeeName, m.name));
    expect(merchant, `${demo.payeeName} is not in the registry`).toBeDefined();

    const warnLine = merchant!.typicalAmount * AMOUNT_MULTIPLIER;
    expect(
      demo.amount,
      `${demo.amount} must be more than ${AMOUNT_MULTIPLIER}x ${merchant!.name}'s median (${merchant!.typicalAmount}) = ${warnLine}`,
    ).toBeGreaterThan(warnLine);
  });
});
