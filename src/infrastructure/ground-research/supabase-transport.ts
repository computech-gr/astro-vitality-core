import { supabase } from "@/integrations/supabase/client";
import { sha256Hex, type OfflineEventRecord, type SyncComparableRecord } from "@/domain/offline-mission";
import type { OfflineSyncTransport, SyncTransportResult } from "@/infrastructure/offline/sync";

interface RpcResponse<T> {
  data: T | null;
  error: { message: string } | null;
}
interface RpcCapableClient {
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResponse<T>>;
}

function rpcClient(): RpcCapableClient {
  return supabase as unknown as RpcCapableClient;
}

/** Fail closed only for known deterministic input/auth failures; unknown errors remain retryable. */
export function classifyMissionSyncError(message: string): "rejected" | "retryable" {
  const normalized = message.toLowerCase();
  if (/\b(network|timeout|timed out|connection|fetch failed|rate limit|temporarily unavailable|service unavailable|gateway|deadlock|lock timeout)\b/i.test(normalized)) return "retryable";
  if (/mission access denied|authentication required|invalid (mission|crew)|permission denied|violates .*constraint|structured payload required|payload too large|unsupported event kind|invalid source provenance|event identifiers? too long|invalid idempotency key|invalid event (kind|identifier)|invalid source (id|version)|crew assignment inactive|mission closed for new events|mission operator event scope denied/i.test(normalized)) return "rejected";
  return "retryable";
}

export class SupabaseMissionSyncTransport implements OfflineSyncTransport {
  readonly id = "supabase-mission-sync-v1";

  async push(records: readonly OfflineEventRecord[]): Promise<SyncTransportResult[]> {
    // Each record is independent: one rejected/failed RPC must not poison the batch.
    return Promise.all(records.map(async (record): Promise<SyncTransportResult> => {
      try {
        const idempotencyKey = `${record.id}:${record.sourceVersion}:${await sha256Hex(record.payload)}`;
        const { data, error } = await rpcClient().rpc<{
          status: string;
          record_id: string;
          remote?: SyncComparableRecord;
        }>("ingest_mission_event", { p_event: record, p_idempotency_key: idempotencyKey });
        if (error) {
          return { recordId: record.id, status: classifyMissionSyncError(error.message), message: error.message };
        }
        if (!data) return { recordId: record.id, status: "retryable", message: "Mission sync returned no result" };
        if (data.record_id !== record.id) return { recordId: record.id, status: "rejected", message: "Sync response record ID mismatch" };
        if (data.status !== "accepted" && data.status !== "duplicate" && data.status !== "conflict" && data.status !== "rejected") {
          return { recordId: record.id, status: "rejected", message: "Unsupported mission sync status" };
        }
        return { recordId: record.id, status: data.status, ...(data.remote ? { remote: data.remote } : {}) } as SyncTransportResult;
      } catch (error) {
        return { recordId: record.id, status: "retryable", message: error instanceof Error ? error.message : "Record sync failed" };
      }
    }));
  }
}
