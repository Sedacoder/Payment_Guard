"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { useTheme } from "@/components/ThemeProvider";
import { normalizeAuditRow, type TelemetryRecord } from "@/lib/telemetry";
import type { Verdict } from "@/lib/types";

// AG Grid v33+ is modular. Register the community feature set once.
ModuleRegistry.registerModules([AllCommunityModule]);

type ConnectionStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED";
type VerdictFilter = "ALL" | Verdict;

const MAX_ROWS = 500;

const VERDICT_STYLES: Record<Verdict, string> = {
  ALLOW: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  WARN: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  BLOCK: "border-rose-400/30 bg-rose-400/10 text-rose-300",
};

const MONO_STYLE = { fontFamily: "var(--font-geist-mono), monospace", fontSize: "11px" };
const REASON_STYLE = { fontSize: "12px", color: "var(--grid-reason-color)" };
const SUGGESTION_STYLE = { fontSize: "12px", color: "var(--grid-suggestion-color)" };
const MUTED_STYLE = { fontSize: "11px", color: "var(--grid-muted-color)" };

/* -------------------------------------------------------------------------- */
/* Icons                                                                      */
/* -------------------------------------------------------------------------- */

type IconProps = { className?: string };

function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
      <path d="M12 3l7 3v5.2c0 4.4-2.9 8.3-7 9.5-4.1-1.2-7-5.1-7-9.5V6l7-3z" />
      <path d="M9.3 12.1l1.9 1.9 3.6-3.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M5 12.5l4.2 4.2L19 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path d="M12 4.5l8.2 14.2H3.8L12 4.5z" strokeLinejoin="round" />
      <path d="M12 9.5v4" strokeLinecap="round" />
      <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BlockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M7.2 7.2l9.6 9.6" strokeLinecap="round" />
    </svg>
  );
}

function GaugeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path d="M4.5 15.5a8 8 0 1115 0" strokeLinecap="round" />
      <path d="M12 12.5l3.6-3.6" strokeLinecap="round" />
      <circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className={className}>
      <circle cx="11" cy="11" r="6.2" />
      <path d="M15.7 15.7L20 20" strokeLinecap="round" />
    </svg>
  );
}

function PauseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" />
    </svg>
  );
}

function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5.5v13l10-6.5-10-6.5z" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className={className}>
      <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Cells                                                                      */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function mergeRecords(current: TelemetryRecord[], incoming: TelemetryRecord[]): TelemetryRecord[] {
  const byId = new Map(current.map((record) => [record.id, record]));
  for (const record of incoming) byId.set(record.id, record);
  return Array.from(byId.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_ROWS);
}

function newestOf(records: TelemetryRecord[]): TelemetryRecord | undefined {
  return records.reduce<TelemetryRecord | undefined>(
    (newest, record) => (!newest || record.created_at > newest.created_at ? record : newest),
    undefined,
  );
}

const TONES = {
  slate: {
    text: "text-slate-100",
    chip: "bg-slate-400/10 text-slate-300 ring-slate-400/20",
    line: "from-slate-400/60 via-slate-400/10 to-transparent",
  },
  emerald: {
    text: "text-emerald-300",
    chip: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    line: "from-emerald-400/70 via-emerald-400/10 to-transparent",
  },
  amber: {
    text: "text-amber-300",
    chip: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
    line: "from-amber-400/70 via-amber-400/10 to-transparent",
  },
  rose: {
    text: "text-rose-300",
    chip: "bg-rose-400/10 text-rose-300 ring-rose-400/20",
    line: "from-rose-400/70 via-rose-400/10 to-transparent",
  },
  sky: {
    text: "text-sky-300",
    chip: "bg-sky-400/10 text-sky-300 ring-sky-400/20",
    line: "from-sky-400/70 via-sky-400/10 to-transparent",
  },
} as const;

type Tone = keyof typeof TONES;

function SummaryCard({
  label,
  value,
  tone,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  tone: Tone;
  hint: string;
  icon: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 ring-1 ring-inset ring-white/[0.04]">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${t.line}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${t.chip}`}>
          {icon}
        </span>
      </div>
      <p className={`mt-3 text-[26px] font-bold leading-none tabular-nums ${t.text}`}>{value}</p>
      <p className="mt-2 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export default function SecurityDashboard() {
  const { theme } = useTheme();
  const [records, setRecords] = useState<TelemetryRecord[]>([]);
  const [connection, setConnection] = useState<ConnectionStatus>("CONNECTING");
  const [filter, setFilter] = useState<VerdictFilter>("ALL");
  const [query, setQuery] = useState("");
  const [followLive, setFollowLive] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string>("—");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transport, setTransport] = useState<"supabase" | "sse">("sse");

  const gridApiRef = useRef<GridApi<TelemetryRecord> | null>(null);
  const followLiveRef = useRef(followLive);
  const pendingRef = useRef<TelemetryRecord[]>([]);
  const gridTheme = useMemo(
    () =>
      themeQuartz.withParams({
        backgroundColor: theme === "dark" ? "#0b1220" : "#ffffff",
        foregroundColor: theme === "dark" ? "#e2e8f0" : "#0f172a",
        chromeBackgroundColor: theme === "dark" ? "#0f1a2b" : "#f1f5f9",
        headerBackgroundColor: theme === "dark" ? "#0b1526" : "#f1f5f9",
        headerTextColor: theme === "dark" ? "#8ea3bd" : "#475569",
        borderColor: theme === "dark" ? "#1c2a3f" : "#cbd5e1",
        accentColor: theme === "dark" ? "#34d399" : "#059669",
        browserColorScheme: theme,
        rowHoverColor: theme === "dark" ? "#132033" : "#f1f5f9",
        oddRowBackgroundColor: theme === "dark" ? "#0c1626" : "#f8fafc",
        selectedRowBackgroundColor: theme === "dark" ? "#16324a" : "#d1fae5",
        headerFontWeight: 600,
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      }),
    [theme],
  );

  useEffect(() => {
    followLiveRef.current = followLive;
  }, [followLive]);

  const onGridReady = useCallback((event: GridReadyEvent<TelemetryRecord>) => {
    gridApiRef.current = event.api;
  }, []);

  const scrollToRecord = useCallback((id?: string) => {
    // Wait for AG Grid to apply the new rowData before scrolling.
    window.setTimeout(() => {
      const api = gridApiRef.current;
      if (!api) return;
      const node = id ? api.getRowNode(id) : null;
      api.ensureIndexVisible(node?.rowIndex ?? 0, "top");
    }, 80);
  }, []);

  /**
   * Apply live records, or buffer them while the feed is paused.
   * Pausing freezes the table; the buffer is flushed when the user resumes.
   */
  const ingest = useCallback(
    (incoming: TelemetryRecord[]) => {
      if (incoming.length === 0) return;

      if (!followLiveRef.current) {
        const byId = new Map(pendingRef.current.map((record) => [record.id, record]));
        for (const record of incoming) byId.set(record.id, record);
        pendingRef.current = Array.from(byId.values()).slice(-MAX_ROWS);
        setPendingCount(pendingRef.current.length);
        return;
      }

      setRecords((current) => mergeRecords(current, incoming));
      setLastUpdated(new Date().toLocaleTimeString());
      scrollToRecord(newestOf(incoming)?.id);
    },
    [scrollToRecord],
  );

  const resumeLive = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = [];
    setPendingCount(0);
    followLiveRef.current = true;
    setFollowLive(true);

    if (pending.length > 0) {
      setRecords((current) => mergeRecords(current, pending));
      setLastUpdated(new Date().toLocaleTimeString());
      scrollToRecord(newestOf(pending)?.id);
    } else {
      scrollToRecord();
    }
  }, [scrollToRecord]);

  const toggleFollow = useCallback(() => {
    if (followLiveRef.current) {
      followLiveRef.current = false;
      setFollowLive(false);
      return;
    }
    resumeLive();
  }, [resumeLive]);

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
      ingest(data.records ?? []);
    });

    source.addEventListener("telemetry", (event) => {
      const record = JSON.parse((event as MessageEvent<string>).data) as TelemetryRecord;
      ingest([record]);
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
            ingest([normalizeAuditRow(row)]);
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
  }, [ingest]);

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

  const verdictMix = useMemo(() => {
    const total = Math.max(1, metrics.allows + metrics.warns + metrics.blocks);
    return {
      allow: (metrics.allows / total) * 100,
      warn: (metrics.warns / total) * 100,
      block: (metrics.blocks / total) * 100,
    };
  }, [metrics.allows, metrics.warns, metrics.blocks]);

  const connectionTone =
    connection === "CONNECTED"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : connection === "CONNECTING"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
        : "border-rose-400/30 bg-rose-400/10 text-rose-300";

  return (
    <main className="theme-dark-interface relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.14),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(56,189,248,0.08),_transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950/70 p-6 ring-1 ring-inset ring-white/[0.04]">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-500/5 text-emerald-300 shadow-[0_0_30px_-8px_rgba(52,211,153,0.55)] ring-1 ring-emerald-400/30">
                <ShieldIcon className="h-6 w-6" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-white">
                    Payment Guard <span className="text-emerald-300">Telemetry</span>
                  </h1>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    SOC console
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  Real-time threat evaluation and payload analysis across every guarded payment.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-wide ${connectionTone}`}
              >
                <span className="relative flex h-2 w-2">
                  {connection === "CONNECTED" && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                  )}
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
                </span>
                {connection}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                {transport === "supabase" ? "Supabase Realtime" : "In-memory SSE"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] text-slate-400">
                {lastUpdated}
              </span>
              <Link
                href="/terminal"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-emerald-400/30 hover:text-white"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                Terminal
              </Link>
            </div>
          </div>
        </header>

        {loadError && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {loadError}
          </div>
        )}

        <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard
            label="Total analyzed"
            value={metrics.total}
            tone="slate"
            hint="Rolling window of 500 events"
            icon={<ShieldIcon className="h-4 w-4" />}
          />
          <SummaryCard
            label="Passed"
            value={metrics.allows}
            tone="emerald"
            hint="ALLOW verdicts"
            icon={<CheckIcon className="h-4 w-4" />}
          />
          <SummaryCard
            label="Flagged"
            value={metrics.warns}
            tone="amber"
            hint="WARN verdicts"
            icon={<AlertIcon className="h-4 w-4" />}
          />
          <SummaryCard
            label="Blocked"
            value={metrics.blocks}
            tone="rose"
            hint="BLOCK verdicts"
            icon={<BlockIcon className="h-4 w-4" />}
          />
          <SummaryCard
            label="Avg guard latency"
            value={`${metrics.avgLatency} ms`}
            tone="sky"
            hint="Rules + optional AI"
            icon={<GaugeIcon className="h-4 w-4" />}
          />
        </section>

        <section className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 ring-1 ring-inset ring-white/[0.03]">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span>Verdict mix</span>
            <span className="font-mono text-slate-400">{metrics.total} events</span>
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="bg-emerald-400 transition-all" style={{ width: `${verdictMix.allow}%` }} />
            <div className="bg-amber-400 transition-all" style={{ width: `${verdictMix.warn}%` }} />
            <div className="bg-rose-400 transition-all" style={{ width: `${verdictMix.block}%` }} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> ALLOW{" "}
              <span className="font-mono text-slate-400">{verdictMix.allow.toFixed(0)}%</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> WARN{" "}
              <span className="font-mono text-slate-400">{verdictMix.warn.toFixed(0)}%</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> BLOCK{" "}
              <span className="font-mono text-slate-400">{verdictMix.block.toFixed(0)}%</span>
            </span>
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] ring-1 ring-inset ring-white/[0.03]">
          <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-slate-950/40 p-1">
                {(["ALL", "ALLOW", "WARN", "BLOCK"] as const).map((option) => {
                  const active = filter === option;
                  const tone =
                    option === "BLOCK"
                      ? "border-rose-400/40 bg-rose-400/10 text-rose-300"
                      : option === "WARN"
                        ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                        : option === "ALLOW"
                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                          : "border-slate-500/40 bg-slate-700/40 text-slate-100";
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFilter(option)}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold tracking-wide transition ${
                        active ? tone : "border-transparent text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {option}
                      <span className="ml-1.5 font-mono opacity-70">{filterCounts[option]}</span>
                    </button>
                  );
                })}
              </div>

              <label className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2 transition focus-within:border-emerald-400/30">
                <SearchIcon className="h-3.5 w-3.5 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search payee, email, rule…"
                  className="w-52 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleFollow}
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[11px] font-semibold transition ${
                  followLive
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15"
                    : "border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15"
                }`}
                aria-pressed={followLive}
              >
                {followLive ? <PauseIcon className="h-3 w-3" /> : <PlayIcon className="h-3 w-3" />}
                {followLive ? "Follow live" : "Paused"}
                {!followLive && pendingCount > 0 && (
                  <span className="rounded-full bg-amber-400/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-100">
                    {pendingCount} new
                  </span>
                )}
              </button>
            </div>
          </div>

          {!followLive && (
            <div className="flex items-center gap-2 border-b border-amber-400/10 bg-amber-400/[0.04] px-4 py-2 text-[11px] text-amber-200/80">
              <PauseIcon className="h-3 w-3" />
              Feed frozen{pendingCount > 0 ? ` — ${pendingCount} new event${pendingCount === 1 ? "" : "s"} waiting` : ""}.
              <button type="button" onClick={resumeLive} className="font-semibold text-amber-200 underline-offset-2 hover:underline">
                Resume live
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${followLive ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`}
              />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Event stream
              </h2>
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] text-slate-400">
                {visibleRecords.length}
              </span>
            </div>
            <span className="hidden text-[10px] text-slate-500 sm:block">
              Showing {visibleRecords.length} of {records.length} events
            </span>
          </div>

          <div className="h-[600px] w-full">
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

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-2.5 text-[10px] text-slate-500">
            <span>
              Transport:{" "}
              <span className="text-slate-400">
                {transport === "supabase"
                  ? "Supabase Realtime + SSE fallback"
                  : "in-memory SSE (Supabase not configured)"}
              </span>
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
