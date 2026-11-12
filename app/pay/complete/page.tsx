"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

interface CapturedOrder {
  id: string;
  status: string;
  amount: number;
  currency: string;
  payeeName: string;
  captureId?: string;
  rail: string;
}

type State = "capturing" | "done" | "error";

function CaptureOnReturn() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const started = useRef(false);
  const [state, setState] = useState<State>("capturing");
  const [order, setOrder] = useState<CapturedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    async function capture(orderId: string) {
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

    void capture(token);
  }, [token]);

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600">
        Payment Guard
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">
        {state === "done" ? "Payment complete" : state === "error" ? "Capture failed" : "Finishing payment"}
      </h1>

      {!token && (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No PayPal order token was returned. Open the terminal and start a new payment.
        </p>
      )}

      {state === "capturing" && token && (
        <div className="mt-6 flex items-center gap-3 text-sm text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500" />
          Capturing order {token}…
        </div>
      )}

      {state === "done" && order && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">
            {order.currency} {order.amount.toLocaleString()} to {order.payeeName}
          </p>
          <p className="mt-1 font-mono text-xs">{order.status}</p>
          <p className="mt-1 break-all font-mono text-[11px] text-emerald-700">
            capture: {order.captureId ?? "—"}
          </p>
        </div>
      )}

      {state === "error" && (
        <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-2">
        <Link
          href="/dashboard"
          className="rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          View live telemetry →
        </Link>
        <Link
          href="/terminal"
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400"
        >
          New payment
        </Link>
      </div>
    </div>
  );
}

export default function PayCompletePage() {
  return (
    <main className="theme-light-interface flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
      <Suspense
        fallback={
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500" />
            Loading…
          </div>
        }
      >
        <CaptureOnReturn />
      </Suspense>
    </main>
  );
}
