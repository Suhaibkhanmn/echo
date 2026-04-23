import type { AccountabilityDb } from "./db.js";
import type { PatternSummary } from "./types.js";

export function computePatterns(db: AccountabilityDb): PatternSummary[] {
  const clusters = db.getAllClusters();
  const glossaryEntries = db.getAllGlossary();
  const glossaryMap = new Map(glossaryEntries.map((g) => [g.clusterId, g]));

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return clusters.map((cluster) => {
    const weekEntries = db
      .getClusterEntries(cluster.id)
      .filter((e) => e.createdAt >= weekAgo);

    const daysSinceLastTouched = Math.floor(
      (now.getTime() - cluster.lastSeen.getTime()) / (1000 * 60 * 60 * 24)
    );

    const consecutivePushes = computeConsecutivePushes(db, cluster.id);

    return {
      clusterId: cluster.id,
      label: cluster.label,
      meaning: glossaryMap.get(cluster.id)?.meaning,
      totalOccurrences: cluster.occurrenceCount,
      thisWeekOccurrences: weekEntries.length,
      pushedCount: cluster.pushedCount,
      doneCount: cluster.doneCount,
      droppedCount: cluster.droppedCount,
      consecutivePushes,
      daysSinceLastTouched,
    };
  });
}

function computeConsecutivePushes(
  db: AccountabilityDb,
  clusterId: string
): number {
  const turns = db.raw
    .select()
    .from(
      // @ts-expect-error raw query for efficiency
      { reflection_turns: db.raw._.schema.reflectionTurns }
    )
    .all();

  // Simplified: count from most recent reflections backward
  // until we find a non-push outcome for this cluster
  // For now, return pushedCount as a conservative approximation
  const cluster = db.getCluster(clusterId);
  return cluster?.pushedCount ?? 0;
}

export function getWeeklyMirror(patterns: PatternSummary[]): string | null {
  const notable = patterns.filter(
    (p) => p.consecutivePushes >= 3 || p.thisWeekOccurrences >= 5
  );

  if (notable.length === 0) return null;

  const lines: string[] = [];
  for (const p of notable.slice(0, 3)) {
    const label = p.meaning ?? p.label;
    if (p.consecutivePushes >= 3) {
      lines.push(
        `'${label}' — pushed ${p.consecutivePushes} times in a row.`
      );
    } else if (p.thisWeekOccurrences >= 5) {
      lines.push(
        `'${label}' — came up ${p.thisWeekOccurrences} times this week.`
      );
    }
  }

  return lines.join(" ");
}
