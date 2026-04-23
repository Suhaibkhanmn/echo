/**
 * Cross-device sync for desktop: encrypted push/pull against Supabase.
 * Passphrase-derived AES-GCM key; server only ever sees ciphertext.
 */

import {
  deriveKey,
  encryptContent,
  decryptContent,
  generatePairId,
  generatePassphrase,
} from "@accountability/core";
import {
  applyRemoteEntry,
  applyRemoteCluster,
  applyRemoteOutcome,
  applyRemoteGlossary,
  applyRemoteDeleteEntry,
  getAllEntries,
  getClusters,
  getGlossary,
  __internal_getRawData,
} from "./store";

const LS_URL = "supabase_url";
const LS_ANON = "supabase_anon_key";
const LS_PAIR_ID = "sync_pair_id";
const LS_PAIR_PASS = "sync_pair_passphrase";
const LS_ENABLED = "sync_enabled";
const LS_CURSOR = "sync_cursor_id";
const LS_DEVICE = "sync_device_id";

const ENV_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const ENV_ANON = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export interface SyncStatus {
  enabled: boolean;
  configured: boolean;
  paired: boolean;
  lastError?: string;
  lastSyncAt?: Date;
  pairId?: string;
}

let currentKey: CryptoKey | null = null;
let lastKeyPassphrase: string | null = null;
let sessionPassphrase: string | null = null;
let sessionAccessToken: string | null = null;

let statusListeners = new Set<(s: SyncStatus) => void>();
let currentStatus: SyncStatus = { enabled: false, configured: false, paired: false };

function setStatus(patch: Partial<SyncStatus>) {
  currentStatus = { ...currentStatus, ...patch };
  for (const fn of statusListeners) fn(currentStatus);
}

export function subscribeSyncStatus(fn: (s: SyncStatus) => void): () => void {
  statusListeners.add(fn);
  fn(currentStatus);
  return () => {
    statusListeners.delete(fn);
  };
}

export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

export function getSupabaseUrl(): string {
  return localStorage.getItem(LS_URL) ?? ENV_URL ?? "";
}
export function getSupabaseAnonKey(): string {
  return localStorage.getItem(LS_ANON) ?? ENV_ANON ?? "";
}
export function setSupabaseCreds(url: string, anonKey: string) {
  localStorage.setItem(LS_URL, url.trim());
  localStorage.setItem(LS_ANON, anonKey.trim());
  refreshStatus();
}

export function getPair(): { pairId: string; passphrase: string } | null {
  const pairId = localStorage.getItem(LS_PAIR_ID);
  const passphrase = sessionPassphrase;
  if (!pairId || !passphrase) return null;
  return { pairId, passphrase };
}

export function setPair(pairId: string, passphrase: string, accessToken?: string) {
  localStorage.setItem(LS_PAIR_ID, pairId.trim());
  localStorage.removeItem(LS_PAIR_PASS);
  sessionPassphrase = passphrase.trim();
  sessionAccessToken = accessToken ?? null;
  currentKey = null;
  lastKeyPassphrase = null;
  localStorage.setItem(LS_CURSOR, "0");
  refreshStatus();
}

export function clearPair() {
  localStorage.removeItem(LS_PAIR_ID);
  localStorage.removeItem(LS_PAIR_PASS);
  localStorage.removeItem(LS_CURSOR);
  sessionPassphrase = null;
  sessionAccessToken = null;
  currentKey = null;
  lastKeyPassphrase = null;
  refreshStatus();
}

export function generateNewPair(): { pairId: string; passphrase: string } {
  const pairId = generatePairId();
  const passphrase = generatePassphrase();
  setPair(pairId, passphrase);
  return { pairId, passphrase };
}

export function isSyncEnabled(): boolean {
  return localStorage.getItem(LS_ENABLED) === "true";
}
export function setSyncEnabled(on: boolean) {
  localStorage.setItem(LS_ENABLED, String(on));
  refreshStatus();
}

export function getDeviceId(): string {
  let id = localStorage.getItem(LS_DEVICE);
  if (!id) {
    id = `desktop-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(LS_DEVICE, id);
  }
  return id;
}

function getCursor(): number {
  const n = Number(localStorage.getItem(LS_CURSOR) ?? "0");
  return Number.isFinite(n) ? n : 0;
}
function setCursor(n: number) {
  localStorage.setItem(LS_CURSOR, String(n));
}

async function getKey(): Promise<CryptoKey | null> {
  const pair = getPair();
  if (!pair) return null;
  if (currentKey && lastKeyPassphrase === pair.passphrase) return currentKey;
  currentKey = await deriveKey(pair.passphrase);
  lastKeyPassphrase = pair.passphrase;
  return currentKey;
}

function refreshStatus() {
  const pair = getPair();
  setStatus({
    enabled: isSyncEnabled(),
    configured: !!getSupabaseUrl() && !!getSupabaseAnonKey(),
    paired: !!pair,
    pairId: pair?.pairId,
  });
}

interface RemoteEvent {
  id: number;
  pair_id: string;
  device: string;
  event_type: string;
  payload: string;
  created_at: string;
}

async function pushPayload(eventType: string, payload: object): Promise<void> {
  if (!isSyncEnabled()) return;
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  const pair = getPair();
  const key = await getKey();
  if (!url || !anon || !pair || !key || !sessionAccessToken) return;

  const ciphertext = await encryptContent(JSON.stringify(payload), key);
  const res = await fetch(`${url}/rest/v1/sync_events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${sessionAccessToken}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      pair_id: pair.pairId,
      device: getDeviceId(),
      event_type: eventType,
      payload: ciphertext,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`push ${res.status}: ${text.slice(0, 200)}`);
  }
  setStatus({ lastError: undefined, lastSyncAt: new Date() });
}

async function pullNew(): Promise<number> {
  if (!isSyncEnabled()) return 0;
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  const pair = getPair();
  const key = await getKey();
  if (!url || !anon || !pair || !key || !sessionAccessToken) return 0;

  const after = getCursor();
  const res = await fetch(
    `${url}/rest/v1/sync_events?pair_id=eq.${encodeURIComponent(
      pair.pairId
    )}&id=gt.${after}&order=id.asc&limit=200`,
    {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${sessionAccessToken}`,
      },
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`pull ${res.status}: ${text.slice(0, 200)}`);
  }

  const rows = (await res.json()) as RemoteEvent[];
  const me = getDeviceId();
  let applied = 0;
  let maxId = after;

  for (const row of rows) {
    maxId = Math.max(maxId, row.id);
    if (row.device === me) continue;
    try {
      const json = await decryptContent(row.payload, key);
      const payload = JSON.parse(json);
      switch (row.event_type) {
        case "entry":
          applyRemoteEntry(payload);
          break;
        case "cluster":
          applyRemoteCluster(payload);
          break;
        case "outcome":
          applyRemoteOutcome(payload);
          break;
        case "glossary":
          applyRemoteGlossary(payload);
          break;
        case "delete_entry":
          applyRemoteDeleteEntry(payload);
          break;
        default:
          break;
      }
      applied++;
    } catch (err) {
      console.warn("skipping undecryptable event", row.id, err);
    }
  }

  setCursor(maxId);
  setStatus({ lastError: undefined, lastSyncAt: new Date() });
  return applied;
}

type PushKind = "entry" | "cluster" | "outcome" | "glossary" | "delete_entry";

export async function queueSyncPush(kind: PushKind, payload: object) {
  if (!isSyncEnabled()) return;
  try {
    await pushPayload(kind, payload);
  } catch (err: any) {
    setStatus({ lastError: String(err?.message ?? err) });
  }
}

export async function syncNow(): Promise<{ pushed: number; pulled: number; error?: string }> {
  if (!isSyncEnabled()) {
    return { pushed: 0, pulled: 0, error: "disabled" };
  }
  let pulled = 0;
  try {
    pulled = await pullNew();
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    setStatus({ lastError: msg });
    return { pushed: 0, pulled: 0, error: msg };
  }
  return { pushed: 0, pulled };
}

let loopHandle: ReturnType<typeof setInterval> | null = null;

export function startSyncLoop(intervalMs = 30_000): () => void {
  refreshStatus();
  void syncNow();
  loopHandle = setInterval(() => {
    void syncNow();
  }, intervalMs);
  return () => {
    if (loopHandle) clearInterval(loopHandle);
    loopHandle = null;
  };
}

export async function bootstrapPush(): Promise<number> {
  if (!isSyncEnabled()) return 0;
  const raw = __internal_getRawData();
  let pushed = 0;
  for (const e of raw.entries) {
    await pushPayload("entry", e);
    pushed++;
  }
  for (const c of raw.clusters) {
    await pushPayload("cluster", c);
    pushed++;
  }
  for (const g of raw.glossary) {
    await pushPayload("glossary", g);
    pushed++;
  }
  return pushed;
}
