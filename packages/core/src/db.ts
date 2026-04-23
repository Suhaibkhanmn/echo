import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import * as schema from "./schema.js";
import type {
  Entry,
  Cluster,
  GlossaryEntry,
  Reflection,
  ReflectionTurn,
  EntrySource,
  Outcome,
} from "./types.js";
import { scoreSalience } from "./salience.js";

export function createDb(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  return {
    raw: db,
    sqlite,

    migrate() {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS entries (
          id TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL,
          device TEXT NOT NULL,
          text TEXT NOT NULL,
          source TEXT NOT NULL,
          voice_path TEXT,
          embedding BLOB,
          salience_score REAL NOT NULL DEFAULT 0,
          cluster_id TEXT REFERENCES clusters(id)
        );

        CREATE TABLE IF NOT EXISTS clusters (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          first_seen INTEGER NOT NULL,
          last_seen INTEGER NOT NULL,
          occurrence_count INTEGER NOT NULL DEFAULT 1,
          pushed_count INTEGER NOT NULL DEFAULT 0,
          done_count INTEGER NOT NULL DEFAULT 0,
          dropped_count INTEGER NOT NULL DEFAULT 0,
          confirmed INTEGER NOT NULL DEFAULT 0,
          anchor_vector BLOB,
          glossary_id TEXT
        );

        CREATE TABLE IF NOT EXISTS glossary (
          id TEXT PRIMARY KEY,
          cluster_id TEXT NOT NULL REFERENCES clusters(id),
          meaning TEXT NOT NULL,
          learned_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reflections (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          summary TEXT,
          llm_used INTEGER NOT NULL DEFAULT 0,
          duration_s INTEGER,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reflection_turns (
          id TEXT PRIMARY KEY,
          reflection_id TEXT NOT NULL REFERENCES reflections(id),
          turn_index INTEGER NOT NULL,
          role TEXT NOT NULL,
          text TEXT NOT NULL,
          cluster_id TEXT REFERENCES clusters(id),
          entry_ids TEXT,
          outcome TEXT,
          split_from_cluster_id TEXT,
          merged_into_cluster_id TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at);
        CREATE INDEX IF NOT EXISTS idx_entries_cluster ON entries(cluster_id);
        CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(created_at);
        CREATE INDEX IF NOT EXISTS idx_reflections_date ON reflections(date);
      `);
    },

    addEntry(
      content: string,
      source: EntrySource,
      device: string,
      embedding?: Float32Array,
      clusterOccurrenceCount: number = 0
    ): Entry {
      const now = new Date();
      const { total } = scoreSalience(content, clusterOccurrenceCount);
      const entry: Entry = {
        id: uuid(),
        createdAt: now,
        device,
        content,
        source,
        salienceScore: total,
        embedding,
      };

      sqlite
        .prepare(
          `INSERT INTO entries (id, created_at, device, text, source, embedding, salience_score, cluster_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          entry.id,
          Math.floor(now.getTime() / 1000),
          device,
          content,
          source,
          embedding ? Buffer.from(embedding.buffer) : null,
          total,
          null
        );

      return entry;
    },

    assignCluster(entryId: string, clusterId: string) {
      sqlite
        .prepare(`UPDATE entries SET cluster_id = ? WHERE id = ?`)
        .run(clusterId, entryId);
    },

    createCluster(label: string): Cluster {
      const now = new Date();
      const cluster: Cluster = {
        id: uuid(),
        label,
        firstSeen: now,
        lastSeen: now,
        occurrenceCount: 1,
        pushedCount: 0,
        doneCount: 0,
        droppedCount: 0,
        confirmed: false,
      };

      sqlite
        .prepare(
          `INSERT INTO clusters (id, label, first_seen, last_seen, occurrence_count)
         VALUES (?, ?, ?, ?, 1)`
        )
        .run(cluster.id, label, Math.floor(now.getTime() / 1000), Math.floor(now.getTime() / 1000));

      return cluster;
    },

    incrementCluster(clusterId: string) {
      const now = Math.floor(Date.now() / 1000);
      sqlite
        .prepare(
          `UPDATE clusters SET occurrence_count = occurrence_count + 1, last_seen = ? WHERE id = ?`
        )
        .run(now, clusterId);
    },

    confirmCluster(clusterId: string, anchorVector: Float32Array) {
      sqlite
        .prepare(
          `UPDATE clusters SET confirmed = 1, anchor_vector = ? WHERE id = ?`
        )
        .run(Buffer.from(anchorVector.buffer), clusterId);
    },

    updateClusterOutcome(clusterId: string, outcome: Outcome) {
      const col =
        outcome === "did"
          ? "done_count"
          : outcome === "pushed"
            ? "pushed_count"
            : outcome === "dropped"
              ? "dropped_count"
              : null;
      if (col) {
        sqlite
          .prepare(`UPDATE clusters SET ${col} = ${col} + 1 WHERE id = ?`)
          .run(clusterId);
      }
    },

    addGlossary(clusterId: string, meaning: string): GlossaryEntry {
      const entry: GlossaryEntry = {
        id: uuid(),
        clusterId,
        meaning,
        learnedAt: new Date(),
      };
      sqlite
        .prepare(
          `INSERT INTO glossary (id, cluster_id, meaning, learned_at) VALUES (?, ?, ?, ?)`
        )
        .run(entry.id, clusterId, meaning, Math.floor(entry.learnedAt.getTime() / 1000));

      sqlite
        .prepare(`UPDATE clusters SET glossary_id = ? WHERE id = ?`)
        .run(entry.id, clusterId);

      return entry;
    },

    getTodayEntries(): Entry[] {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const ts = Math.floor(startOfDay.getTime() / 1000);

      const rows = sqlite
        .prepare(`SELECT * FROM entries WHERE created_at >= ? ORDER BY created_at ASC`)
        .all(ts) as any[];

      return rows.map(rowToEntry);
    },

    getEntriesByDateRange(start: Date, end: Date): Entry[] {
      const rows = sqlite
        .prepare(
          `SELECT * FROM entries WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC`
        )
        .all(
          Math.floor(start.getTime() / 1000),
          Math.floor(end.getTime() / 1000)
        ) as any[];
      return rows.map(rowToEntry);
    },

    getAllClusters(): Cluster[] {
      const rows = sqlite
        .prepare(`SELECT * FROM clusters ORDER BY last_seen DESC`)
        .all() as any[];
      return rows.map(rowToCluster);
    },

    getCluster(id: string): Cluster | null {
      const row = sqlite
        .prepare(`SELECT * FROM clusters WHERE id = ?`)
        .get(id) as any;
      return row ? rowToCluster(row) : null;
    },

    getClusterEntries(clusterId: string): Entry[] {
      const rows = sqlite
        .prepare(
          `SELECT * FROM entries WHERE cluster_id = ? ORDER BY created_at ASC`
        )
        .all(clusterId) as any[];
      return rows.map(rowToEntry);
    },

    getGlossary(id: string): GlossaryEntry | null {
      const row = sqlite
        .prepare(`SELECT * FROM glossary WHERE id = ?`)
        .get(id) as any;
      if (!row) return null;
      return {
        id: row.id,
        clusterId: row.cluster_id,
        meaning: row.meaning,
        learnedAt: new Date(row.learned_at * 1000),
      };
    },

    getAllGlossary(): GlossaryEntry[] {
      const rows = sqlite
        .prepare(`SELECT * FROM glossary ORDER BY learned_at DESC`)
        .all() as any[];
      return rows.map((row: any) => ({
        id: row.id,
        clusterId: row.cluster_id,
        meaning: row.meaning,
        learnedAt: new Date(row.learned_at * 1000),
      }));
    },

    createReflection(date: string, llmUsed: boolean): Reflection {
      const ref: Reflection = {
        id: uuid(),
        date,
        llmUsed,
        createdAt: new Date(),
      };
      sqlite
        .prepare(
          `INSERT INTO reflections (id, date, llm_used, created_at) VALUES (?, ?, ?, ?)`
        )
        .run(ref.id, date, llmUsed ? 1 : 0, Math.floor(ref.createdAt.getTime() / 1000));
      return ref;
    },

    addReflectionTurn(
      reflectionId: string,
      turnIndex: number,
      role: "agent" | "user",
      content: string,
      options?: {
        clusterId?: string;
        entryIds?: string[];
        outcome?: Outcome;
      }
    ): ReflectionTurn {
      const turn: ReflectionTurn = {
        id: uuid(),
        reflectionId,
        turnIndex,
        role,
        content,
        clusterId: options?.clusterId,
        entryIds: options?.entryIds,
        outcome: options?.outcome,
      };
      sqlite
        .prepare(
          `INSERT INTO reflection_turns (id, reflection_id, turn_index, role, text, cluster_id, entry_ids, outcome)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          turn.id,
          reflectionId,
          turnIndex,
          role,
          content,
          options?.clusterId ?? null,
          options?.entryIds ? JSON.stringify(options.entryIds) : null,
          options?.outcome ?? null
        );
      return turn;
    },

    finishReflection(id: string, summary: string, durationS: number) {
      sqlite
        .prepare(
          `UPDATE reflections SET summary = ?, duration_s = ? WHERE id = ?`
        )
        .run(summary, durationS, id);
    },

    getSetting(key: string): string | null {
      const row = sqlite
        .prepare(`SELECT value FROM settings WHERE key = ?`)
        .get(key) as any;
      return row?.value ?? null;
    },

    setSetting(key: string, value: string) {
      sqlite
        .prepare(
          `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`
        )
        .run(key, value);
    },

    getEntryCount(): number {
      const row = sqlite
        .prepare(`SELECT COUNT(*) as count FROM entries`)
        .get() as any;
      return row.count;
    },

    getTodayEntryCount(): number {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const row = sqlite
        .prepare(
          `SELECT COUNT(*) as count FROM entries WHERE created_at >= ?`
        )
        .get(Math.floor(startOfDay.getTime() / 1000)) as any;
      return row.count;
    },

    searchEntries(query: string): Entry[] {
      const rows = sqlite
        .prepare(
          `SELECT * FROM entries WHERE text LIKE ? ORDER BY created_at DESC LIMIT 100`
        )
        .all(`%${query}%`) as any[];
      return rows.map(rowToEntry);
    },

    ejectFromCluster(entryId: string): string {
      const entry = sqlite
        .prepare(`SELECT * FROM entries WHERE id = ?`)
        .get(entryId) as any;
      if (!entry) throw new Error("Entry not found");

      const newCluster = this.createCluster(entry.text.slice(0, 50));
      sqlite
        .prepare(`UPDATE entries SET cluster_id = ? WHERE id = ?`)
        .run(newCluster.id, entryId);
      return newCluster.id;
    },

    mergeClusters(sourceId: string, targetId: string) {
      sqlite
        .prepare(`UPDATE entries SET cluster_id = ? WHERE cluster_id = ?`)
        .run(targetId, sourceId);
      const source = sqlite
        .prepare(`SELECT * FROM clusters WHERE id = ?`)
        .get(sourceId) as any;
      if (source) {
        sqlite
          .prepare(
            `UPDATE clusters SET occurrence_count = occurrence_count + ?, pushed_count = pushed_count + ?, done_count = done_count + ? WHERE id = ?`
          )
          .run(source.occurrence_count, source.pushed_count, source.done_count, targetId);
        sqlite.prepare(`DELETE FROM clusters WHERE id = ?`).run(sourceId);
      }
    },

    close() {
      sqlite.close();
    },
  };
}

function rowToEntry(row: any): Entry {
  return {
    id: row.id,
    createdAt: new Date(row.created_at * 1000),
    device: row.device,
    content: row.text,
    source: row.source,
    voicePath: row.voice_path,
    embedding: row.embedding
      ? new Float32Array(new Uint8Array(row.embedding).buffer)
      : undefined,
    salienceScore: row.salience_score,
    clusterId: row.cluster_id,
  };
}

function rowToCluster(row: any): Cluster {
  return {
    id: row.id,
    label: row.label,
    firstSeen: new Date(row.first_seen * 1000),
    lastSeen: new Date(row.last_seen * 1000),
    occurrenceCount: row.occurrence_count,
    pushedCount: row.pushed_count,
    doneCount: row.done_count,
    droppedCount: row.dropped_count,
    confirmed: !!row.confirmed,
    anchorVector: row.anchor_vector
      ? new Float32Array(new Uint8Array(row.anchor_vector).buffer)
      : undefined,
    glossaryId: row.glossary_id,
  };
}

export type AccountabilityDb = ReturnType<typeof createDb>;
