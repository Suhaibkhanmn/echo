const TIME_ANCHORS = [
  "today",
  "tomorrow",
  "tonight",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "by",
  "before",
  "deadline",
  "due",
  "morning",
  "evening",
  "afternoon",
];

const TIME_PATTERN = /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i;
const DATE_PATTERN = /\b\d{1,2}[\/\-]\d{1,2}\b/;

const ACTION_PHRASES = [
  "need to",
  "have to",
  "should",
  "must",
  "gotta",
  "gonna",
  "going to",
  "want to",
  "wanna",
  "got to",
];

const ACTION_VERBS = [
  "call",
  "email",
  "send",
  "finish",
  "ship",
  "pay",
  "book",
  "cancel",
  "quit",
  "leave",
  "tell",
  "fix",
  "submit",
  "reply",
  "text",
  "buy",
  "return",
  "apply",
  "register",
  "sign up",
  "schedule",
  "start",
  "stop",
  "do",
  "make",
];

const SELF_REFERENCE = [
  "i always",
  "i never",
  "why do i",
  "why am i",
  "should i",
  "what if i",
  "i keep",
  "i can't",
  "i cant",
  "i won't",
  "i wont",
  "every time i",
  "same thing",
  "again",
];

const SCORE_WEIGHTS = {
  timeAnchor: 2,
  actionPhrase: 1,
  actionVerb: 1,
  selfReference: 2,
  emphasis: 1,
  recurrenceMultiplier: 0.5,
  recurrenceCap: 5,
  decayPerDay: 1,
  decayGracePeriodHours: 48,
};

export interface SalienceBreakdown {
  total: number;
  timeAnchors: string[];
  actionPhrases: string[];
  actionVerbs: string[];
  selfReferences: string[];
  emphasisSignals: string[];
  recurrenceBoost: number;
}

export function scoreSalience(
  text: string,
  clusterOccurrenceCount: number = 0
): SalienceBreakdown {
  const lower = text.toLowerCase();
  const breakdown: SalienceBreakdown = {
    total: 0,
    timeAnchors: [],
    actionPhrases: [],
    actionVerbs: [],
    selfReferences: [],
    emphasisSignals: [],
    recurrenceBoost: 0,
  };

  for (const anchor of TIME_ANCHORS) {
    const regex = new RegExp(`\\b${anchor}\\b`, "i");
    if (regex.test(lower)) {
      breakdown.timeAnchors.push(anchor);
      breakdown.total += SCORE_WEIGHTS.timeAnchor;
    }
  }

  if (TIME_PATTERN.test(text)) {
    breakdown.timeAnchors.push("time_format");
    breakdown.total += SCORE_WEIGHTS.timeAnchor;
  }

  if (DATE_PATTERN.test(text)) {
    breakdown.timeAnchors.push("date_format");
    breakdown.total += SCORE_WEIGHTS.timeAnchor;
  }

  for (const phrase of ACTION_PHRASES) {
    if (lower.includes(phrase)) {
      breakdown.actionPhrases.push(phrase);
      breakdown.total += SCORE_WEIGHTS.actionPhrase;
    }
  }

  for (const verb of ACTION_VERBS) {
    const regex = new RegExp(`\\b${verb}\\b`, "i");
    if (regex.test(lower)) {
      breakdown.actionVerbs.push(verb);
      breakdown.total += SCORE_WEIGHTS.actionVerb;
    }
  }

  for (const pattern of SELF_REFERENCE) {
    if (lower.includes(pattern)) {
      breakdown.selfReferences.push(pattern);
      breakdown.total += SCORE_WEIGHTS.selfReference;
    }
  }

  if (text.endsWith("?")) {
    breakdown.emphasisSignals.push("trailing_question");
    breakdown.total += SCORE_WEIGHTS.emphasis;
  }

  if (text.endsWith("!")) {
    breakdown.emphasisSignals.push("trailing_exclamation");
    breakdown.total += SCORE_WEIGHTS.emphasis;
  }

  const capsWords = text.split(/\s+/).filter((w) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (capsWords.length > 0) {
    breakdown.emphasisSignals.push(`caps:${capsWords.join(",")}`);
    breakdown.total += SCORE_WEIGHTS.emphasis * Math.min(capsWords.length, 3);
  }

  if (text.includes("*")) {
    breakdown.emphasisSignals.push("asterisk");
    breakdown.total += SCORE_WEIGHTS.emphasis;
  }

  if (clusterOccurrenceCount > 0) {
    breakdown.recurrenceBoost = Math.min(
      clusterOccurrenceCount * SCORE_WEIGHTS.recurrenceMultiplier,
      SCORE_WEIGHTS.recurrenceCap
    );
    breakdown.total += breakdown.recurrenceBoost;
  }

  return breakdown;
}

export function decaySalience(
  score: number,
  entryDate: Date,
  now: Date = new Date()
): number {
  const hoursSince =
    (now.getTime() - entryDate.getTime()) / (1000 * 60 * 60);
  if (hoursSince <= SCORE_WEIGHTS.decayGracePeriodHours) return score;
  const daysOverGrace =
    (hoursSince - SCORE_WEIGHTS.decayGracePeriodHours) / 24;
  return Math.max(0, score - daysOverGrace * SCORE_WEIGHTS.decayPerDay);
}

export const SURFACE_THRESHOLD = 3;
