import type { SurfacedItem } from "./store";

const OPENING_POOL = [
  (n: number) => `${n} entries today.`,
  (n: number) => `${n} notes today. walk through?`,
  (n: number) => `walk through today? ${n} entries.`,
  () => `ready?`,
];

export function pickOpening(totalEntries: number, isTired: boolean): string {
  if (isTired) return `${totalEntries} entries. just the one that matters.`;
  if (totalEntries === 0) return "quiet day. anything to add?";
  if (totalEntries === 1) return "one note today. want to add anything?";
  const pick = OPENING_POOL[Math.floor(Math.random() * OPENING_POOL.length)];
  return pick(totalEntries);
}

export function templateQuestion(item: SurfacedItem): string {
  const label = item.cluster?.label ?? item.entries[0]?.content.slice(0, 30);
  const count = item.entries.length;
  const hasGlossary = !!item.glossary;

  if (item.type === "single") {
    const text = item.entries[0]?.content ?? "";
    const short = text.length > 40 ? text.slice(0, 37) + "..." : text;
    return `'${short}' — say more, or just noted?`;
  }

  if (hasGlossary) {
    const meaning = item.glossary!.meaning;
    if (count > 1) return `'${label}' came up ${count} times. the ${meaning}?`;
    return `'${label}' — the ${meaning}?`;
  }

  if (count > 1) return `'${label}' came up ${count} times. what's '${label}'?`;
  return `'${label}' — what's this?`;
}

export function templateGlossaryAsk(label: string): string {
  return `what's '${label}'?`;
}
