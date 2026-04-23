/**
 * Tiny KV store on top of expo-sqlite. Used for durable local state.
 * Synchronous API; safe to call from reducers / init code.
 */
import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("accountability.db");
    db.execSync(
      `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);`
    );
  }
  return db;
}

export function kvGet(key: string): string | null {
  try {
    const row = getDb().getFirstSync<{ v: string }>(
      "SELECT v FROM kv WHERE k = ?",
      [key]
    );
    return row?.v ?? null;
  } catch {
    return null;
  }
}

export function kvSet(key: string, value: string): void {
  try {
    getDb().runSync(
      "INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)",
      [key, value]
    );
  } catch {}
}

export function kvDelete(key: string): void {
  try {
    getDb().runSync("DELETE FROM kv WHERE k = ?", [key]);
  } catch {}
}
