import mockExploits from "./mock-exploits.json";
import { deriveRuleFlags } from "./agent";
import { lookupMerchant } from "./lookupMerchant";
import { createTelemetryRecord, recordTelemetry, telemetryStore } from "./telemetry";
import { checkDeterministic } from "./verdict";
import type { GuardInput } from "./types";

interface DemoCase {
  payeeName: string;
  targetEmail: string;
  transactionAmount: number;
}

/**
 * The shipped mock dataset has no WARN case, but the demo needs all three
 * verdicts on screen. Naivas normally receives 2,500; 20,000 is above 5x.
 */
const DEMO_WARN_CASE: DemoCase = {
  payeeName: "Naivas Supermarket",
  targetEmail: "payments@naivas.co.ke",
  transactionAmount: 20000,
};

const DEMO_IPS = [
  "102.68.77.14",
  "41.90.12.88",
  "196.201.214.7",
  "154.159.8.42",
  "197.248.55.19",
  "105.160.44.61",
  "41.215.99.203",
  "102.69.160.31",
  "41.90.75.120",
];

let seedPromise: Promise<void> | null = null;

/** Seed the dashboard once per server process, before the first read. */
export function seedTelemetry(): Promise<void> {
  if (telemetryStore.list(1).length > 0) return Promise.resolve();
  seedPromise ??= runSeed();
  return seedPromise;
}

async function runSeed(): Promise<void> {
  const cases: DemoCase[] = [...mockExploits, DEMO_WARN_CASE];
  const newest = Date.now();

  for (let index = 0; index < cases.length; index++) {
    const item = cases[index];
    const input: GuardInput = {
      payeeName: item.payeeName,
      targetEmail: item.targetEmail,
      transactionAmount: item.transactionAmount,
    };
    const rule = await checkDeterministic(input);
    const merchant = await lookupMerchant(input.payeeName, input.targetEmail);

    recordTelemetry(
      createTelemetryRecord({
        input,
        result: {
          ...rule,
          flags: deriveRuleFlags(input, rule),
          aiUsed: false,
          latencyMs: 2 + ((index * 3) % 9),
        },
        context: {
          merchantId: merchant?.id ?? "unverified",
          ipAddress: DEMO_IPS[index % DEMO_IPS.length],
          createdAt: new Date(newest - (cases.length - index) * 45000),
        },
      }),
    );
  }
}
