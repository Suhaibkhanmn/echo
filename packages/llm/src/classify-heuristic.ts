/**
 * Deterministic heuristic classifier — works offline, no API key needed.
 * Uses salience scorer signals to decide: actionable vs thought.
 */
import type { IntentClassification } from "./classify";

const ACTION_PHRASES = [
  "need to", "have to", "should", "must", "gotta",
  "gonna", "going to", "want to", "wanna", "got to",
];

const ACTION_VERBS = [
  "call", "email", "send", "finish", "ship", "pay", "book",
  "complete", "place", "placed",
  "cancel", "quit", "leave", "tell", "fix", "submit", "reply",
  "text", "buy", "return", "apply", "register", "sign up",
  "schedule", "start", "stop", "do", "make", "search", "find",
  "research", "compare", "brainstorm", "look up",
];

const TIME_ANCHORS = [
  "today", "tomorrow", "tonight", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday", "sunday", "by", "before",
  "deadline", "due", "morning", "evening", "afternoon", "weekend", "eod",
];

const PERSON_PATTERN = /\b(?:with|told|asked|met|called|texted|from|for)\s+([A-Z][a-z]+|\b[A-Z]\b)/g;
const REFLECTION_PATTERNS = [
  "i keep", "i always", "i never", "why do i", "why am i",
  "again", "same thing", "avoid", "avoiding",
];
const VENT_PATTERNS = ["ugh", "hate", "annoying", "draining", "tired of", "sick of"];
const IDEA_PATTERNS = ["idea", "maybe build", "could make", "would be cool", "saw a", "inspo"];
const KNOWN_MEDIA_TITLES = new Set([
  "thinking fast and slow",
  "hooked",
  "atomic habits",
  "deep work",
  "the lean startup",
  "zero to one",
  "the mom test",
]);

export function classifyHeuristic(text: string): IntentClassification {
  const lower = text.toLowerCase();

  const hasActionPhrase = ACTION_PHRASES.some((p) => lower.includes(p));
  const hasActionVerb = ACTION_VERBS.some((v) =>
    new RegExp(`\\b${v}\\b`, "i").test(lower)
  );
  const isQuestion = text.trim().endsWith("?") || lower.startsWith("should i");
  const isReflection = REFLECTION_PATTERNS.some((p) => lower.includes(p));
  const isVent = VENT_PATTERNS.some((p) => lower.includes(p));
  const reference = detectReference(text);
  const referenceType = reference.type;
  const isReference = reference.isReference;
  const isIdea = IDEA_PATTERNS.some((p) => lower.includes(p));
  const actionable = (hasActionPhrase || hasActionVerb) && !isQuestion && !isReflection && !isVent;
  const kind: IntentClassification["kind"] = actionable
    ? (deadlineFromText(lower) ? "reminder" : "task")
    : isQuestion
      ? "question"
      : isReflection
        ? "reflection"
        : isVent
          ? "vent"
          : isReference
            ? "reference"
            : isIdea
            ? "idea"
            : "random_note";

  // Extract deadline
  const deadline = deadlineFromText(lower);

  // Extract people
  const people: string[] = [];
  let match;
  const regex = new RegExp(PERSON_PATTERN.source, "g");
  while ((match = regex.exec(text)) !== null) {
    if (match[1] && !people.includes(match[1])) people.push(match[1]);
  }

  // Extract topic: first notable noun
  const SKIP = ["The", "This", "That", "What", "Why", "How", "When", "Where", "But", "And", "For", "Just", "Not"];
  let topic = "";
  for (const word of text.split(/\s+/)) {
    const clean = word.replace(/[^a-zA-Z]/g, "");
    if (clean.length > 2 && !SKIP.includes(clean) && !people.includes(clean)) {
      topic = clean.toLowerCase();
      break;
    }
  }

  // Summary: first 5 meaningful words
  const summary = text
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 5)
    .join(" ")
    .toLowerCase();

  const commitmentLevel: IntentClassification["commitmentLevel"] = actionable
    ? hasActionPhrase || deadline
      ? "clear"
      : "soft"
    : isQuestion
      ? "maybe"
      : "none";

  const shouldResurfaceTonight =
    actionable || isReflection || isQuestion || isReference || (!isVent && !!deadline) || lower.includes("again");

  return {
    actionable,
    kind,
    commitmentLevel,
    referenceType,
    confidence: confidenceForKind(kind, text),
    shouldResurfaceTonight,
    userFacingLine: lineForKind(kind),
    summary,
    deadline,
    people: people.slice(0, 3),
    topic,
  };
}

function deadlineFromText(lower: string): string | null {
  for (const anchor of TIME_ANCHORS) {
    if (new RegExp(`\\b${anchor}\\b`, "i").test(lower) && !["by", "before"].includes(anchor)) {
      return anchor;
    }
  }
  const time = lower.match(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i);
  return time?.[0] ?? null;
}

function lineForKind(kind: IntentClassification["kind"]): string {
  switch (kind) {
    case "task":
    case "reminder":
      return "saved as a task for Close.";
    case "reflection":
      return "saved as something to check back on.";
    case "question":
      return "saved as a question, not a todo.";
    case "reference":
      return "saved as something to revisit.";
    case "idea":
      return "saved as an idea.";
    case "vent":
      return "saved. I won't turn this into a task.";
    default:
      return "saved as a note.";
  }
}

function detectReference(text: string): {
  isReference: boolean;
  type: IntentClassification["referenceType"];
} {
  const clean = text
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
  const lower = clean.toLowerCase();
  if (/^https?:\/\//i.test(text.trim())) return { isReference: true, type: "link" };
  if (KNOWN_MEDIA_TITLES.has(lower)) return { isReference: true, type: "book" };
  if (/\b(book|article|paper|video|movie|series|podcast)\b/i.test(lower)) {
    if (lower.includes("book")) return { isReference: true, type: "book" };
    if (lower.includes("article") || lower.includes("paper")) return { isReference: true, type: "article" };
    if (lower.includes("video")) return { isReference: true, type: "video" };
    return { isReference: true, type: "unknown" };
  }
  const words = clean.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 7) {
    return { isReference: false, type: "unknown" };
  }
  const hasVerb = ACTION_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`, "i").test(lower));
  const hasActionPhrase = ACTION_PHRASES.some((phrase) => lower.includes(phrase));
  if (hasVerb || hasActionPhrase || text.endsWith("?")) {
    return { isReference: false, type: "unknown" };
  }
  const capitalized = words.filter((word) => /^[A-Z0-9]/.test(word)).length;
  return {
    isReference: capitalized >= Math.max(1, Math.ceil(words.length * 0.6)),
    type: "unknown",
  };
}

function confidenceForKind(kind: IntentClassification["kind"], text: string): number {
  if (kind === "task" || kind === "reminder") return 0.8;
  if (kind === "reference") {
    const lower = text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
    return KNOWN_MEDIA_TITLES.has(lower) || /^https?:\/\//i.test(text.trim()) ? 0.9 : 0.65;
  }
  if (kind === "random_note") return 0.45;
  return 0.65;
}
