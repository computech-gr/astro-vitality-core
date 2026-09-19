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

export class SupabaseMissionSyncTransport implements OfflineSyncTransport {
  readonly id = "supabase-mission-sync-v1";

  async push(records: readonly OfflineEventRecord[]): Promise<SyncTransportResult[]> {
    return Promise.all(
      records.map(async (record) => {
        const idempotencyKey = `${record.id}:${record.sourceVersion}:${await sha256Hex(record.payload)}`;
        const { data, error } = await rpcClient().rpc<{
          status: string;
          record_id: string;
          remote?: SyncComparableRecord;
        }>("ingest_mission_event", { p_event: record, p_idempotency_key: idempotencyKey });
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Mission sync returned no result");
        const status = data.status;
        if (
          status !== "accepted" &&
          status !== "duplicate" &&
          status !== "conflict" &&
          status !== "rejected"
        ) {
          throw new Error(`Unsupported mission sync status: ${status}`);
        }
        return {
          recordId: data.record_id,
          status,
          ...(data.remote ? { remote: data.remote } : {}),
        } as SyncTransportResult;
      }),
    );
  }
}
