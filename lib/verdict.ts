import { listVerifiedMerchants, lookupMerchant } from "./lookupMerchant";
import { findClosestMerchant } from "./nameSimilarity";
import type { GuardInput, GuardResult, Merchant } from "./types";

/** BLOCK when a non-verified payee's name is MORE than this similar to a verified one. */
export const SIMILARITY_THRESHOLD = 0.8;
/** WARN when the amount is MORE than this many times the merchant's usual amount. */
export const AMOUNT_MULTIPLIER = 5;

const isValidInput = (input: GuardInput): boolean =>
  input.payeeName.trim() !== "" &&
  input.targetEmail.trim() !== "" &&
  Number.isFinite(input.transactionAmount) &&
  input.transactionAmount > 0;

/**
 * Pure rule engine from claude.md. No database or network access.
 * @param verified the merchant matching BOTH name and email exactly, or null
 * @param allMerchants every verified merchant (for the look-alike check)
 */
export function decideVerdict(
  input: GuardInput,
  verified: Merchant | null,
  allMerchants: readonly Merchant[],
): GuardResult {
  if (!isValidInput(input)) {
    return { verdict: "BLOCK", reason: "Invalid payment details." };
  }

  if (verified) {
    if (input.transactionAmount > verified.typicalAmount * AMOUNT_MULTIPLIER) {
      return {
        verdict: "WARN",
        reason: `Amount is more than ${AMOUNT_MULTIPLIER}x the usual amount for ${verified.name}.`,
      };
    }
    return { verdict: "ALLOW", reason: `Verified merchant: ${verified.name}.` };
  }

  const closest = findClosestMerchant(input.payeeName, allMerchants);
  if (closest && closest.similarity > SIMILARITY_THRESHOLD) {
    return {
      verdict: "BLOCK",
      reason: `Merchant not verified. Name closely resembles ${closest.merchant.name}.`,
      suggestion: `Did you mean ${closest.merchant.name}?`,
      similarity: closest.similarity,
    };
  }

  return {
    verdict: "BLOCK",
    reason: "Merchant not verified.",
    ...(closest ? { similarity: closest.similarity } : {}),
  };
}

/** Looks up the registry, then applies decideVerdict. Used next to the LLM in the agent. */
export async function checkDeterministic(input: GuardInput): Promise<GuardResult> {
  const [verified, all] = await Promise.all([
    lookupMerchant(input.payeeName, input.targetEmail),
    listVerifiedMerchants(),
  ]);
  return decideVerdict(input, verified, all);
}
