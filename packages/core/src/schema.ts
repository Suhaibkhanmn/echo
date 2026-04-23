import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  device: text("device").notNull(),
  content: text("text").notNull(),
  source: text("source", {
    enum: ["text", "voice", "share", "notif_reply"],
  }).notNull(),
  voicePath: text("voice_path"),
  embedding: blob("embedding", { mode: "buffer" }),
  salienceScore: real("salience_score").notNull().default(0),
  clusterId: text("cluster_id").references(() => clusters.id),
});

export const clusters = sqliteTable("clusters", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  firstSeen: integer("first_seen", { mode: "timestamp" }).notNull(),
  lastSeen: integer("last_seen", { mode: "timestamp" }).notNull(),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  pushedCount: integer("pushed_count").notNull().default(0),
  doneCount: integer("done_count").notNull().default(0),
  droppedCount: integer("dropped_count").notNull().default(0),
  confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
  anchorVector: blob("anchor_vector", { mode: "buffer" }),
  glossaryId: text("glossary_id"),
});

export const glossary = sqliteTable("glossary", {
  id: text("id").primaryKey(),
  clusterId: text("cluster_id")
    .notNull()
    .references(() => clusters.id),
  meaning: text("meaning").notNull(),
  learnedAt: integer("learned_at", { mode: "timestamp" }).notNull(),
});

export const reflections = sqliteTable("reflections", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  summary: text("summary"),
  llmUsed: integer("llm_used", { mode: "boolean" }).notNull().default(false),
  durationS: integer("duration_s"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const reflectionTurns = sqliteTable("reflection_turns", {
  id: text("id").primaryKey(),
  reflectionId: text("reflection_id")
    .notNull()
    .references(() => reflections.id),
  turnIndex: integer("turn_index").notNull(),
  role: text("role", { enum: ["agent", "user"] }).notNull(),
  content: text("text").notNull(),
  clusterId: text("cluster_id").references(() => clusters.id),
  entryIds: text("entry_ids"),
  outcome: text("outcome", {
    enum: ["did", "pushed", "dropped", "just_noted", "linked"],
  }),
  splitFromClusterId: text("split_from_cluster_id"),
  mergedIntoClusterId: text("merged_into_cluster_id"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
