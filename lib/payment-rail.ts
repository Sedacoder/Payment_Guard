import type { GuardInput } from "./types";

export type OrderStatus = "CREATED" | "APPROVED" | "COMPLETED" | "FAILED";

export interface PaymentOrder {
  id: string;
  status: OrderStatus;
  amount: number;
  currency: string;
  payeeName: string;
  targetEmail: string;
  createdAt: string;
  /** Relative URL the customer would open after scanning the QR code. */
  approvalUrl: string;
  captureId?: string;
  rail: "mock" | "paypal-sandbox";
}

export interface PaymentRail {
  readonly name: string;
  createOrder(input: GuardInput, currency: string): Promise<PaymentOrder>;
  captureOrder(orderId: string): Promise<PaymentOrder>;
}

const globalOrders = globalThis as typeof globalThis & {
  __paymentGuardOrders?: Map<string, PaymentOrder>;
};
const orders = globalOrders.__paymentGuardOrders ?? new Map<string, PaymentOrder>();
globalOrders.__paymentGuardOrders = orders;

/**
 * In-memory stand-in for PayPal's Orders API. It keeps the demo runnable with
 * zero credentials; the real adapter below is selected with PAYMENT_RAIL=paypal.
 */
export class MockPaymentRail implements PaymentRail {
  readonly name = "mock";

  async createOrder(input: GuardInput, currency: string): Promise<PaymentOrder> {
    const id = `ord_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const order: PaymentOrder = {
      id,
      status: "CREATED",
      amount: input.transactionAmount,
      currency,
      payeeName: input.payeeName,
      targetEmail: input.targetEmail,
      createdAt: new Date().toISOString(),
      approvalUrl: `/pay/${id}`,
      rail: "mock",
    };
    orders.set(id, order);
    return order;
  }

  async captureOrder(orderId: string): Promise<PaymentOrder> {
    const existing = orders.get(orderId);
    if (!existing) throw new Error(`Order ${orderId} was not found.`);
    if (existing.status === "COMPLETED") return existing;

    const captured: PaymentOrder = {
      ...existing,
      status: "COMPLETED",
      captureId: `cap_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    };
    orders.set(orderId, captured);
    return captured;
  }
}

export const mockPaymentRail = new MockPaymentRail();

/**
 * Defaults to the mock rail. Set PAYMENT_RAIL=paypal (plus sandbox
 * credentials) to route the same calls through PayPal's Orders API.
 */
export async function getPaymentRail(): Promise<PaymentRail> {
  if (process.env.PAYMENT_RAIL === "paypal") {
    const { paypalSandboxRail } = await import("./paypal-rail");
    return paypalSandboxRail;
  }
  return mockPaymentRail;
}
