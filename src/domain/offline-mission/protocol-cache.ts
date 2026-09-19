import type { ProtocolDefinition } from "../action-guidance";
import type { ProtocolCacheEntry } from "./contracts";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(canonicalize(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

export async function createProtocolCacheEntries(
  protocols: readonly ProtocolDefinition[],
  cachedAt: string,
): Promise<ProtocolCacheEntry<ProtocolDefinition>[]> {
  return Promise.all(
    protocols.map(async (protocol) => ({
      protocolId: protocol.id,
      version: protocol.version,
      authority: protocol.authority,
      cachedAt,
      digestSha256: await sha256Hex(protocol),
      payload: protocol,
    })),
  );
}
