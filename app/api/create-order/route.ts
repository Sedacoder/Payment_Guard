import { connection } from "next/server";
import QRCode from "qrcode";

import { linkAuditToOrder } from "@/lib/audit-store";
import { interceptPayment } from "@/lib/intercept";
import { getPaymentRail } from "@/lib/payment-rail";
import { getClientIp } from "@/lib/request-meta";
import { parseGuardInput } from "@/lib/validation";

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

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

  const raw = body as Record<string, unknown>;
  const confirmed = raw.confirmed === true;
  const requestedCurrency =
    typeof raw.currency === "string" ? raw.currency.toUpperCase() : undefined;
  if (requestedCurrency && !CURRENCY_PATTERN.test(requestedCurrency)) {
    return Response.json(
      { success: false, error: "currency must be a three-letter ISO code." },
      { status: 400 },
    );
  }

  const currency =
    requestedCurrency ??
    (process.env.PAYMENT_RAIL === "paypal"
      ? (process.env.PAYPAL_CURRENCY ?? "USD")
      : "KES");

  try {
    const { result, telemetry } = await interceptPayment(parsed.input, {
      ipAddress: getClientIp(request),
      currency,
    });

    const assessment = {
      verdict: result.verdict,
      reason: result.reason,
      suggestion: result.suggestion ?? null,
      similarity: result.similarity ?? null,
      riskScore: telemetry.risk_score,
      flags: result.flags,
      aiUsed: result.aiUsed,
      latencyMs: result.latencyMs,
      telemetryId: telemetry.id,
    };

    if (result.verdict === "BLOCK") {
      return Response.json(
        {
          success: false,
          action: "BLOCK",
          message: `Security Intercept: ${result.reason}`,
          reason: result.reason,
          assessment,
        },
        { status: 403 },
      );
    }

    if (result.verdict === "WARN" && !confirmed) {
      return Response.json({
        success: true,
        action: "WARN",
        requiresConfirmation: true,
        message: result.reason,
        reason: result.reason,
        assessment,
      });
    }

    const rail = await getPaymentRail();
    const order = await rail.createOrder(parsed.input, currency);

    // The PayPal webhook and the mock capture path update the audit row by
    // order id, so link the decision to the order as soon as it exists.
    await linkAuditToOrder(telemetry.id, order.id);

    const approvalUrl = order.approvalUrl.startsWith("http")
      ? order.approvalUrl
      : `${new URL(request.url).origin}${order.approvalUrl}`;
    const qrDataUrl = await QRCode.toDataURL(approvalUrl, {
      width: 320,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    });

    return Response.json({
      success: true,
      action: result.verdict,
      confirmed: result.verdict === "WARN" ? confirmed : undefined,
      message: result.reason,
      reason: result.reason,
      assessment,
      order,
      approvalUrl,
      qrDataUrl,
    });
  } catch (error) {
    console.error("[payment-guard] create order failed:", error);
    return Response.json({ success: false, error: "Could not create payment order." }, { status: 500 });
  }
}
