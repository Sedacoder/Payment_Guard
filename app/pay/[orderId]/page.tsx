import { Suspense } from "react";

import PayApprovalClient from "@/components/PayApprovalClient";

/**
 * QR destination for the mock rail.
 *
 * `params` is a runtime API, so it must be read inside a `<Suspense>` boundary
 * under Cache Components. The static shell renders the fallback; the real order
 * id streams in at request time.
 */
async function ApprovalShell({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <PayApprovalClient orderId={orderId} />;
}

function ApprovalFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600">
          Payment Guard
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Loading order…</h1>
        <div className="mt-6 h-16 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </main>
  );
}

export default function PayApprovalPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  return (
    <Suspense fallback={<ApprovalFallback />}>
      <ApprovalShell params={params} />
    </Suspense>
  );
}
