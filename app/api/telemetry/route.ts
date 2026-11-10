import { connection } from "next/server";

import { listAuditRecords } from "@/lib/audit-store";
import { listTelemetry, type TelemetryRecord } from "@/lib/telemetry";
import { seedTelemetry } from "@/lib/telemetry-seed";

function mergeRecords(local: TelemetryRecord[], remote: TelemetryRecord[]): TelemetryRecord[] {
  const byId = new Map<string, TelemetryRecord>();
  for (const record of local) byId.set(record.id, record);
  for (const record of remote) byId.set(record.id, record);
  return Array.from(byId.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 500);
}

export async function GET() {
  // Cache Components would otherwise be free to prerender this snapshot.
  await connection();
  await seedTelemetry();

  const local = listTelemetry(500);
  const remote = await listAuditRecords(500);

  return Response.json({
    records: mergeRecords(local, remote),
    source: remote.length > 0 ? "supabase+memory" : "memory",
    serverTime: new Date().toISOString(),
  });
}
