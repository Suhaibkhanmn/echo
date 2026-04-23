import type { Entry, Cluster, GlossaryEntry, SurfacedItem } from "./types.js";
import { SURFACE_THRESHOLD } from "./salience.js";

interface SurfaceInput {
  todayEntries: Entry[];
  clusters: Map<string, Cluster>;
  glossaryMap: Map<string, GlossaryEntry>;
  allEntriesByCluster: Map<string, Entry[]>;
}

export function surfaceForNight(input: SurfaceInput): {
  surfaced: SurfacedItem[];
  remaining: Entry[];
} {
  const { todayEntries, clusters, glossaryMap, allEntriesByCluster } = input;
  const surfaced: SurfacedItem[] = [];
  const surfacedEntryIds = new Set<string>();

  const todayByCluster = new Map<string, Entry[]>();
  const unclustered: Entry[] = [];

  for (const entry of todayEntries) {
    if (entry.clusterId) {
      const list = todayByCluster.get(entry.clusterId) ?? [];
      list.push(entry);
      todayByCluster.set(entry.clusterId, list);
    } else {
      unclustered.push(entry);
    }
  }

  for (const [clusterId, clusterEntries] of todayByCluster) {
    const cluster = clusters.get(clusterId);
    if (!cluster) continue;

    const shouldSurface =
      clusterEntries.length >= 2 ||
      (cluster.confirmed && clusterEntries.length >= 1);

    if (shouldSurface) {
      surfaced.push({
        type: "cluster",
        clusterId,
        cluster,
        entries: clusterEntries,
        glossary: cluster.glossaryId
          ? glossaryMap.get(cluster.glossaryId)
          : undefined,
        topSalience: Math.max(...clusterEntries.map((e) => e.salienceScore)),
      });
      clusterEntries.forEach((e) => surfacedEntryIds.add(e.id));
    }
  }

  for (const entry of unclustered) {
    if (entry.salienceScore >= SURFACE_THRESHOLD) {
      surfaced.push({
        type: "single",
        entries: [entry],
        topSalience: entry.salienceScore,
      });
      surfacedEntryIds.add(entry.id);
    }
  }

  for (const [clusterId, clusterEntries] of todayByCluster) {
    if (surfacedEntryIds.has(clusterEntries[0]?.id)) continue;
    const cluster = clusters.get(clusterId);
    if (!cluster) continue;

    const topSalience = Math.max(
      ...clusterEntries.map((e) => e.salienceScore)
    );
    if (topSalience >= SURFACE_THRESHOLD) {
      surfaced.push({
        type: "cluster",
        clusterId,
        cluster,
        entries: clusterEntries,
        glossary: cluster.glossaryId
          ? glossaryMap.get(cluster.glossaryId)
          : undefined,
        topSalience,
      });
      clusterEntries.forEach((e) => surfacedEntryIds.add(e.id));
    }
  }

  surfaced.sort((a, b) => b.topSalience - a.topSalience);

  const remaining = todayEntries.filter((e) => !surfacedEntryIds.has(e.id));

  return { surfaced, remaining };
}
