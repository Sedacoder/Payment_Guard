"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
  type RowClassParams,
} from "ag-grid-community";

import { getBrowserSupabase } from "@/lib/supabase-browser";
import { normalizeAuditRow, type TelemetryRecord } from "@/lib/telemetry";
import type { Verdict } from "@/lib/types";

// AG Grid v33+ is modular. Register the community feature set once.
ModuleRegistry.registerModules([AllCommunityModule]);

type ConnectionStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED";
type VerdictFilter = "ALL" | Verdict;

const MAX_ROWS = 500;

const gridTheme = themeQuartz.withParams({
  backgroundColor: "#0b1220",
  foregroundColor: "#e2e8f0",
  chromeBackgroundColor: "#111c2e",
  borderColor: "#1e293b",
  accentColor: "#34d399",
  browserColorScheme: "dark",
  rowHoverColor: "#132033",
  oddRowBackgroundColor: "#0d1728",
  selectedRowBackgroundColor: "#16324a",
  headerFontWeight: 600,
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
});

const VERDICT_STYLES: Record<Verdict, string> = {
  ALLOW: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  WARN: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  BLOCK: "border-rose-400/30 bg-rose-400/10 text-rose-300",
};

const MONO_STYLE = { fontFamily: "var(--font-geist-mono), monospace", fontSize: "11px" };
const REASON_STYLE = { fontSize: "12px", color: "#cbd5e1" };
const SUGGESTION_STYLE = { fontSize: "12px", color: "#fbbf24" };
const MUTED_STYLE = { fontSize: "11px", color: "#94a3b8" };

function VerdictCell({ value }: ICellRendererParams<TelemetryRecord>) {
  const verdict = value as Verdict;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wide ${VERDICT_STYLES[verdict]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {verdict}
    </span>
  );
}

function RiskCell({ value }: ICellRendererParams<TelemetryRecord>) {
  const score = Number(value);
  const color = score >= 0.75 ? "text-rose-300" : score >= 0.35 ? "text-amber-300" : "text-emerald-300";
  return <span className={`font-mono text-xs font-semibold ${color}`}>{score.toFixed(3)}</span>;
}

function FlagsCell({ value }: ICellRendererParams<TelemetryRecord>) {
  const flags = (value as string[] | undefined) ?? [];
  if (flags.length === 0) return <span className="font-mono text-[11px] text-slate-500">none</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          className="rounded border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
        >
          {flag}
        </span>
      ))}
    </span>
  );
}

function LatencyCell({ value }: ICellRendererParams<TelemetryRecord>) {
  return <span className="font-mono text-[11px] text-slate-400">{Number(value)} ms</span>;
}

function PayeeCell({ value, data }: ICellRendererParams<TelemetryRecord>) {
  return (
    <span className="block min-w-0">
      <span className="block truncate text-xs font-semibold text-slate-200">{String(value)}</span>
      <span className="block truncate font-mono text-[10px] text-slate-500">{data?.target_email}</span>
    </span>
  );
}

function mergeRecords(current: TelemetryRecord[], incoming: TelemetryRecord[]): TelemetryRecord[] {
  const byId = new Map(current.map((record) => [record.id, record]));
  for (const record of incoming) byId.set(record.id, record);
  return Array.from(byId.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_ROWS);
}

function SummaryCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  tone: "slate" | "emerald" | "amber" | "rose";
  hint: string;
}) {
  const tones = {
    slate: "text-slate-200",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
  } as const;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

export default function SecurityDashboard() {
  const [records, setRecords] = useState<TelemetryRecord[]>([]);
  const [connection, setConnection] = useState<ConnectionStatus>("CONNECTING");
  const [filter, setFilter] = useState<VerdictFilter>("ALL");
  const [query, setQuery] = useState("");
  const [followLive, setFollowLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("—");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transport, setTransport] = useState<"supabase" | "sse">("sse");

  const gridApiRef = useRef<GridApi<TelemetryRecord> | null>(null);
  const followLiveRef = useRef(followLive);

  useEffect(() => {
    followLiveRef.current = followLive;
  }, [followLive]);

  const onGridReady = useCallback((event: GridReadyEvent<TelemetryRecord>) => {
    gridApiRef.current = event.api;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      try {
        const response = await fetch("/api/telemetry", { cache: "no-store" });
        if (!response.ok) throw new Error(`Telemetry request failed (${response.status})`);
        const data = (await response.json()) as { records: TelemetryRecord[] };
        if (cancelled) return;
        setRecords((current) => mergeRecords(current, data.records ?? []));
        setLastUpdated(new Date().toLocaleTimeString());
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Could not load telemetry.");
      }
    }

    void loadSnapshot();

    const source = new EventSource("/api/telemetry/stream");
    source.onopen = () => setConnection("CONNECTED");
    source.onerror = () => setConnection("DISCONNECTED");

    source.addEventListener("snapshot", (event) => {
      const data = JSON.parse((event as MessageEvent<string>).data) as {
        records: TelemetryRecord[];
      };
      setConnection("CONNECTED");
      setRecords((current) => mergeRecords(current, data.records ?? []));
      setLastUpdated(new Date().toLocaleTimeString());
    });

    source.addEventListener("telemetry", (event) => {
      const record = JSON.parse((event as MessageEvent<string>).data) as TelemetryRecord;
      setRecords((current) => mergeRecords(current, [record]));
      setLastUpdated(new Date().toLocaleTimeString());
      if (followLiveRef.current) {
        requestAnimationFrame(() => gridApiRef.current?.ensureIndexVisible(0, "top"));
      }
    });

    // Supabase Realtime is additive: SSE above keeps the demo alive when the
    // database is not configured. INSERT and UPDATE both matter because the
    // PayPal webhook flips a row to ALLOW on capture.
    const supabase = getBrowserSupabase();
    let channel: RealtimeChannel | null = null;

    if (supabase) {
      // The transport flips to "supabase" only once the channel subscribes;
      // until then SSE is the accurate label and the live feed keeps working.
      channel = supabase
        .channel("security_audits_live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "security_audits" },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            if (!row || Object.keys(row).length === 0) return;
            const record = normalizeAuditRow(row);
            setRecords((current) => mergeRecords(current, [record]));
            setLastUpdated(new Date().toLocaleTimeString());
            if (followLiveRef.current) {
              requestAnimationFrame(() => gridApiRef.current?.ensureIndexVisible(0, "top"));
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setTransport("supabase");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`[payment-guard] realtime channel ${status}; SSE remains active.`);
            setTransport("sse");
          }
        });
    }

    return () => {
      cancelled = true;
      source.close();
      if (channel) void supabase?.removeChannel(channel);
    };
  }, []);

  const metrics = useMemo(() => {
    const total = records.length;
    const allows = records.filter((record) => record.verdict === "ALLOW").length;
    const warns = records.filter((record) => record.verdict === "WARN").length;
    const blocks = records.filter((record) => record.verdict === "BLOCK").length;
    const avgLatency =
      total > 0
        ? (records.reduce((sum, record) => sum + record.execution_time_ms, 0) / total).toFixed(1)
        : "0.0";
    return { total, allows, warns, blocks, avgLatency };
  }, [records]);

  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      if (filter !== "ALL" && record.verdict !== filter) return false;
      if (!needle) return true;
      return (
        record.payee_name.toLowerCase().includes(needle) ||
        record.target_email.toLowerCase().includes(needle) ||
        record.reason.toLowerCase().includes(needle) ||
        record.rule_flags.some((flag) => flag.toLowerCase().includes(needle))
      );
    });
  }, [records, filter, query]);

  const columnDefs = useMemo<ColDef<TelemetryRecord>[]>(
    () => [
      {
        field: "created_at",
        headerName: "Time",
        width: 110,
        sort: "desc",
        valueFormatter: (params) =>
          params.value ? new Date(params.value as string).toLocaleTimeString() : "",
        cellStyle: MONO_STYLE,
      },
      {
        field: "id",
        headerName: "Txn ID",
        width: 145,
        cellStyle: MONO_STYLE,
      },
      {
        field: "payee_name",
        headerName: "Target payee",
        minWidth: 220,
        flex: 1,
        cellRenderer: PayeeCell,
      },
      {
        field: "transaction_amount",
        headerName: "Amount",
        width: 125,
        valueFormatter: (params) =>
          params.data
            ? `${params.data.currency} ${Number(params.value).toLocaleString()}`
            : "",
        cellStyle: MONO_STYLE,
      },
      { field: "risk_score", headerName: "Risk", width: 90, cellRenderer: RiskCell },
      { field: "verdict", headerName: "Verdict", width: 110, cellRenderer: VerdictCell },
      {
        field: "reason",
        headerName: "Reason",
        minWidth: 260,
        flex: 1.3,
        cellStyle: REASON_STYLE,
      },
      {
        field: "suggestion",
        headerName: "Suggestion",
        minWidth: 190,
        flex: 1,
        cellStyle: SUGGESTION_STYLE,
        valueFormatter: (params) => (params.value ? String(params.value) : "—"),
      },
      {
        field: "rule_flags",
        headerName: "Triggered rules",
        minWidth: 250,
        flex: 1.1,
        cellRenderer: FlagsCell,
        valueFormatter: (params) =>
          Array.isArray(params.value) ? params.value.join(", ") : "",
      },
      {
        field: "ip_address",
        headerName: "IP address",
        width: 125,
        cellStyle: MONO_STYLE,
      },
      {
        field: "domain_signature",
        headerName: "Domain",
        minWidth: 160,
        cellStyle: MONO_STYLE,
      },
      { field: "execution_time_ms", headerName: "Latency", width: 95, cellRenderer: LatencyCell },
      {
        field: "ai_used",
        headerName: "AI",
        width: 70,
        valueFormatter: (params) => (params.value ? "yes" : "—"),
        cellStyle: MUTED_STYLE,
      },
    ],
    [],
  );

  const getRowStyle = useCallback((params: RowClassParams<TelemetryRecord>) => {
    if (params.data?.verdict === "BLOCK") return { backgroundColor: "rgba(244, 63, 94, 0.08)" };
    if (params.data?.verdict === "WARN") return { backgroundColor: "rgba(245, 158, 11, 0.08)" };
    return undefined;
  }, []);

  const filterCounts = useMemo(
    () => ({
      ALL: records.length,
      ALLOW: metrics.allows,
      WARN: metrics.warns,
      BLOCK: metrics.blocks,
    }),
    [records.length, metrics.allows, metrics.warns, metrics.blocks],
  );

  return (
    <main className="min-h-screen bg-[#070d18] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/10 text-lg font-black text-emerald-300 ring-1 ring-emerald-400/30">
              PG
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Payment Guard Operational Telemetry
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Real-time threat evaluation &amp; payload analysis stream
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/terminal"
              className="rounded-full border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              ← Back to terminal
            </Link>
            <span className="text-[11px] font-medium text-slate-500">
              Updated {lastUpdated}
            </span>
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-wide ${
                connection === "CONNECTED"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                  : connection === "CONNECTING"
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                    : "border-rose-400/30 bg-rose-400/10 text-rose-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full bg-current ${connection === "CONNECTED" ? "animate-pulse" : ""}`}
              />
              {connection}
            </span>
          </div>
        </header>

        {loadError && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {loadError}
          </div>
        )}

        <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard label="Total analyzed" value={metrics.total} tone="slate" hint="Rolling window of 500 events" />
          <SummaryCard label="Passed" value={metrics.allows} tone="emerald" hint="ALLOW verdicts" />
          <SummaryCard label="Flagged" value={metrics.warns} tone="amber" hint="WARN verdicts" />
          <SummaryCard label="Blocked" value={metrics.blocks} tone="rose" hint="BLOCK verdicts" />
          <SummaryCard label="Avg guard latency" value={`${metrics.avgLatency} ms`} tone="slate" hint="Rules + optional AI" />
        </section>

        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {(["ALL", "ALLOW", "WARN", "BLOCK"] as const).map((option) => {
                const active = filter === option;
                const tone =
                  option === "BLOCK"
                    ? "border-rose-400/40 bg-rose-400/10 text-rose-300"
                    : option === "WARN"
                      ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                      : option === "ALLOW"
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                        : "border-slate-600 bg-slate-800 text-slate-200";
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFilter(option)}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold tracking-wide transition ${
                      active ? tone : "border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {option}
                    <span className="ml-1.5 font-mono opacity-70">{filterCounts[option]}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5">
                <span className="text-[11px] text-slate-500">Search</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="payee, email, rule…"
                  className="w-44 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
                />
              </label>
              <button
                type="button"
                onClick={() => setFollowLive((value) => !value)}
                className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                  followLive
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300"
                }`}
              >
                {followLive ? "● Follow live" : "○ Follow paused"}
              </button>
            </div>
          </div>

          <div className="mt-4 h-[560px] w-full overflow-hidden rounded-xl border border-slate-800">
            <AgGridReact<TelemetryRecord>
              theme={gridTheme}
              rowData={visibleRecords}
              columnDefs={columnDefs}
              defaultColDef={{ sortable: true, filter: true, resizable: true }}
              getRowId={(params) => params.data.id}
              getRowStyle={getRowStyle}
              onGridReady={onGridReady}
              animateRows
              rowHeight={48}
              headerHeight={38}
              suppressCellFocus
              overlayNoRowsTemplate='<span style="color:#64748b;font-size:12px">No telemetry matches this filter yet.</span>'
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
            <span>
              Showing {visibleRecords.length} of {records.length} events · transport:{" "}
              {transport === "supabase"
                ? "Supabase Realtime + SSE fallback"
                : "in-memory SSE (Supabase not configured)"}
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> ALLOW
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> WARN
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> BLOCK
              </span>
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
