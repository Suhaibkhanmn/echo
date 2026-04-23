/**
 * Sync engine for cross-device communication via Supabase.
 * All content is encrypted client-side before leaving the device.
 */

import { encrypt, decrypt } from "./crypto.js";

export interface SyncConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  pairId: string;
  encryptionKey: CryptoKey;
  device: string;
}

export interface SyncEvent {
  id?: number;
  pairId: string;
  device: string;
  eventType: string;
  payload: Uint8Array;
  createdAt?: Date;
}

export async function createSyncEvent(
  config: SyncConfig,
  eventType: string,
  plaintextPayload: object
): Promise<SyncEvent> {
  const json = JSON.stringify(plaintextPayload);
  const encrypted = await encrypt(json, config.encryptionKey);

  const event: SyncEvent = {
    pairId: config.pairId,
    device: config.device,
    eventType,
    payload: encrypted,
  };

  return event;
}

export async function decryptSyncEvent(
  event: SyncEvent,
  key: CryptoKey
): Promise<{ eventType: string; payload: any }> {
  const json = await decrypt(event.payload, key);
  return {
    eventType: event.eventType,
    payload: JSON.parse(json),
  };
}

export async function pushEvent(
  config: SyncConfig,
  event: SyncEvent
): Promise<void> {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/sync_events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      pair_id: event.pairId,
      device: event.device,
      event_type: event.eventType,
      payload: bytesToBase64(event.payload),
    }),
  });

  if (!response.ok) {
    throw new Error(`Sync push failed: ${response.status}`);
  }
}

export async function pullEvents(
  config: SyncConfig,
  afterId: number = 0
): Promise<SyncEvent[]> {
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/sync_events?pair_id=eq.${config.pairId}&id=gt.${afterId}&order=id.asc&limit=100`,
    {
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Sync pull failed: ${response.status}`);
  }

  const rows = await response.json();
  return rows.map((row: any) => ({
    id: row.id,
    pairId: row.pair_id,
    device: row.device,
    eventType: row.event_type,
    payload: base64ToBytes(row.payload),
    createdAt: new Date(row.created_at),
  }));
}

export async function encryptContent(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const encrypted = await encrypt(plaintext, key);
  return bytesToBase64(encrypted);
}

export async function decryptContent(
  ciphertext: string,
  key: CryptoKey
): Promise<string> {
  const bytes = base64ToBytes(ciphertext);
  return decrypt(bytes, key);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

