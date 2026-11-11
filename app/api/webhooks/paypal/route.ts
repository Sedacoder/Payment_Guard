import { connection } from "next/server";

import { markAuditCaptured } from "@/lib/audit-store";
import { isSupabaseConfigured } from "@/lib/dbConnection";
import { getPayPalAccessToken, PAYPAL_API_BASE } from "@/lib/paypal-rail";

interface PayPalWebhookEvent {
  event_type?: string;
  resource?: {
    id?: string;
    supplementary_data?: {
      related_ids?: { order_id?: string };
    };
    purchase_units?: Array<{
      payments?: { captures?: Array<{ id?: string }> };
    }>;
  };
}

/**
 * Verifies the PayPal transmission signature when PAYPAL_WEBHOOK_ID is set.
 * Without a webhook id the route still works for local demos, but logs that
 * it is unverified. This must never be left unset in production.
 */
async function verifyWebhookSignature(request: Request, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn(
      "[payment-guard] PAYPAL_WEBHOOK_ID is not set; accepting an unverified webhook (demo mode).",
    );
    return true;
  }

  const authAlgo = request.headers.get("paypal-auth-algo");
  const certUrl = request.headers.get("paypal-cert-url");
  const transmissionId = request.headers.get("paypal-transmission-id");
  const transmissionSig = request.headers.get("paypal-transmission-sig");
  const transmissionTime = request.headers.get("paypal-transmission-time");

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    console.error("[payment-guard] webhook is missing PayPal signature headers.");
    return false;
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }

  try {
    const token = await getPayPalAccessToken();
    const response = await fetch(
      `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: event,
        }),
      },
    );

    if (!response.ok) {
      console.error(
        "[payment-guard] webhook verification request failed:",
        response.status,
        await response.text(),
      );
      return false;
    }

    const data = (await response.json()) as { verification_status?: string };
    return data.verification_status === "SUCCESS";
  } catch (error) {
    console.error("[payment-guard] webhook verification failed:", error);
    return false;
  }
}

export async function POST(request: Request) {
  await connection();

  const rawBody = await request.text();

  if (!(await verifyWebhookSignature(request, rawBody))) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const eventType = event.event_type ?? "UNKNOWN";
  const resource = event.resource ?? {};
  const orderId =
    resource.supplementary_data?.related_ids?.order_id ??
    resource.id ??
    resource.purchase_units?.[0]?.payments?.captures?.[0]?.id;

  console.log(`[payment-guard] PayPal webhook: ${eventType} (order ${orderId ?? "unknown"})`);

  if (!orderId) {
    return Response.json({ error: "Missing order id in webhook payload." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    console.warn("[payment-guard] webhook received but Supabase is not configured; acking.");
    return Response.json({ received: true, persisted: false }, { status: 200 });
  }

  if (eventType === "PAYMENT.CAPTURE.COMPLETED" || eventType === "CHECKOUT.ORDER.APPROVED") {
    const updated = await markAuditCaptured(
      orderId,
      "PayPal webhook: capture completed and verified by the payment rail.",
    );
    return Response.json({ received: true, persisted: updated }, { status: 200 });
  }

  return Response.json({ received: true, ignored: true }, { status: 200 });
}
