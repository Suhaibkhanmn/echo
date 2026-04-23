import type { Entry, Cluster } from "./types.js";

const NEW_TO_NEW_THRESHOLD = 0.7;
const NEW_TO_EXISTING_THRESHOLD = 0.82;
const CONFIRMED_ANCHOR_THRESHOLD = 0.88;

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export function meanVector(vectors: Float32Array[]): Float32Array {
  if (vectors.length === 0) throw new Error("Cannot compute mean of 0 vectors");
  const dim = vectors[0].length;
  const result = new Float32Array(dim);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) result[i] += v[i];
  }
  for (let i = 0; i < dim; i++) result[i] /= vectors.length;
  return result;
}

export interface ClusterMatch {
  clusterId: string;
  similarity: number;
  isSuggestion: boolean;
}

export function findBestCluster(
  embedding: Float32Array,
  existingClusters: Array<{
    cluster: Cluster;
    memberEmbeddings: Float32Array[];
  }>
): ClusterMatch | null {
  let bestMatch: ClusterMatch | null = null;
  let bestSim = 0;

  for (const { cluster, memberEmbeddings } of existingClusters) {
    if (memberEmbeddings.length === 0) continue;

    const compareVector = cluster.anchorVector ?? meanVector(memberEmbeddings);
    const sim = cosineSimilarity(embedding, compareVector);

    const threshold = cluster.confirmed
      ? CONFIRMED_ANCHOR_THRESHOLD
      : NEW_TO_EXISTING_THRESHOLD;

    if (sim > bestSim) {
      bestSim = sim;
      const isSuggestion = cluster.confirmed && sim < CONFIRMED_ANCHOR_THRESHOLD && sim >= NEW_TO_NEW_THRESHOLD;

      if (sim >= threshold || isSuggestion) {
        bestMatch = {
          clusterId: cluster.id,
          similarity: sim,
          isSuggestion: sim < threshold,
        };
      }
    }
  }

  return bestMatch;
}

export function shouldMergeNewFragments(
  embeddingA: Float32Array,
  embeddingB: Float32Array
): boolean {
  return cosineSimilarity(embeddingA, embeddingB) >= NEW_TO_NEW_THRESHOLD;
}

export function computeAnchorVector(
  memberEmbeddings: Float32Array[]
): Float32Array {
  return meanVector(memberEmbeddings);
}

export { NEW_TO_NEW_THRESHOLD, NEW_TO_EXISTING_THRESHOLD, CONFIRMED_ANCHOR_THRESHOLD };
