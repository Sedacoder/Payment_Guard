import { getSupabaseAdminClient, isSupabaseConfigured } from "./dbConnection";
import { normalizeAuditRow, type TelemetryRecord } from "./telemetry";

/**
 * Server-only persistence for `security_audits`.
 *
 * The table is the live copy; the in-memory sink remains the demo fallback.
 * Every function here is best-effort and logs instead of throwing, so a
 * database problem can never block a verdict or an order.
 */

function toPayload(record: TelemetryRecord): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: record.id,
    created_at: record.created_at,
    // Satisfies the legacy NOT NULL/unique column; `linkAuditToOrder` replaces
    // it with the real order id once the rail creates one.
    transaction_id: record.id,
    merchant_id: record.merchant_id,
    payee_name: record.payee_name,
    target_email: record.target_email,
    transaction_amount: record.transaction_amount,
    // Legacy mirror for tables created by the first revision.
    amount: record.transaction_amount,
    currency: record.currency,
    ip_address: record.ip_address,
    domain_signature: record.domain_signature,
    risk_score: record.risk_score,
    verdict: record.verdict,
    rule_flags: record.rule_flags,
    execution_time_ms: record.execution_time_ms,
    reason: record.reason,
    ai_used: record.ai_used,
  };

  if (record.suggestion) payload.suggestion = record.suggestion;
  if (typeof record.similarity === "number") payload.similarity = record.similarity;
  return payload;
}

/** Columns that existed before the dashboard contract was finalised. */
function toLegacyPayload(record: TelemetryRecord): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: record.id,
    transaction_id: record.id,
    payee_name: record.payee_name,
    verdict: record.verdict,
    reason: record.reason,
    amount: record.transaction_amount,
  };
  if (record.suggestion) payload.suggestion = record.suggestion;
  return payload;
}

/** A missing column/schema-cache error means an older table revision. */
const MISSING_COLUMN_PATTERN =
  /column .* does not exist|could not find the '.*' column|schema cache/i;

export async function insertAuditRecord(record: TelemetryRecord): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseAdminClient();

  const first = await supabase.from("security_audits").insert([toPayload(record)]);
  if (!first.error) return;

  // Only an older table revision justifies dropping to the legacy columns.
  // Any other failure (duplicate key, RLS, network) would fail the same way,
  // so report it once instead of retrying.
  if (!MISSING_COLUMN_PATTERN.test(first.error.message)) {
    console.error("[payment-guard] audit insert failed:", first.error.message);
    return;
  }

  console.warn(
    "[payment-guard] full audit insert failed, retrying with legacy columns:",
    first.error.message,
  );
  const retry = await supabase.from("security_audits").insert([toLegacyPayload(record)]);
  if (retry.error) {
    console.error("[payment-guard] audit insert failed:", retry.error.message);
  }
}

export async function listAuditRecords(limit = 500): Promise<TelemetryRecord[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("security_audits")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[payment-guard] audit read failed:", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeAuditRow);
}

/** Links a guard decision to the payment order id the webhook will send. */
export async function linkAuditToOrder(
  telemetryId: string,
  orderId: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("security_audits")
    .update({ transaction_id: orderId })
    .eq("id", telemetryId);

  if (error) {
    console.warn(
      "[payment-guard] could not link audit to order (add the transaction_id column):",
      error.message,
    );
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marks the audit row as captured. Tries `transaction_id` first because that
 * is what the webhook and order creation link, then falls back to the row id.
 */
export async function markAuditCaptured(orderId: string, reason: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabaseAdminClient();
  const update = { verdict: "ALLOW", reason };

  const linked = await supabase
    .from("security_audits")
    .update(update)
    .eq("transaction_id", orderId)
    .select("id");

  if (!linked.error && (linked.data?.length ?? 0) > 0) return true;

  if (linked.error) {
    console.warn(
      "[payment-guard] transaction_id update failed, trying id:",
      linked.error.message,
    );
  }

  // The row id is a uuid; a rail order id is not. Only try this when the value
  // can actually be an id, otherwise Postgres rejects the comparison.
  if (!UUID_PATTERN.test(orderId)) return false;

  const byId = await supabase
    .from("security_audits")
    .update(update)
    .eq("id", orderId)
    .select("id");

  if (byId.error) {
    console.error("[payment-guard] audit capture update failed:", byId.error.message);
    return false;
  }
  return (byId.data?.length ?? 0) > 0;
}
