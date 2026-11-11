import { runSecurityAgent, type AgentResult } from "./agent";
import { lookupMerchant } from "./lookupMerchant";
import {
  createTelemetryRecord,
  persistTelemetry,
  recordTelemetry,
  type TelemetryRecord,
} from "./telemetry";
import type { GuardInput } from "./types";

export interface InterceptContext {
  ipAddress?: string;
  domainSignature?: string;
  currency?: string;
}

export interface InterceptOutcome {
  result: AgentResult;
  telemetry: TelemetryRecord;
}

/**
 * One guarded evaluation: run the rule engine and optional AI advisory, then
 * publish the result to telemetry. Routes must call this before any money
 * movement; the payment rail never runs first.
 */
export async function interceptPayment(
  input: GuardInput,
  context: InterceptContext = {},
): Promise<InterceptOutcome> {
  const result = await runSecurityAgent(input);
  const merchant = await lookupMerchant(input.payeeName, input.targetEmail);

  const telemetry = createTelemetryRecord({
    input,
    result,
    context: {
      ...context,
      merchantId: merchant?.id ?? "unverified",
    },
  });
  recordTelemetry(telemetry);
  // Best-effort live copy; the in-memory sink above is the demo fallback.
  await persistTelemetry(telemetry);

  return { result, telemetry };
}
