import { kvGet } from "./kv";

const KV_TIME = "night_time";
const DEFAULT_TIME = "22:00";

export function getConfiguredCloseTime(): string {
  return kvGet(KV_TIME) ?? DEFAULT_TIME;
}

export function parseCloseTime(hhmm: string | null | undefined): { h: number; m: number } {
  const raw = (hhmm ?? DEFAULT_TIME).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { h: 22, m: 0 };
  const h = Math.max(0, Math.min(23, Number.parseInt(match[1], 10)));
  const m = Math.max(0, Math.min(59, Number.parseInt(match[2], 10)));
  return { h, m };
}

export function formatCloseTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function getCloseWindowBounds(
  now = new Date(),
  hhmm = getConfiguredCloseTime()
): { start: Date; end: Date } {
  const { h, m } = parseCloseTime(hhmm);
  const cutoff = new Date(now);
  cutoff.setHours(h, m, 0, 0);

  const start = new Date(cutoff);
  start.setDate(start.getDate() - 1);
  const end = now.getTime() > cutoff.getTime() ? cutoff : now;
  return { start, end };
}
