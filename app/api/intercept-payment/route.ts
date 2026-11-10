import { connection } from "next/server";

import { interceptPayment } from "@/lib/intercept";
import { getClientIp } from "@/lib/request-meta";
import { parseGuardInput } from "@/lib/validation";

export async function POST(request: Request) {
  await connection();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseGuardInput(body);
  if (!parsed.ok) {
    return Response.json({ success: false, error: parsed.error }, { status: 400 });
  }

  try {
    const { result, telemetry } = await interceptPayment(parsed.input, {
      ipAddress: getClientIp(request),
    });

    const payload = {
      success: result.verdict !== "BLOCK",
      action: result.verdict,
      verdict: result.verdict,
      message:
        result.verdict === "BLOCK"
          ? `Security Intercept: ${result.reason}`
          : result.reason,
      reason: result.reason,
      suggestion: result.suggestion ?? null,
      similarity: result.similarity ?? null,
      riskScore: telemetry.risk_score,
      flags: result.flags,
      aiUsed: result.aiUsed,
      latencyMs: result.latencyMs,
      telemetryId: telemetry.id,
    };

    return Response.json(payload, { status: result.verdict === "BLOCK" ? 403 : 200 });
  } catch (error) {
    console.error("[payment-guard] intercept failed:", error);
    return Response.json({ success: false, error: "Internal Firewall Fault" }, { status: 500 });
  }
}
