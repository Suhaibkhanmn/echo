import type { SurfacedItem, PatternSummary } from "@accountability/core";

const OPENING_POOL = [
  (a: number, t: number) => `${a} tasks, ${t} notes today. close?`,
  (a: number, _t: number) => `${a} things to do today. close the day?`,
  (_a: number, _t: number) => `ready to close?`,
];

const TIRED_OPENING = (a: number) =>
  a > 0 ? `${a} task${a > 1 ? "s" : ""}. one thing?` : `quiet day. rest.`;

export function pickOpening(
  totalEntries: number,
  isTired: boolean,
  actionableCount?: number,
  thoughtCount?: number
): string {
  const a = actionableCount ?? 0;
  const t = thoughtCount ?? totalEntries;

  if (isTired) return TIRED_OPENING(a);
  if (totalEntries === 0) return "quiet day. anything to add?";
  if (totalEntries === 1 && a === 0) return "one note today. close it?";
  if (totalEntries === 1 && a === 1) return "one task today. done?";

  const pick = OPENING_POOL[Math.floor(Math.random() * OPENING_POOL.length)];
  return pick(a, t);
}

export function templateClusterQuestion(
  item: SurfacedItem,
  pattern?: PatternSummary
): string {
  const label = item.cluster?.label ?? item.entries[0]?.content.slice(0, 30);
  const hasGlossary = !!item.glossary;
  const isActionable = item.entries.some(
    (e) => e.actionable || e.kind === "task" || e.kind === "reminder"
  );
  const isReference = item.entries.some((e) => e.kind === "reference");

  if (isActionable) {
    if (pattern && pattern.consecutivePushes >= 3) {
      return `'${label}' - ${pattern.consecutivePushes} pushes. do or drop?`;
    }
    if (pattern && pattern.consecutivePushes >= 2) {
      return `'${label}' - carrying it. done?`;
    }
    return `'${label}' - done?`;
  }

  if (isReference) {
    const entry = item.entries[0];
    return pickQuestion(
      entry?.lastQuestionKey,
      [
        ["revisit", `'${label}' - still want to revisit this?`],
        ["worth_keeping", `'${label}' - worth keeping?`],
        ["drop", `'${label}' - keep or let go?`],
      ],
      entry?.askCount
    );
  }

  if (hasGlossary) {
    const meaning = item.glossary!.meaning;
    return pattern && pattern.thisWeekOccurrences >= 3
      ? pickQuestion(item.entries[0]?.lastQuestionKey, [
          ["still_true", `'${meaning}' came up again. still true?`],
          ["clarity", `'${meaning}' again. anything clearer?`],
        ], item.entries[0]?.askCount)
      : `'${label}' - the ${meaning}?`;
  }

  if (item.entries.length > 1) {
    return `'${label}' came up ${item.entries.length} times. still true?`;
  }
  return templateSingleQuestion(item);
}

export function templateSingleQuestion(item: SurfacedItem): string {
  const entry = item.entries[0];
  if (!entry) return "noted.";

  const text = entry.llmSummary || entry.content;
  const short = text.length > 40 ? text.slice(0, 37) + "..." : text;

  if (entry.actionable || entry.kind === "task" || entry.kind === "reminder") {
    if (entry.carriedFromId) return `'${short}' - carried. done today?`;
    return pickQuestion(entry.lastQuestionKey, taskQuestions(short, entry.askCount), entry.askCount);
  }

  if (entry.kind === "reflection" || entry.kind === "question") {
    return pickQuestion(
      entry.lastQuestionKey,
      [
        ["still_true", `'${short}' - still true?`],
        ["clarity", `'${short}' - any clarity?`],
        ["again", `'${short}' - showed up again?`],
      ],
      entry.askCount
    );
  }

  if (entry.kind === "reference") {
    return pickQuestion(
      entry.lastQuestionKey,
      [
        ["revisit", `'${short}' - still want to revisit this?`],
        ["worth_keeping", `'${short}' - worth keeping?`],
        ["drop", `'${short}' - save or let go?`],
      ],
      entry.askCount
    );
  }

  if (entry.kind === "idea") {
    return pickQuestion(
      entry.lastQuestionKey,
      [
        ["worth_keeping", `'${short}' - worth keeping?`],
        ["revisit", `'${short}' - bring this back later?`],
      ],
      entry.askCount
    );
  }

  return `'${short}' - noted.`;
}

function taskQuestions(short: string, askCount = 0): Array<[string, string]> {
  if (askCount >= 2) {
    return [
      ["drop", `'${short}' - still real, or drop it?`],
      ["carry", `'${short}' - carry again?`],
      ["done", `'${short}' - did it move?`],
    ];
  }
  if (askCount === 1) {
    return [
      ["carry", `'${short}' - carry this forward?`],
      ["done", `'${short}' - did this happen?`],
      ["drop", `'${short}' - close or drop?`],
    ];
  }
  return [
    ["done", `'${short}' - did this happen?`],
    ["status", `'${short}' - where did this land?`],
    ["carry", `'${short}' - done, carried, or dropped?`],
  ];
}

function pickQuestion(
  lastKey: string | undefined,
  options: Array<[string, string]>,
  askCount = 0
): string {
  if (options.length === 0) return "noted.";
  const offset = askCount % options.length;
  const rotated = [...options.slice(offset), ...options.slice(0, offset)];
  return (rotated.find(([key]) => key !== lastKey) ?? rotated[0])[1];
}

export function templateFollowUp(outcome: string, label: string): string {
  switch (outcome) {
    case "did":
      return `'${label}' - done.`;
    case "pushed":
      return `'${label}' - carrying it.`;
    case "dropped":
      return `'${label}' - dropped.`;
    case "just_noted":
      return `noted.`;
    default:
      return `got it.`;
  }
}

export function templateGlossaryAsk(label: string): string {
  return `what's '${label}'?`;
}

export function templateClosing(
  patterns: PatternSummary[],
  _surfacedCount: number
): string | null {
  const notable = patterns.filter(
    (p) => p.consecutivePushes >= 2 || p.thisWeekOccurrences >= 3
  );

  if (notable.length === 0) return null;

  const p = notable[0];
  const label = p.meaning ?? p.label;
  if (p.consecutivePushes >= 2) {
    return `${p.consecutivePushes} pushes on '${label}'. watch that.`;
  }
  return `'${label}' came up ${p.thisWeekOccurrences} times this week.`;
}
