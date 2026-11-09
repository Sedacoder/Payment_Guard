import type { AgentResult } from "./agent";
import type { GuardInput, Verdict } from "./types";

/**
 * One evaluated payment, shaped for the admin telemetry grid.
 * Snake_case fields match the planned Supabase `payment_telemetry` table so
 * the realtime adapter can swap in later without changing the UI.
 */
export interface TelemetryRecord {
  id: string;
  created_at: string;
  merchant_id: string;
  payee_name: string;
  target_email: string;
  transaction_amount: number;
  currency: string;
  ip_address: string;
  domain_signature: string;
  risk_score: number;
  verdict: Verdict;
  rule_flags: string[];
  execution_time_ms: number;
  reason: string;
  suggestion?: string;
  similarity?: number;
  ai_used: boolean;
}

export type TelemetryListener = (record: TelemetryRecord) => void;

export interface TelemetrySink {
  record(record: TelemetryRecord): void;
  list(limit?: number): TelemetryRecord[];
  subscribe(listener: TelemetryListener): () => void;
}

const MAX_RECORDS = 500;

class InMemoryTelemetryStore implements TelemetrySink {
  private records: TelemetryRecord[] = [];
  private listeners = new Set<TelemetryListener>();

  record(record: TelemetryRecord): void {
    this.records = [record, ...this.records].slice(0, MAX_RECORDS);
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch (error) {
        console.error("[payment-guard] telemetry listener failed:", error);
      }
    }
  }

  list(limit = MAX_RECORDS): TelemetryRecord[] {
    return this.records.slice(0, limit);
  }

  subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

// Keep one store across dev hot reloads and across route-handler modules.
const globalStore = globalThis as typeof globalThis & {
  __paymentGuardTelemetry?: InMemoryTelemetryStore;
};
export const telemetryStore: TelemetrySink =
  globalStore.__paymentGuardTelemetry ?? new InMemoryTelemetryStore();
globalStore.__paymentGuardTelemetry = telemetryStore as InMemoryTelemetryStore;

export interface TelemetryContext {
  merchantId?: string;
  currency?: string;
  ipAddress?: string;
  domainSignature?: string;
  createdAt?: Date;
}

export interface CreateTelemetryArgs {
  input: GuardInput;
  result: AgentResult;
  context?: TelemetryContext;
}

/** Display-only score. The verdict, not this number, is authoritative. */
export function riskScoreFor(verdict: Verdict, similarity?: number): number {
  if (verdict === "BLOCK") {
    return Number(Math.min(0.99, Math.max(0.75, similarity ?? 0.9)).toFixed(3));
  }
  if (verdict === "WARN") return 0.55;
  return 0.1;
}

export function createTelemetryRecord({
  input,
  result,
  context = {},
}: CreateTelemetryArgs): TelemetryRecord {
  const domain = context.domainSignature ?? input.targetEmail.split("@")[1] ?? "unknown";
  const record: TelemetryRecord = {
    id: `txn_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    created_at: (context.createdAt ?? new Date()).toISOString(),
    merchant_id: context.merchantId ?? "unverified",
    payee_name: input.payeeName,
    target_email: input.targetEmail,
    transaction_amount: input.transactionAmount,
    currency: context.currency ?? "KES",
    ip_address: context.ipAddress ?? "127.0.0.1",
    domain_signature: domain,
    risk_score: riskScoreFor(result.verdict, result.similarity),
    verdict: result.verdict,
    rule_flags: result.flags,
    execution_time_ms: result.latencyMs,
    reason: result.reason,
    ai_used: result.aiUsed,
  };

  if (result.suggestion) record.suggestion = result.suggestion;
  if (typeof result.similarity === "number") record.similarity = result.similarity;

  return record;
}

export function recordTelemetry(record: TelemetryRecord): void {
  telemetryStore.record(record);
}

export function listTelemetry(limit?: number): TelemetryRecord[] {
  return telemetryStore.list(limit);
}

export function subscribeTelemetry(listener: TelemetryListener): () => void {
  return telemetryStore.subscribe(listener);
}
