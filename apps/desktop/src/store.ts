import type { Entry, Cluster, GlossaryEntry, Outcome, PatternSummary, SurfacedItem } from "@accountability/core";
import { deriveKey, encryptContent, decryptContent, scoreSalience, surfaceForNight } from "@accountability/core";
import { queueSyncPush } from "./sync";
import { classifyEntry } from "@accountability/llm";

function uuid(): string {
  return crypto.randomUUID();
}

let entries: Entry[] = [];
let clusters: Cluster[] = [];
let glossaryEntries: GlossaryEntry[] = [];
let localKey: CryptoKey | null = null;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function lockStoreMemory(): void {
  entries = [];
  clusters = [];
  glossaryEntries = [];
  localKey = null;
  notify();
}

export function addEntry(content: string, source: "text" | "voice" = "text"): Entry {
  const { total } = scoreSalience(content);
  const entry: Entry = {
    id: uuid(),
    createdAt: new Date(),
    device: "desktop",
    content,
    source,
    salienceScore: total,
  };
  entries.push(entry);
  save();
  notify();
  void queueSyncPush("entry", serializeEntry(entry));

  // Fire-and-forget async classification
  void classifyEntryAsync(entry);

  return entry;
}

async function classifyEntryAsync(entry: Entry) {
  try {
    const apiKey =
      localStorage.getItem("gemini_api_key") ||
      ((typeof process !== "undefined" && process.env?.VITE_GEMINI_API_KEY) || undefined);
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
  } catch (err) {
    console.warn("Classification failed:", err);
  }
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
  return targets.length;
}

export function getTodayEntries(): Entry[] {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return entries.filter((e) => e.createdAt >= startOfDay);
}

function isOpenForClose(entry: Entry): boolean {
  return !entry.outcome;
}

export function getCloseEntries(): Entry[] {
  return getTodayEntries().filter(isOpenForClose);
}

export function getCloseCount(): number {
  return getCloseEntries().length;
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
    id: uuid(),
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

export function createCluster(label: string, entryIds: string[]): Cluster {
  const now = new Date();
  const cluster: Cluster = {
    id: uuid(),
    label,
    firstSeen: now,
    lastSeen: now,
    occurrenceCount: entryIds.length,
    pushedCount: 0,
    doneCount: 0,
    droppedCount: 0,
    confirmed: false,
  };
  clusters.push(cluster);
  for (const eid of entryIds) {
    const entry = entries.find((e) => e.id === eid);
    if (entry) entry.clusterId = cluster.id;
  }
  save();
  notify();
  void queueSyncPush("cluster", serializeCluster(cluster));
  for (const eid of entryIds) {
    const entry = entries.find((e) => e.id === eid);
    if (entry) void queueSyncPush("entry", serializeEntry(entry));
  }
  return cluster;
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
    entry.shouldResurfaceTonight = outcome === "pushed";
    void queueSyncPush("entry", serializeEntry(entry));
  }
  save();
  notify();
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
  entry.shouldResurfaceTonight = outcome === "pushed";

  if (outcome === "pushed" && !entry.carriedForDate) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const carried: Entry = {
      ...entry,
      id: uuid(),
      createdAt: tomorrow,
      carriedFromId: entry.id,
      carriedForDate: tomorrow.toISOString().slice(0, 10),
      outcome: undefined,
      askCount: 0,
      lastAskedAt: undefined,
      lastQuestionKey: undefined,
      shouldResurfaceTonight: true,
    };
    entries.push(carried);
    void queueSyncPush("entry", serializeEntry(carried));
  }

  save();
  notify();
  void queueSyncPush("entry", serializeEntry(entry));
}

export function deleteEntry(entryId: string) {
  const before = entries.length;
  entries = entries.filter((entry) => entry.id !== entryId && entry.carriedFromId !== entryId);
  for (const cluster of clusters) {
    cluster.occurrenceCount = entries.filter((entry) => entry.clusterId === cluster.id).length;
  }
  clusters = clusters.filter((cluster) => entries.some((entry) => entry.clusterId === cluster.id));
  if (entries.length === before) return;
  save();
  notify();
  void queueSyncPush("delete_entry", { entryId, at: new Date().toISOString() });
}

export function markEntriesAsked(entryIds: string[], question: string) {
  const now = new Date().toISOString();
  const key = questionKey(question);
  let changed = false;

  for (const entryId of entryIds) {
    const entry = entries.find((e) => e.id === entryId);
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

export function ejectFromCluster(entryId: string): string {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry || !entry.clusterId) return "";
  const newCluster = createCluster(entry.content.slice(0, 50), [entryId]);
  return newCluster.id;
}

export function mergeClusters(sourceId: string, targetId: string) {
  const source = clusters.find((c) => c.id === sourceId);
  const target = clusters.find((c) => c.id === targetId);
  if (!source || !target) return;

  entries
    .filter((e) => e.clusterId === sourceId)
    .forEach((e) => (e.clusterId = targetId));

  target.occurrenceCount += source.occurrenceCount;
  target.pushedCount += source.pushedCount;
  target.doneCount += source.doneCount;
  target.droppedCount += source.droppedCount;

  clusters = clusters.filter((c) => c.id !== sourceId);
  save();
  notify();
}

export function getSurfacedItems(sourceEntries: Entry[] = getTodayEntries()): { surfaced: SurfacedItem[]; remaining: Entry[] } {
  const todayEntries = sourceEntries;
  const clusterMap = new Map(clusters.map((c) => [c.id, c]));
  const glossaryMap = new Map(glossaryEntries.map((g) => [g.id, g]));
  const allEntriesByCluster = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.clusterId) {
      const list = allEntriesByCluster.get(e.clusterId) ?? [];
      list.push(e);
      allEntriesByCluster.set(e.clusterId, list);
    }
  }

  return surfaceForNight({
    todayEntries,
    clusters: clusterMap,
    glossaryMap,
    allEntriesByCluster,
  });
}

export function getCloseSurfacedItems(): { surfaced: SurfacedItem[]; remaining: Entry[] } {
  return getSurfacedItems(getCloseEntries());
}

export function getPatterns(): PatternSummary[] {
  const clusterList = clusters;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return clusterList.map((cluster) => {
    const clusterEntries = entries.filter((e) => e.clusterId === cluster.id);
    const weekEntries = clusterEntries.filter((e) => e.createdAt >= weekAgo);
    const daysSinceLastTouched = Math.floor(
      (now.getTime() - cluster.lastSeen.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      clusterId: cluster.id,
      label: cluster.label,
      meaning: glossaryEntries.find((g) => g.clusterId === cluster.id)?.meaning,
      totalOccurrences: cluster.occurrenceCount,
      thisWeekOccurrences: weekEntries.length,
      pushedCount: cluster.pushedCount,
      doneCount: cluster.doneCount,
      droppedCount: cluster.droppedCount,
      consecutivePushes: cluster.pushedCount,
      daysSinceLastTouched,
    };
  });
}

const STORAGE_KEY = "accountability_data";
const STORAGE_VERSION = 2;

export async function setLocalEncryptionPassphrase(passphrase: string | null): Promise<void> {
  localKey = passphrase ? await deriveKey(passphrase) : null;
}

function save() {
  try {
    const data = JSON.stringify({
      entries: entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      clusters: clusters.map((c) => ({
        ...c,
        firstSeen: c.firstSeen.toISOString(),
        lastSeen: c.lastSeen.toISOString(),
      })),
      glossary: glossaryEntries.map((g) => ({
        ...g,
        learnedAt: g.learnedAt.toISOString(),
      })),
    });
    if (localKey) {
      void encryptContent(data, localKey).then((ciphertext) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, ciphertext }));
      });
    } else {
      localStorage.setItem(STORAGE_KEY, data);
    }
  } catch {}
}

export async function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const data =
      parsed?.v === STORAGE_VERSION && typeof parsed.ciphertext === "string" && localKey
        ? JSON.parse(await decryptContent(parsed.ciphertext, localKey))
        : parsed;
    entries = (data.entries ?? []).map((e: any) => ({
      ...e,
      createdAt: new Date(e.createdAt),
      kind: e.kind ?? (e.actionable ? (e.deadline ? "reminder" : "task") : "random_note"),
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
    if (localKey && parsed?.v !== STORAGE_VERSION) save();
  } catch {}
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

function serializeEntry(e: Entry) {
  return {
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    device: e.device,
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

async function classifyMissingEntries() {
  const missing = entries.filter((entry) => !entry.kind || !entry.userFacingLine).slice(0, 6);
  for (const entry of missing) {
    await classifyEntryAsync(entry);
  }
}

function serializeCluster(c: Cluster) {
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

function serializeGlossary(g: GlossaryEntry) {
  return {
    id: g.id,
    clusterId: g.clusterId,
    meaning: g.meaning,
    learnedAt: g.learnedAt.toISOString(),
  };
}

function questionKey(question: string): string {
  const normalized = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !["did", "you", "the", "this", "that", "today"].includes(word))
    .slice(0, 6)
    .join("-");
  return normalized || "follow-up";
}

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
    kind: raw.kind ?? (raw.actionable ? (raw.deadline ? "reminder" : "task") : "random_note"),
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
  if (existing) {
    Object.assign(existing, merged);
  } else {
    entries.push(merged);
  }
  save();
  notify();
}

export function applyRemoteDeleteEntry(raw: any) {
  const entryId = raw?.entryId;
  if (!entryId) return;
  entries = entries.filter((entry) => entry.id !== entryId && entry.carriedFromId !== entryId);
  clusters = clusters.filter((cluster) => entries.some((entry) => entry.clusterId === cluster.id));
  save();
  notify();
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
    if (merged.lastSeen >= existing.lastSeen) {
      Object.assign(existing, merged);
    }
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
    entry.shouldResurfaceTonight = raw.outcome === "pushed";
  }
  cluster.lastSeen = when;
  cluster.confirmed = true;
  save();
  notify();
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
  if (existing) {
    Object.assign(existing, merged);
  } else {
    glossaryEntries.push(merged);
  }
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

export function exportMarkdown(): string {
  const lines: string[] = ["# echo export", ""];
  const byDate = new Map<string, Entry[]>();
  for (const e of entries) {
    const dateKey = e.createdAt.toLocaleDateString();
    const list = byDate.get(dateKey) ?? [];
    list.push(e);
    byDate.set(dateKey, list);
  }
  for (const [date, dayEntries] of byDate) {
    lines.push(`## ${date}`, "");
    for (const e of dayEntries) {
      const time = e.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      lines.push(`- ${time}  ${e.content}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
