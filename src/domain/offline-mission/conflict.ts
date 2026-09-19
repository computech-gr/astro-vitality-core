import type { SyncComparableRecord, SyncConflictResolution } from "./contracts";

function parseVersion(value: string): number[] {
  return value
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function resolveSyncConflict(
  local: SyncComparableRecord,
  remote: SyncComparableRecord,
): SyncConflictResolution {
  if (local.id !== remote.id) {
    return { decision: "manual_review", reason: "Records do not share the same identity." };
  }
  if (local.payloadHash === remote.payloadHash) {
    return { decision: "duplicate", reason: "Payload hashes match; the event is already synchronized." };
  }

  const versionComparison = compareVersions(local.sourceVersion, remote.sourceVersion);
  if (versionComparison > 0) {
    return { decision: "local", reason: "Local source version is newer." };
  }
  if (versionComparison < 0) {
    return { decision: "remote", reason: "Remote source version is newer." };
  }

  const localTime = Date.parse(local.eventTimestamp);
  const remoteTime = Date.parse(remote.eventTimestamp);
  if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime !== remoteTime) {
    return localTime > remoteTime
      ? { decision: "local", reason: "Versions match and the local event timestamp is newer." }
      : { decision: "remote", reason: "Versions match and the remote event timestamp is newer." };
  }

  if (local.sourcePriority !== remote.sourcePriority) {
    return local.sourcePriority > remote.sourcePriority
      ? { decision: "local", reason: "Version and time match; local source priority is higher." }
      : { decision: "remote", reason: "Version and time match; remote source priority is higher." };
  }

  return {
    decision: "manual_review",
    reason: "Conflicting payloads share version, timestamp and source priority.",
  };
}
