import { getSupabaseAdminClient, isSupabaseConfigured } from "./dbConnection";
import { normalizeAuditRow, type TelemetryRecord } from "./telemetry";

/**
 * Server-only persistence for `security_audits`.
 *
 * The table is the live copy; the in-memory sink remains the demo fallback.
 * Every function here is best-effort and logs instead of throwing, so a
 * database problem can never block a verdict or an order.
 */

const CORE_COLUMNS = new Set([
  "id",
  "created_at",
  "payee_name",
  "target_email",
  "transaction_amount",
  "currency",
  "verdict",
  "reason",
  "suggestion",
  "risk_score",
  "execution_time_ms",
  "ai_used",
  "rule_flags",
]);

function toPayload(record: TelemetryRecord, full: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: record.id,
    created_at: record.created_at,
    merchant_id: record.merchant_id,
    payee_name: record.payee_name,
    target_email: record.target_email,
    transaction_amount: record.transaction_amount,
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

  if (full) return payload;
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => CORE_COLUMNS.has(key)),
  );
}

export async function insertAuditRecord(record: TelemetryRecord): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseAdminClient();

  const first = await supabase.from("security_audits").insert([toPayload(record, true)]);
  if (!first.error) return;

  // Older deployments may not have the extended columns yet. Keep the row
  // rather than losing the event, and surface the schema drift in the logs.
  console.warn(
    "[payment-guard] full audit insert failed, retrying with core columns:",
    first.error.message,
  );
  const retry = await supabase.from("security_audits").insert([toPayload(record, false)]);
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
