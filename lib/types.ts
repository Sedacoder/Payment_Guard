/** The only three answers the Guard Agent may give. */
export type Verdict = "ALLOW" | "WARN" | "BLOCK";

/** What the Guard Agent receives about a payment that is about to happen. */
export interface GuardInput {
  payeeName: string;
  targetEmail: string;
  transactionAmount: number;
}

/** What the Guard Agent returns. Strict JSON, nothing else. */
export interface GuardResult {
  verdict: Verdict;
  reason: string;
  /** Optional hint for the UI, e.g. "Did you mean Naivas Supermarket?" */
  suggestion?: string;
  /** Optional name similarity to the closest verified merchant, from 0 to 1. */
  similarity?: number;
}

/** One verified merchant in the registry (later: one row in Supabase). */
export interface Merchant {
  id: string;
  name: string;
  email: string;
  /** The only email domain this merchant is allowed to use, e.g. "naivas.co.ke". */
  emailDomain: string;
  /** The amount this merchant normally receives. Used for the 5x WARN rule. */
  typicalAmount: number;
}
