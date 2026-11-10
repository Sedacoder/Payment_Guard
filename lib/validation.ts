import type { GuardInput } from "./types";

export type ParseGuardInputResult =
  | { ok: true; input: GuardInput }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PAYEE_LENGTH = 200;
const MAX_EMAIL_LENGTH = 320;

/**
 * Validates the raw JSON body before it reaches the Guard Agent.
 * Strict types matter here: prompt-injection payloads are still just
 * strings, but the agent must never receive an object it did not expect.
 */
export function parseGuardInput(raw: unknown): ParseGuardInputResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const body = raw as Record<string, unknown>;
  const payeeName = typeof body.payeeName === "string" ? body.payeeName.trim() : "";
  const targetEmail = typeof body.targetEmail === "string" ? body.targetEmail.trim() : "";
  const transactionAmount = body.transactionAmount;

  if (!payeeName) {
    return { ok: false, error: "payeeName is required." };
  }
  if (payeeName.length > MAX_PAYEE_LENGTH) {
    return { ok: false, error: `payeeName must be ${MAX_PAYEE_LENGTH} characters or fewer.` };
  }
  if (!targetEmail) {
    return { ok: false, error: "targetEmail is required." };
  }
  if (targetEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(targetEmail)) {
    return { ok: false, error: "targetEmail must be a valid email address." };
  }
  if (typeof transactionAmount !== "number" || !Number.isFinite(transactionAmount)) {
    return { ok: false, error: "transactionAmount must be a finite number." };
  }
  if (transactionAmount <= 0) {
    return { ok: false, error: "transactionAmount must be greater than zero." };
  }

  return {
    ok: true,
    input: { payeeName, targetEmail, transactionAmount },
  };
}
