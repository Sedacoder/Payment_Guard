"use client";

import dynamic from "next/dynamic";

const SecurityDashboard = dynamic(() => import("@/components/SecurityDashboard"), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-screen items-center justify-center bg-[#070d18]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-800 border-t-emerald-400" />
        <p className="text-xs font-semibold tracking-wide text-slate-500">
          Initializing telemetry console…
        </p>
      </div>
    </main>
  ),
});

export default function MerchantDashboardPage() {
  return <SecurityDashboard />;
}
