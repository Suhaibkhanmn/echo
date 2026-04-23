import { genId } from "./id";
import { kvGet, kvSet } from "./kv";
import { queueSyncPush } from "./sync";
import { getAuth } from "./auth";
import { encryptContent, decryptContent } from "./crypto";
import { getGeminiApiKeySync } from "./secrets";
import { classifyEntry } from "@accountability/llm";
import type {
  CommitmentLevel,
  EntryKind,
  PatternSummary,
  ReferenceType,
} from "@accountability/core";

export type EntrySource = "text" | "voice" | "share" | "notif_reply";
export type Outcome = "did" | "pushed" | "dropped" | "just_noted" | "linked";

export interface Entry {
  id: string;
  createdAt: Date;
  content: string;
  source: EntrySource;
  salienceScore: number;
  clusterId?: string;
  device: string;
  /** Populated asynchronously by classifier */
  actionable?: boolean;
  kind?: EntryKind;
  commitmentLevel?: CommitmentLevel;
  referenceType?: ReferenceType;
  classificationConfidence?: number;
  shouldResurfaceTonight?: boolean;
  userFacingLine?: string;
  llmSummary?: string;
  deadline?: string | null;
  people?: string[];
  topic?: string;
  outcome?: Outcome;
  carriedFromId?: string;
  carriedForDate?: string;
  askCount?: number;
  lastAskedAt?: string;
  lastQuestionKey?: string;
}

export interface Cluster {
  id: string;
  label: string;
  firstSeen: Date;
  lastSeen: Date;
  occurrenceCount: number;
  pushedCount: number;
  doneCount: number;
  droppedCount: number;
  confirmed: boolean;
  glossaryId?: string;
}

export interface GlossaryEntry {
  id: string;
  clusterId: string;
  meaning: string;
  learnedAt: Date;
}

const TIME_ANCHORS = [
  "today", "tomorrow", "tonight", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday", "sunday", "by", "before",
  "deadline", "due", "morning", "evening",
];
const ACTION_PHRASES = [
  "need to", "have to", "should", "must", "gotta", "gonna",
  "going to", "want to", "wanna",
];
const ACTION_VERBS = [
  "call", "email", "send", "finish", "ship", "pay", "book",
  "cancel", "quit", "leave", "tell", "fix", "submit", "reply",
  "text", "buy", "return", "apply", "start", "stop", "do", "make",
];
const SELF_REFERENCE = [
  "i always", "i never", "why do i", "why am i", "should i",
  "i keep", "i can't", "i cant", "i won't", "i wont", "again",
];

function scoreSalience(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const anchor of TIME_ANCHORS) {
    if (new RegExp(`\\b${anchor}\\b`, "i").test(lower)) score += 2;
  }
  if (/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i.test(text)) score += 2;
  for (const phrase of ACTION_PHRASES) if (lower.includes(phrase)) score += 1;
  for (const verb of ACTION_VERBS) {
    if (new RegExp(`\\b${verb}\\b`, "i").test(lower)) score += 1;
  }
  for (const pattern of SELF_REFERENCE) if (lower.includes(pattern)) score += 2;
  if (text.endsWith("?")) score += 1;
  if (text.endsWith("!")) score += 1;
  const capsWords = text
    .split(/\s+/)
    .filter((w) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (capsWords.length > 0) score += Math.min(capsWords.length, 3);
  return score;
}

let entries: Entry[] = [];
let clusters: Cluster[] = [];
let glossaryEntries: GlossaryEntry[] = [];
let loaded = false;
let remoteClassifyBudget = 6;

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => fn());
}

function refreshReminderSoon() {
  void import("./reminder")
    .then((mod) => mod.refreshNightReminder())
    .catch(() => {});
}

const STORAGE_KEY = "accountability_state";
const STORAGE_VERSION = 2;

function save() {
  try {
    const state = {
      entries: entries.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
      clusters: clusters.map((c) => ({
        ...c,
        firstSeen: c.firstSeen.toISOString(),
        lastSeen: c.lastSeen.toISOString(),
      })),
      glossary: glossaryEntries.map((g) => ({
        ...g,
        learnedAt: g.learnedAt.toISOString(),
      })),
    };
    const json = JSON.stringify(state);
    const key = getAuth().encKey;
    if (key) {
      kvSet(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, ciphertext: encryptContent(json, key) }));
    } else {
      kvSet(STORAGE_KEY, json);
    }
  } catch {}
}

export function loadStore(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = kvGet(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const key = getAuth().encKey;
    const data =
      parsed?.v === STORAGE_VERSION && typeof parsed.ciphertext === "string" && key
        ? JSON.parse(decryptContent(parsed.ciphertext, key))
        : parsed;
    entries = (data.entries ?? []).map((e: any) => ({
      ...e,
      createdAt: new Date(e.createdAt),
      device: e.device ?? "mobile",
      kind: e.kind ?? inferLegacyKind(e),
      commitmentLevel: e.commitmentLevel ?? (e.actionable ? "clear" : "none"),
      referenceType: e.referenceType ?? "unknown",
      classificationConfidence: e.classificationConfidence ?? e.confidence ?? 0.5,
      shouldResurfaceTonight: e.shouldResurfaceTonight ?? !!e.actionable,
    }));
    void classifyMissingEntries();
    clusters = (data.clusters ?? []).map((c: any) => ({
      ...c,
      firstSeen: new Date(c.firstSeen),
      lastSeen: new Date(c.lastSeen),
    }));
    glossaryEntries = (data.glossary ?? []).map((g: any) => ({
      ...g,
      learnedAt: new Date(g.learnedAt),
    }));
    if (key && parsed?.v !== STORAGE_VERSION) save();
  } catch {}
  notify();
}

export function resetStore(): void {
  entries = [];
  clusters = [];
  glossaryEntries = [];
  save();
  notify();
}

export function lockStoreMemory(): void {
  entries = [];
  clusters = [];
  glossaryEntries = [];
  loaded = false;
  notify();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function addEntry(content: string, source: EntrySource = "text"): Entry {
  const entry: Entry = {
    id: genId(),
    createdAt: new Date(),
    content,
    source,
    salienceScore: scoreSalience(content),
    device: "mobile",
  };
  entries.push(entry);
  save();
  notify();
  refreshReminderSoon();
  void queueSyncPush("entry", serializeEntry(entry));

  // Fire-and-forget async classification
  void classifyEntryAsync(entry);

  return entry;
}

function inferLegacyKind(e: Partial<Entry>): EntryKind {
  if (e.actionable) return e.deadline ? "reminder" : "task";
  return "random_note";
}

async function classifyEntryAsync(entry: Entry) {
  try {
    const apiKey = getGeminiApiKeySync();
    const result = await classifyEntry(entry.content, apiKey);
    entry.actionable = result.actionable;
    entry.kind = result.kind;
    entry.commitmentLevel = result.commitmentLevel;
    entry.referenceType = result.referenceType;
    entry.classificationConfidence = result.confidence;
    entry.shouldResurfaceTonight = result.shouldResurfaceTonight;
    entry.userFacingLine = result.userFacingLine;
    entry.llmSummary = result.summary;
    entry.deadline = result.deadline;
    entry.people = result.people;
    entry.topic = result.topic;
    save();
    notify();
    refreshReminderSoon();
  } catch (err) {
    console.warn("Classification failed:", err);
  }
}

export function getTodayEntries(): Entry[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return entries.filter((e) => e.createdAt >= start);
}

export function getCloseWindowEntries(now = new Date()): Entry[] {
  void now;
  return getTodayEntries();
}

function isOpenForClose(entry: Entry): boolean {
  return !entry.outcome;
}

export function getOpenCloseWindowEntries(now = new Date()): Entry[] {
  return getCloseWindowEntries(now).filter(isOpenForClose);
}

export function getCloseWindowCount(now = new Date()): number {
  return getOpenCloseWindowEntries(now).length;
}

export async function reclassifyEntries(limit = 10): Promise<number> {
  const targets = entries
    .filter((entry) => entry.content.trim().length > 0)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  for (const entry of targets) {
    await classifyEntryAsync(entry);
    void queueSyncPush("entry", serializeEntry(entry));
  }
  refreshReminderSoon();
  return targets.length;
}

async function classifyMissingEntries() {
  const missing = entries.filter((entry) => !entry.kind || !entry.userFacingLine).slice(0, 6);
  for (const entry of missing) {
    await classifyEntryAsync(entry);
  }
}

export function getMorningCarryover(): Entry[] {
  const today = new Date().toISOString().slice(0, 10);
  return entries.filter((e) => e.carriedForDate === today);
}

export function getAllEntries(): Entry[] {
  return [...entries];
}
export function getTodayCount(): number {
  return getTodayEntries().length;
}
export function getClusters(): Cluster[] {
  return [...clusters];
}
export function getGlossary(): GlossaryEntry[] {
  return [...glossaryEntries];
}

export function addGlossaryEntry(clusterId: string, meaning: string): GlossaryEntry {
  const entry: GlossaryEntry = {
    id: genId(),
    clusterId,
    meaning,
    learnedAt: new Date(),
  };
  glossaryEntries.push(entry);
  const cluster = clusters.find((c) => c.id === clusterId);
  if (cluster) cluster.glossaryId = entry.id;
  save();
  notify();
  void queueSyncPush("glossary", serializeGlossary(entry));
  if (cluster) void queueSyncPush("cluster", serializeCluster(cluster));
  return entry;
}

export function updateOutcome(clusterId: string, outcome: Outcome) {
  const cluster = clusters.find((c) => c.id === clusterId);
  if (!cluster) return;
  cluster.confirmed = true;
  if (outcome === "did") cluster.doneCount++;
  if (outcome === "pushed") cluster.pushedCount++;
  if (outcome === "dropped") cluster.droppedCount++;
  cluster.lastSeen = new Date();
  for (const entry of entries.filter((e) => e.clusterId === clusterId)) {
    entry.outcome = outcome;
    if (outcome === "pushed") createCarryForward(entry);
    void queueSyncPush("entry", serializeEntry(entry));
  }
  save();
  notify();
  refreshReminderSoon();
  void queueSyncPush("outcome", {
    clusterId,
    outcome,
    at: cluster.lastSeen.toISOString(),
  });
}

export function updateEntryOutcome(entryId: string, outcome: Outcome) {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;
  entry.outcome = outcome;
  if (outcome === "pushed") {
    createCarryForward(entry);
  }
  save();
  notify();
  refreshReminderSoon();
  void queueSyncPush("entry", serializeEntry(entry));
}

export function deleteEntry(entryId: string) {
  const before = entries.length;
  entries = entries.filter((entry) => entry.id !== entryId && entry.carriedFromId !== entryId);
  for (const cluster of clusters) {
    const count = entries.filter((entry) => entry.clusterId === cluster.id).length;
    cluster.occurrenceCount = count;
  }
  clusters = clusters.filter((cluster) => entries.some((entry) => entry.clusterId === cluster.id));
  if (entries.length === before) return;
  save();
  notify();
  refreshReminderSoon();
  void queueSyncPush("delete_entry", { entryId, at: new Date().toISOString() });
}

export function markEntriesAsked(entryIds: string[], question: string) {
  const key = classifyQuestionKey(question);
  const now = new Date().toISOString();
  let changed = false;
  for (const id of entryIds) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) continue;
    entry.askCount = (entry.askCount ?? 0) + 1;
    entry.lastAskedAt = now;
    entry.lastQuestionKey = key;
    changed = true;
    void queueSyncPush("entry", serializeEntry(entry));
  }
  if (changed) {
    save();
    notify();
  }
}

function createCarryForward(entry: Entry) {
  if (!entry.actionable && entry.kind !== "task" && entry.kind !== "reminder") return;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(7, 0, 0, 0);
  const dateKey = tomorrow.toISOString().slice(0, 10);
  const exists = entries.some(
    (e) => e.carriedFromId === entry.id && e.carriedForDate === dateKey
  );
  if (exists) return;
  const carried: Entry = {
    ...entry,
    id: genId(),
    createdAt: tomorrow,
    content: entry.llmSummary ? `carry: ${entry.llmSummary}` : `carry: ${entry.content}`,
    salienceScore: Math.max(entry.salienceScore, 4),
    outcome: undefined,
    carriedFromId: entry.id,
    carriedForDate: dateKey,
    userFacingLine: "carried into today.",
  };
  entries.push(carried);
  void queueSyncPush("entry", serializeEntry(carried));
}

export function searchEntries(query: string): Entry[] {
  const terms = expandMeaningTerms(query);
  if (terms.length === 0) return [];
  return entries
    .map((entry) => ({ entry, score: scoreMeaningMatch(entry, terms) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.createdAt.getTime() - a.entry.createdAt.getTime())
    .map((hit) => hit.entry);
}

export interface SurfacedItem {
  type: "cluster" | "single";
  clusterId?: string;
  cluster?: Cluster;
  entries: Entry[];
  glossary?: GlossaryEntry;
  topSalience: number;
}

export function getSurfacedItems(sourceEntries: Entry[] = getTodayEntries()): { surfaced: SurfacedItem[]; remaining: Entry[] } {
  const today = sourceEntries;
  const THRESHOLD = 3;
  const surfaced: SurfacedItem[] = [];
  const surfacedIds = new Set<string>();

  const byCluster = new Map<string, Entry[]>();
  const unclustered: Entry[] = [];
  for (const e of today) {
    if (e.clusterId) {
      const list = byCluster.get(e.clusterId) ?? [];
      list.push(e);
      byCluster.set(e.clusterId, list);
    } else {
      unclustered.push(e);
    }
  }

  for (const [cid, ces] of byCluster) {
    const cluster = clusters.find((c) => c.id === cid);
    if (!cluster) continue;
    if (ces.length >= 2 || cluster.confirmed) {
      surfaced.push({
        type: "cluster",
        clusterId: cid,
        cluster,
        entries: ces,
        glossary: glossaryEntries.find((g) => g.clusterId === cid),
        topSalience: Math.max(...ces.map((e) => e.salienceScore)),
      });
      ces.forEach((e) => surfacedIds.add(e.id));
    }
  }

  for (const e of unclustered) {
    if (
      e.salienceScore >= THRESHOLD ||
      e.shouldResurfaceTonight ||
      e.actionable ||
      e.carriedFromId
    ) {
      surfaced.push({
        type: "single",
        entries: [e],
        topSalience: e.salienceScore,
      });
      surfacedIds.add(e.id);
    }
  }

  surfaced.sort((a, b) => b.topSalience - a.topSalience);
  const remaining = today.filter((e) => !surfacedIds.has(e.id));
  return { surfaced, remaining };
}

export function getCloseSurfacedItems(now = new Date()): { surfaced: SurfacedItem[]; remaining: Entry[] } {
  return getSurfacedItems(getOpenCloseWindowEntries(now));
}

export function getPatterns(): PatternSummary[] {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const groups = new Map<string, Entry[]>();

  for (const entry of entries) {
    const key = normalizeTopic(entry.topic || entry.llmSummary || entry.content);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  return Array.from(groups.entries())
    .map(([topic, list]) => {
      const sorted = [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const pushedCount = list.filter((e) => e.outcome === "pushed").length;
      const doneCount = list.filter((e) => e.outcome === "did").length;
      const droppedCount = list.filter((e) => e.outcome === "dropped").length;
      const last = sorted[0]?.createdAt ?? now;
      return {
        clusterId: `topic:${topic}`,
        label: topic,
        meaning: topic,
        totalOccurrences: list.length,
        thisWeekOccurrences: list.filter((e) => e.createdAt >= weekAgo).length,
        pushedCount,
        doneCount,
        droppedCount,
        consecutivePushes: pushedCount,
        daysSinceLastTouched: Math.floor(
          (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
        ),
      };
    })
    .filter((p) => p.totalOccurrences >= 2 || p.pushedCount > 0 || p.thisWeekOccurrences >= 2)
    .sort((a, b) => b.thisWeekOccurrences - a.thisWeekOccurrences || b.pushedCount - a.pushedCount);
}

export function serializeEntry(e: Entry) {
  return {
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    device: e.device ?? "mobile",
    content: e.content,
    source: e.source,
    salienceScore: e.salienceScore,
    clusterId: e.clusterId ?? null,
    actionable: e.actionable ?? null,
    kind: e.kind ?? null,
    commitmentLevel: e.commitmentLevel ?? null,
    referenceType: e.referenceType ?? null,
    classificationConfidence: e.classificationConfidence ?? null,
    shouldResurfaceTonight: e.shouldResurfaceTonight ?? null,
    userFacingLine: e.userFacingLine ?? null,
    llmSummary: e.llmSummary ?? null,
    deadline: e.deadline ?? null,
    people: e.people ?? [],
    topic: e.topic ?? null,
    outcome: e.outcome ?? null,
    carriedFromId: e.carriedFromId ?? null,
    carriedForDate: e.carriedForDate ?? null,
    askCount: e.askCount ?? 0,
    lastAskedAt: e.lastAskedAt ?? null,
    lastQuestionKey: e.lastQuestionKey ?? null,
  };
}
export function serializeCluster(c: Cluster) {
  return {
    id: c.id,
    label: c.label,
    firstSeen: c.firstSeen.toISOString(),
    lastSeen: c.lastSeen.toISOString(),
    occurrenceCount: c.occurrenceCount,
    pushedCount: c.pushedCount,
    doneCount: c.doneCount,
    droppedCount: c.droppedCount,
    confirmed: c.confirmed,
    glossaryId: c.glossaryId ?? null,
  };
}
export function serializeGlossary(g: GlossaryEntry) {
  return {
    id: g.id,
    clusterId: g.clusterId,
    meaning: g.meaning,
    learnedAt: g.learnedAt.toISOString(),
  };
}

export function applyRemoteEntry(raw: any) {
  if (!raw?.id) return;
  const existing = entries.find((e) => e.id === raw.id);
  const merged: Entry = {
    id: raw.id,
    createdAt: new Date(raw.createdAt),
    device: raw.device ?? "unknown",
    content: raw.content ?? "",
    source: raw.source ?? "text",
    salienceScore: raw.salienceScore ?? 0,
    clusterId: raw.clusterId ?? undefined,
    actionable: raw.actionable ?? undefined,
    kind: raw.kind ?? inferLegacyKind(raw),
    commitmentLevel: raw.commitmentLevel ?? (raw.actionable ? "clear" : "none"),
    referenceType: raw.referenceType ?? "unknown",
    classificationConfidence: raw.classificationConfidence ?? raw.confidence ?? 0.5,
    shouldResurfaceTonight: raw.shouldResurfaceTonight ?? !!raw.actionable,
    userFacingLine: raw.userFacingLine ?? undefined,
    llmSummary: raw.llmSummary ?? undefined,
    deadline: raw.deadline ?? null,
    people: Array.isArray(raw.people) ? raw.people : [],
    topic: raw.topic ?? undefined,
    outcome: raw.outcome ?? undefined,
    carriedFromId: raw.carriedFromId ?? undefined,
    carriedForDate: raw.carriedForDate ?? undefined,
    askCount: raw.askCount ?? 0,
    lastAskedAt: raw.lastAskedAt ?? undefined,
    lastQuestionKey: raw.lastQuestionKey ?? undefined,
  };
  if (existing) Object.assign(existing, merged);
  else entries.push(merged);
  save();
  notify();
  if (!raw.kind || !raw.userFacingLine) {
    void classifyRemoteEntrySoon(existing ?? merged);
  }
}

function classifyRemoteEntrySoon(entry: Entry) {
  if (remoteClassifyBudget <= 0) return;
  remoteClassifyBudget -= 1;
  void classifyEntryAsync(entry);
}

export function applyRemoteDeleteEntry(raw: any) {
  const entryId = raw?.entryId;
  if (!entryId) return;
  entries = entries.filter((entry) => entry.id !== entryId && entry.carriedFromId !== entryId);
  clusters = clusters.filter((cluster) => entries.some((entry) => entry.clusterId === cluster.id));
  save();
  notify();
  refreshReminderSoon();
}

function normalizeTopic(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .slice(0, 2)
    .join(" ");
}

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "need", "have",
  "should", "would", "could", "today", "tomorrow", "keep", "why", "how",
]);

const MEANING_GROUPS: Record<string, string[]> = {
  doctor: ["doctor", "dentist", "clinic", "hospital", "appointment", "medicine", "prescription", "health"],
  money: ["money", "rent", "invoice", "refund", "subscription", "bill", "pay", "salary", "bank"],
  family: ["family", "mom", "dad", "home", "sister", "brother", "parents"],
  work: ["work", "boss", "office", "report", "deck", "client", "meeting", "email"],
  fitness: ["fitness", "gym", "run", "walk", "workout", "diet", "sleep"],
  travel: ["travel", "flight", "train", "ticket", "visa", "hotel", "trip"],
};

function expandMeaningTerms(query: string): string[] {
  const raw = query.toLowerCase().split(/\s+/).filter(Boolean);
  const terms = new Set(raw);
  for (const term of raw) {
    for (const group of Object.values(MEANING_GROUPS)) {
      if (group.includes(term)) group.forEach((word) => terms.add(word));
    }
  }
  return Array.from(terms);
}

function scoreMeaningMatch(entry: Entry, terms: string[]): number {
  const haystack = [
    entry.content,
    entry.llmSummary,
    entry.topic,
    entry.kind,
    entry.userFacingLine,
    ...(entry.people ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += term.length > 3 ? 2 : 1;
  }
  return score;
}

function classifyQuestionKey(question: string): string {
  const lower = question.toLowerCase();
  if (lower.includes("done")) return "done";
  if (lower.includes("carry")) return "carry";
  if (lower.includes("drop")) return "drop";
  if (lower.includes("still")) return "still_true";
  if (lower.includes("worth")) return "worth_keeping";
  if (lower.includes("revisit")) return "revisit";
  if (lower.includes("clarity")) return "clarity";
  return "ack";
}

export function applyRemoteCluster(raw: any) {
  if (!raw?.id) return;
  const existing = clusters.find((c) => c.id === raw.id);
  const merged: Cluster = {
    id: raw.id,
    label: raw.label ?? "",
    firstSeen: new Date(raw.firstSeen),
    lastSeen: new Date(raw.lastSeen),
    occurrenceCount: raw.occurrenceCount ?? 0,
    pushedCount: raw.pushedCount ?? 0,
    doneCount: raw.doneCount ?? 0,
    droppedCount: raw.droppedCount ?? 0,
    confirmed: !!raw.confirmed,
    glossaryId: raw.glossaryId ?? undefined,
  };
  if (existing) {
    if (merged.lastSeen >= existing.lastSeen) Object.assign(existing, merged);
  } else {
    clusters.push(merged);
  }
  save();
  notify();
}

export function applyRemoteOutcome(raw: any) {
  const cluster = clusters.find((c) => c.id === raw?.clusterId);
  if (!cluster) return;
  const when = raw?.at ? new Date(raw.at) : new Date();
  if (when < cluster.lastSeen) return;
  if (raw.outcome === "did") cluster.doneCount++;
  else if (raw.outcome === "pushed") cluster.pushedCount++;
  else if (raw.outcome === "dropped") cluster.droppedCount++;
  for (const entry of entries.filter((e) => e.clusterId === cluster.id)) {
    entry.outcome = raw.outcome;
  }
  cluster.lastSeen = when;
  cluster.confirmed = true;
  save();
  notify();
  refreshReminderSoon();
}

export function applyRemoteGlossary(raw: any) {
  if (!raw?.id) return;
  const existing = glossaryEntries.find((g) => g.id === raw.id);
  const merged: GlossaryEntry = {
    id: raw.id,
    clusterId: raw.clusterId,
    meaning: raw.meaning ?? "",
    learnedAt: new Date(raw.learnedAt),
  };
  if (existing) Object.assign(existing, merged);
  else glossaryEntries.push(merged);
  const cluster = clusters.find((c) => c.id === merged.clusterId);
  if (cluster) cluster.glossaryId = merged.id;
  save();
  notify();
}

export function __internal_getRawData() {
  return {
    entries: entries.map(serializeEntry),
    clusters: clusters.map(serializeCluster),
    glossary: glossaryEntries.map(serializeGlossary),
  };
}
