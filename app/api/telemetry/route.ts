import { connection } from "next/server";

import { listTelemetry } from "@/lib/telemetry";
import { seedTelemetry } from "@/lib/telemetry-seed";

export async function GET() {
  // Cache Components would otherwise be free to prerender this snapshot.
  await connection();
  await seedTelemetry();

  return Response.json({
    records: listTelemetry(500),
    serverTime: new Date().toISOString(),
  });
}
