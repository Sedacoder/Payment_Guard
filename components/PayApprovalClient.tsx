"use client";

import Link from "next/link";
import { useState } from "react";

interface CapturedOrder {
  id: string;
  status: string;
  amount: number;
  currency: string;
  payeeName: string;
  captureId?: string;
  rail: string;
}

type State = "idle" | "capturing" | "done" | "error";

export default function PayApprovalClient({ orderId }: { orderId: string }) {
  const [state, setState] = useState<State>("idle");
  const [order, setOrder] = useState<CapturedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setState("capturing");
    setError(null);
    try {
      const response = await fetch("/api/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = (await response.json().catch(() => null)) as
        | { success: boolean; order?: CapturedOrder; error?: string }
        | null;
      if (!response.ok || !data?.success || !data.order) {
        throw new Error(data?.error ?? "Capture failed.");
      }
      setOrder(data.order);
      setState("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Capture failed.");
      setState("error");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600">
          Payment Guard
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Approve this payment</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          This order was cleared by the guard. Approving it releases the payment on the
          selected rail.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-600">
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">order</span>
            <span className="truncate">{orderId || "missing"}</span>
          </div>
        </div>

        {state === "done" && order && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Payment captured</p>
            <p className="mt-1 font-mono text-xs">
              {order.currency} {order.amount.toLocaleString()} · {order.status}
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-emerald-700">
              capture: {order.captureId ?? "—"}
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-2">
          {state !== "done" && (
            <button
              type="button"
              onClick={() => void approve()}
              disabled={!orderId || state === "capturing"}
              className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state === "capturing" ? "Capturing…" : "Approve & capture"}
            </button>
          )}
          <Link
            href="/terminal"
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          >
            Back to terminal
          </Link>
        </div>
      </div>
    </main>
  );
}
