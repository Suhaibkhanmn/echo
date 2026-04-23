/**
 * Mobile sync — encrypted push/pull against Supabase using the logged-in user's id.
 * pair_id = auth user.id. Encryption key = PBKDF2(password).
 */
import { encryptContent, decryptContent } from "./crypto";
import { getAuth, refreshSession, subscribeAuth } from "./auth";
import {
  applyRemoteEntry,
  applyRemoteCluster,
  applyRemoteOutcome,
  applyRemoteGlossary,
  applyRemoteDeleteEntry,
  __internal_getRawData,
} from "./store";
import { kvGet, kvSet } from "./kv";
import { genId } from "./id";

const URL_ = (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ?? "";
const ANON = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ?? "";

const KV_CURSOR = "sync_cursor_id";
const KV_DEVICE = "sync_device_id";
const KV_PENDING = "sync_pending_queue";

export interface SyncStatus {
  enabled: boolean;
  lastError?: string;
  lastSyncAt?: Date;
  pendingCount: number;
}

let statusListeners = new Set<(s: SyncStatus) => void>();
let currentStatus: SyncStatus = { enabled: false, pendingCount: 0 };

function setStatus(patch: Partial<SyncStatus>) {
  currentStatus = { ...currentStatus, ...patch };
  statusListeners.forEach((fn) => fn(currentStatus));
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

function getCursor(): number {
  const n = Number(kvGet(KV_CURSOR) ?? "0");
  return Number.isFinite(n) ? n : 0;
}
function setCursor(n: number) {
  kvSet(KV_CURSOR, String(n));
}

function getDeviceId(): string {
  let id = kvGet(KV_DEVICE);
  if (!id) {
    id = `mobile-${genId().slice(0, 10)}`;
    kvSet(KV_DEVICE, id);
  }
  return id;
}

interface PendingItem {
  kind: string;
  payload: object;
  tries: number;
}

function loadPending(): PendingItem[] {
  try {
    const raw = kvGet(KV_PENDING);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const key = getAuth().encKey;
    if (parsed?.v === 2 && typeof parsed.ciphertext === "string" && key) {
      return JSON.parse(decryptContent(parsed.ciphertext, key));
    }
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function savePending(items: PendingItem[]) {
  const key = getAuth().encKey;
  const json = JSON.stringify(items);
  kvSet(
    KV_PENDING,
    key ? JSON.stringify({ v: 2, ciphertext: encryptContent(json, key) }) : json
  );
  setStatus({ pendingCount: items.length });
}

function isExpiredSession(statusCode: number, text: string): boolean {
  const lower = text.toLowerCase();
  return (
    statusCode === 401 &&
    (lower.includes("jwt expired") || lower.includes("pgrst303"))
  );
}

async function syncError(prefix: "push" | "pull", res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (isExpiredSession(res.status, text)) {
    return "session expired. sign out and sign in again.";
  }
  return `${prefix} ${res.status}: ${text.slice(0, 200)}`;
}

async function doPush(eventType: string, payload: object): Promise<void> {
  await refreshSession();
  let auth = getAuth();
  if (!auth.user || !auth.encKey || !auth.accessToken) throw new Error("not logged in");
  if (!URL_ || !ANON) throw new Error("supabase not configured");

  const ct = encryptContent(JSON.stringify(payload), auth.encKey);
  const makeRequest = () =>
    fetch(`${URL_}/rest/v1/sync_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${auth.accessToken}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        pair_id: auth.user?.id,
        device: getDeviceId(),
        event_type: eventType,
        payload: ct,
      }),
    });

  let res = await makeRequest();
  if (!res.ok && res.status === 401 && (await refreshSession(true))) {
    auth = getAuth();
    res = await makeRequest();
  }
  if (!res.ok) {
    throw new Error(await syncError("push", res));
  }
}

async function fetchPull(after: number): Promise<Response> {
  const auth = getAuth();
  if (!auth.user || !auth.accessToken) throw new Error("not logged in");
  return fetch(
    `${URL_}/rest/v1/sync_events?pair_id=eq.${encodeURIComponent(
      auth.user.id
    )}&id=gt.${after}&order=id.asc&limit=500`,
    {
      headers: { apikey: ANON, Authorization: `Bearer ${auth.accessToken}` },
    }
  );
}

type PushKind = "entry" | "cluster" | "outcome" | "glossary" | "delete_entry";

export async function queueSyncPush(kind: PushKind, payload: object): Promise<void> {
  const auth = getAuth();
  if (!auth.user || !auth.encKey || !auth.accessToken) {
    // not logged in — skip silently
    return;
  }
  try {
    await doPush(kind, payload);
    setStatus({ lastError: undefined, lastSyncAt: new Date() });
  } catch (err: any) {
    const pending = loadPending();
    pending.push({ kind, payload, tries: 0 });
    savePending(pending);
    setStatus({ lastError: String(err?.message ?? err) });
  }
}

async function flushPending(): Promise<void> {
  const auth = getAuth();
  if (!auth.user || !auth.encKey || !auth.accessToken) return;
  const pending = loadPending();
  if (pending.length === 0) return;
  const remaining: PendingItem[] = [];
  for (const item of pending) {
    try {
      await doPush(item.kind, item.payload);
    } catch (err) {
      item.tries++;
      if (item.tries < 10) remaining.push(item);
    }
  }
  savePending(remaining);
}

async function pullNew(): Promise<number> {
  await refreshSession();
  let auth = getAuth();
  if (!auth.user || !auth.encKey || !auth.accessToken) return 0;
  if (!URL_ || !ANON) return 0;

  const after = getCursor();
  let res = await fetchPull(after);
  if (!res.ok && res.status === 401 && (await refreshSession(true))) {
    auth = getAuth();
    if (!auth.user || !auth.encKey || !auth.accessToken) return 0;
    res = await fetchPull(after);
  }
  if (!res.ok) {
    throw new Error(await syncError("pull", res));
  }
  const rows = await res.json();
  const me = getDeviceId();
  let applied = 0;
  let maxId = after;
  for (const row of rows) {
    maxId = Math.max(maxId, row.id);
    if (row.device === me) continue;
    try {
      const json = decryptContent(row.payload, auth.encKey);
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
      }
      applied++;
    } catch {}
  }
  setCursor(maxId);
  return applied;
}

export async function syncNow(): Promise<{ pulled: number; error?: string }> {
  const auth = getAuth();
  if (!auth.user || !auth.encKey || !auth.accessToken) {
    return { pulled: 0, error: "not logged in" };
  }
  try {
    await flushPending();
    const pulled = await pullNew();
    setStatus({ lastError: undefined, lastSyncAt: new Date() });
    return { pulled };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    setStatus({ lastError: msg });
    return { pulled: 0, error: msg };
  }
}

let loopHandle: ReturnType<typeof setInterval> | null = null;

export function startSyncLoop(intervalMs = 30_000): () => void {
  const unsubAuth = subscribeAuth((s) => {
    setStatus({ enabled: !!(s.user && s.encKey && s.accessToken) });
  });
  void syncNow();
  loopHandle = setInterval(() => {
    void syncNow();
  }, intervalMs);
  return () => {
    unsubAuth();
    if (loopHandle) clearInterval(loopHandle);
    loopHandle = null;
  };
}

export async function bootstrapPush(): Promise<number> {
  const auth = getAuth();
  if (!auth.user || !auth.encKey || !auth.accessToken) return 0;
  const raw = __internal_getRawData();
  let pushed = 0;
  for (const e of raw.entries) {
    await doPush("entry", e);
    pushed++;
  }
  for (const c of raw.clusters) {
    await doPush("cluster", c);
    pushed++;
  }
  for (const g of raw.glossary) {
    await doPush("glossary", g);
    pushed++;
  }
  return pushed;
}
