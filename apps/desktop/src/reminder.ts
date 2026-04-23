/**
 * Nightly walk-through reminder.
 * Every minute checks whether the configured time has passed today.
 * Fires a native OS notification (once per day) and signals the app
 * to switch to the walk-through tab when the user clicks the notification.
 */

const LS_NIGHT_TIME = "night_time";
const LS_LAST_FIRED = "night_last_fired_yyyymmdd";

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function parseNightTime(raw: string | null): { h: number; m: number } {
  const fallback = { h: 22, m: 0 };
  if (!raw) return fallback;
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  if (h < 0 || h > 23 || m < 0 || m > 59) return fallback;
  return { h, m };
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function onReminderFired(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function fireNotification() {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    if (granted) {
      sendNotification({
        title: "tonight's walk-through",
        body: "ready when you are.",
      });
    }
  } catch (err) {
    console.warn("notification unavailable:", err);
  }
}

async function check() {
  const raw = localStorage.getItem(LS_NIGHT_TIME);
  const { h, m } = parseNightTime(raw);
  const now = new Date();
  const lastFired = localStorage.getItem(LS_LAST_FIRED);
  const today = todayKey(now);
  if (lastFired === today) return;

  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (now < target) return;

  localStorage.setItem(LS_LAST_FIRED, today);
  await fireNotification();
  for (const fn of listeners) fn();
}

export function startReminderLoop(): () => void {
  void check();
  const handle = setInterval(() => {
    void check();
  }, 60_000);
  return () => clearInterval(handle);
}
