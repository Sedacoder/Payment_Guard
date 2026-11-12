import { listVerifiedMerchants } from "./lookupMerchant";
import {
  containsMerchantName,
  emailDomainOf,
  findClosestMerchant,
  hasInjectionMarker,
  matchesVerifiedMerchant,
  sameMerchantName,
} from "./nameSimilarity";
import type { GuardInput, GuardResult, Merchant } from "./types";

/** BLOCK when a payee's name is MORE than this similar to a verified merchant, but not the same one. */
export const SIMILARITY_THRESHOLD = 0.8;
/** WARN when the amount is MORE than this many times the merchant's usual amount. */
export const AMOUNT_MULTIPLIER = 5;
/** Start of the reason for an unknown merchant (WARN). Other code uses it to tell this WARN apart. */
export const UNVERIFIED_MERCHANT_REASON = "Merchant not verified.";

const isValidInput = (input: GuardInput): boolean =>
  input.payeeName.trim() !== "" &&
  input.targetEmail.trim() !== "" &&
  Number.isFinite(input.transactionAmount) &&
  input.transactionAmount > 0;

/** A verified merchant (name and email domain match): ALLOW, or WARN if the amount is unusually high. */
function judgeVerified(input: GuardInput, merchant: Merchant): GuardResult {
  if (input.transactionAmount > merchant.typicalAmount * AMOUNT_MULTIPLIER) {
    return {
      verdict: "WARN",
      reason: `Amount is more than ${AMOUNT_MULTIPLIER}x the usual amount for ${merchant.name}.`,
    };
  }
  return { verdict: "ALLOW", reason: `Verified merchant: ${merchant.name}.` };
}

/**
 * Pure rule engine from claude.md. No database or network access.
 * @param verified a merchant already confirmed by name AND email domain, or null
 * @param allMerchants every verified merchant (to find the merchant by name and to spot look-alikes)
 */
export function decideVerdict(
  input: GuardInput,
  verified: Merchant | null,
  allMerchants: readonly Merchant[],
): GuardResult {
  if (!isValidInput(input)) {
    return { verdict: "BLOCK", reason: "Invalid payment details." };
  }

  const injected = hasInjectionMarker(input.payeeName) || hasInjectionMarker(input.targetEmail);

  // Same merchant by name (after cleaning): check the email domain, then the amount.
  const sameName =
    verified ?? allMerchants.find((m) => sameMerchantName(input.payeeName, m.name)) ?? null;
  if (sameName && !injected) {
    if (!matchesVerifiedMerchant(sameName, input.payeeName, input.targetEmail)) {
      return {
        verdict: "BLOCK",
        reason: `Email domain does not match the registered domain for ${sameName.name}.`,
      };
    }
    return judgeVerified(input, sameName);
  }

  // Not the same merchant, but a name that is too close to a verified one.
  const closest = findClosestMerchant(input.payeeName, allMerchants);
  if (
    closest &&
    closest.similarity > SIMILARITY_THRESHOLD &&
    !sameMerchantName(input.payeeName, closest.merchant.name)
  ) {
    return {
      verdict: "BLOCK",
      reason: `${UNVERIFIED_MERCHANT_REASON} Name closely resembles ${closest.merchant.name}.`,
      suggestion: `Did you mean ${closest.merchant.name}?`,
      similarity: closest.similarity,
    };
  }

  // A verified brand used inside a longer name ("Zuku Fiber Payments") with a domain that is not theirs.
  const impersonated = allMerchants.find(
    (m) =>
      containsMerchantName(input.payeeName, m.name) &&
      emailDomainOf(input.targetEmail) !== m.emailDomain.trim().toLowerCase(),
  );
  if (impersonated) {
    return {
      verdict: "BLOCK",
      reason: `Name contains ${impersonated.name} but the email domain is not theirs.`,
    };
  }

  // Instructions hidden in the payee name or email are never acceptable, even for an unknown merchant.
  if (injected) {
    return { verdict: "BLOCK", reason: "Payee name or email contains instructions and was blocked." };
  }

  // Unknown merchant with no look-alike name: the customer decides.
  return {
    verdict: "WARN",
    reason: `${UNVERIFIED_MERCHANT_REASON} The customer must choose Yes to continue or No to cancel.`,
    ...(closest ? { similarity: closest.similarity } : {}),
  };
}

/** Loads the registry, then applies decideVerdict. Used next to the LLM in the agent. */
export async function checkDeterministic(input: GuardInput): Promise<GuardResult> {
  return decideVerdict(input, null, await listVerifiedMerchants());
}
