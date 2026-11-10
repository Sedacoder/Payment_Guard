import type { PaymentOrder, PaymentRail } from "./payment-rail";
import type { GuardInput } from "./types";

export const PAYPAL_API_BASE =
  process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
const API_BASE = PAYPAL_API_BASE;

interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

interface PayPalOrderResponse {
  id: string;
  status: string;
  links?: PayPalLink[];
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id: string; status: string }>;
    };
  }>;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

const globalState = globalThis as typeof globalThis & {
  __paymentGuardPayPalToken?: TokenCache;
  __paymentGuardPayPalOrders?: Map<string, PaymentOrder>;
};
const createdOrders = globalState.__paymentGuardPayPalOrders ?? new Map<string, PaymentOrder>();
globalState.__paymentGuardPayPalOrders = createdOrders;

export async function getPayPalAccessToken(): Promise<string> {
  return getAccessToken();
}

async function getAccessToken(): Promise<string> {
  const cached = globalState.__paymentGuardPayPalToken;
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required for the PayPal rail.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`PayPal token request failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  globalState.__paymentGuardPayPalToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

/**
 * Real PayPal Sandbox adapter. Enabled with PAYMENT_RAIL=paypal.
 *
 * Note: PayPal does not settle KES. When this rail is active, set
 * PAYPAL_CURRENCY to a supported currency (USD by default).
 */
export class PayPalSandboxRail implements PaymentRail {
  readonly name = "paypal-sandbox";

  async createOrder(input: GuardInput, currency: string): Promise<PaymentOrder> {
    const token = await getAccessToken();
    const response = await fetch(`${API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `pg-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            description: `Payment Guard transfer to ${input.payeeName}`,
            amount: {
              currency_code: currency,
              value: input.transactionAmount.toFixed(2),
            },
          },
        ],
        application_context: {
          brand_name: "Payment Guard",
          user_action: "PAY_NOW",
          // PayPal appends ?token=<orderId>&PayerID=... to the return URL.
          return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/pay/complete`,
          cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/terminal?cancelled=1`,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`PayPal create order failed (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as PayPalOrderResponse;
    const approvalUrl =
      data.links?.find((link) => link.rel === "approve" || link.rel === "payer-action")?.href ??
      `/pay/${data.id}`;

    const order: PaymentOrder = {
      id: data.id,
      status: "CREATED",
      amount: input.transactionAmount,
      currency,
      payeeName: input.payeeName,
      targetEmail: input.targetEmail,
      createdAt: new Date().toISOString(),
      approvalUrl,
      rail: "paypal-sandbox",
    };
    createdOrders.set(order.id, order);
    return order;
  }

  async captureOrder(orderId: string): Promise<PaymentOrder> {
    const existing = createdOrders.get(orderId);
    if (!existing) {
      throw new Error(`Order ${orderId} is not known to this server instance.`);
    }

    const token = await getAccessToken();
    const response = await fetch(
      `${API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );

    if (!response.ok) {
      throw new Error(`PayPal capture failed (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as PayPalOrderResponse;
    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    const captured: PaymentOrder = {
      ...existing,
      status: data.status === "COMPLETED" ? "COMPLETED" : "FAILED",
      captureId: capture?.id,
    };
    createdOrders.set(orderId, captured);
    return captured;
  }
}

export const paypalSandboxRail = new PayPalSandboxRail();
