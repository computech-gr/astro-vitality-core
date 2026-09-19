import type { EncryptedOfflineRecord, OfflineEventRecord } from "@/domain/offline-mission";
import { sha256Hex } from "@/domain/offline-mission";

const KEY_VERSION = "device-local-aes-gcm-v1";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function generateDeviceLocalKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptOfflineRecord(
  record: OfflineEventRecord,
  key: CryptoKey,
): Promise<EncryptedOfflineRecord> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(record));
  const additionalData = new TextEncoder().encode(`${record.id}|${record.kind}|${KEY_VERSION}`);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    plaintext,
  );

  return {
    id: record.id,
    kind: record.kind,
    eventTimestamp: record.eventTimestamp,
    createdAt: record.createdAt,
    version: 1,
    payloadHash: await sha256Hex(record.payload),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    cryptoAlgorithm: "AES-GCM",
    keyVersion: KEY_VERSION,
  };
}

export async function decryptOfflineRecord(
  encrypted: EncryptedOfflineRecord,
  key: CryptoKey,
): Promise<OfflineEventRecord> {
  if (encrypted.cryptoAlgorithm !== "AES-GCM" || encrypted.keyVersion !== KEY_VERSION) {
    throw new Error("Unsupported offline-record encryption metadata");
  }
  const additionalData = new TextEncoder().encode(
    `${encrypted.id}|${encrypted.kind}|${encrypted.keyVersion}`,
  );
  const plaintext = await globalThis.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(encrypted.iv),
      additionalData,
    },
    key,
    base64ToBytes(encrypted.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as OfflineEventRecord;
}
