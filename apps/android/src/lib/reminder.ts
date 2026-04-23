/**
 * Mobile nightly reminder — schedules a daily local notification at the user's chosen time.
 */
import * as Notifications from "expo-notifications";
import { kvGet, kvSet } from "./kv";
import { getOpenCloseWindowEntries, getMorningCarryover, getPatterns } from "./store";
import { formatCloseTime, parseCloseTime } from "./closeWindow";

const KV_TIME = "night_time"; // "HH:MM"
const KV_ID = "reminder_id";
const KV_MORNING_ID = "morning_reminder_id";
const DEFAULT_TIME = "22:00";
const CLOSE_TITLE = "close the day";
const MORNING_TITLE = "carried into today";
let nightScheduleQueue = Promise.resolve();
let morningScheduleQueue = Promise.resolve();

export function getNightTime(): string {
  return kvGet(KV_TIME) ?? DEFAULT_TIME;
}

export async function requestNotifPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

function parseTime(s: string | null | undefined): { h: number; m: number } {
  return parseCloseTime(s);
}

export function scheduleNightReminder(hhmm: string): Promise<void> {
  nightScheduleQueue = nightScheduleQueue
    .catch(() => {})
    .then(() => scheduleNightReminderOnce(hhmm));
  return nightScheduleQueue;
}

async function scheduleNightReminderOnce(hhmm: string): Promise<void> {
  const { h, m } = parseTime(hhmm);
  kvSet(KV_TIME, formatCloseTime(h, m));

  // Echo only owns the Close reminder and morning carryover notifications.
  // Clearing all first avoids duplicate native alarms left by old builds or races.
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}

  // schedule new daily
  try {
    const smart = buildSmartCloseNotification();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: CLOSE_TITLE,
        body: smart.body,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: h,
        minute: m,
      } as any,
    });
    kvSet(KV_ID, id);
    await scheduleMorningCarryoverOnce();
  } catch (err) {
    console.warn("failed to schedule reminder", err);
  }
}

export async function refreshNightReminder(): Promise<void> {
  if (!kvGet(KV_ID)) return;
  await scheduleNightReminder(getNightTime());
}

export function scheduleMorningCarryover(): Promise<void> {
  morningScheduleQueue = morningScheduleQueue
    .catch(() => {})
    .then(() => scheduleMorningCarryoverOnce());
  return morningScheduleQueue;
}

async function scheduleMorningCarryoverOnce(): Promise<void> {
  const prev = kvGet(KV_MORNING_ID);
  if (prev) {
    try {
      await Notifications.cancelScheduledNotificationAsync(prev);
    } catch {}
  }
  await cancelScheduledByTitle(MORNING_TITLE);

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: MORNING_TITLE,
        body: "Open Today when you're ready.",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 0,
      } as any,
    });
    kvSet(KV_MORNING_ID, id);
  } catch (err) {
    console.warn("failed to schedule morning reminder", err);
  }
}

async function cancelScheduledByTitle(title: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((notification) => notification.content.title === title)
        .map((notification) =>
          Notifications.cancelScheduledNotificationAsync(notification.identifier)
        )
    );
  } catch {}
}

export function buildSmartCloseNotification(): { title: string; body: string } {
  const today = getOpenCloseWindowEntries();
  const carried = getMorningCarryover();
  const tasks = today.filter((e) => e.actionable || e.kind === "task" || e.kind === "reminder");
  const references = today.filter((e) => e.kind === "reference");
  const reflections = today.filter((e) => e.kind === "reflection" || e.kind === "question");
  const patterns = getPatterns().filter((p) => p.consecutivePushes >= 2 || p.thisWeekOccurrences >= 3);

  if (tasks.length > 0) {
    const top = tasks.find((e) => !e.outcome) ?? tasks[0];
    return {
      title: CLOSE_TITLE,
      body: top.llmSummary
        ? `One task to close: ${top.llmSummary}.`
        : `One task to close: ${top.content.slice(0, 72)}.`,
    };
  }

  if (references.length > 0) {
    const top = references[0];
    return {
      title: CLOSE_TITLE,
      body: top.llmSummary
        ? `Still want to revisit ${top.llmSummary}?`
        : `Still want to revisit ${top.content.slice(0, 72)}?`,
    };
  }

  if (patterns.length > 0) {
    const p = patterns[0];
    return {
      title: CLOSE_TITLE,
      body: `${p.meaning ?? p.label} came up again. Still true?`,
    };
  }

  if (reflections.length > 0) {
    const top = reflections[0];
    return {
      title: CLOSE_TITLE,
      body: top.llmSummary ? `${top.llmSummary}. Still true?` : "One thing to check back on.",
    };
  }

  if (carried.length > 0) {
    return {
      title: CLOSE_TITLE,
      body: `${carried.length} carried item${carried.length === 1 ? "" : "s"} waiting.`,
    };
  }

  return {
    title: CLOSE_TITLE,
    body: today.length > 0 ? "A few notes from today are ready." : "Nothing heavy today.",
  };
}

export async function cancelNightReminder(): Promise<void> {
  const prev = kvGet(KV_ID);
  if (prev) {
    try {
      await Notifications.cancelScheduledNotificationAsync(prev);
    } catch {}
  }
  kvSet(KV_ID, "");
}

export function configureNotifHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
