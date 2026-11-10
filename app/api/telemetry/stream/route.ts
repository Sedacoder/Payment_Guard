import { connection } from "next/server";

import { listTelemetry, subscribeTelemetry } from "@/lib/telemetry";
import { seedTelemetry } from "@/lib/telemetry-seed";

const HEARTBEAT_MS = 15000;

/**
 * Server-Sent Events feed for the telemetry dashboard.
 *
 * The in-memory store is the local stand-in for Supabase Realtime. When the
 * real table exists, swap `subscribeTelemetry` for a postgres_changes
 * subscription and this endpoint can disappear.
 */
export async function GET(request: Request) {
  await connection();
  await seedTelemetry();

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      send("snapshot", {
        records: listTelemetry(500),
        serverTime: new Date().toISOString(),
      });

      unsubscribe = subscribeTelemetry((record) => send("telemetry", record));
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // The client may already have closed the stream.
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
