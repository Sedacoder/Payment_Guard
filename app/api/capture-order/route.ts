import { connection } from "next/server";

import { getPaymentRail } from "@/lib/payment-rail";

export async function POST(request: Request) {
  await connection();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const orderId =
    typeof body === "object" && body !== null && typeof (body as { orderId?: unknown }).orderId === "string"
      ? (body as { orderId: string }).orderId.trim()
      : "";

  if (!orderId) {
    return Response.json({ success: false, error: "orderId is required." }, { status: 400 });
  }

  try {
    const rail = await getPaymentRail();
    const order = await rail.captureOrder(orderId);
    return Response.json({ success: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not capture payment order.";
    console.error("[payment-guard] capture failed:", error);
    return Response.json({ success: false, error: message }, { status: 400 });
  }
}
