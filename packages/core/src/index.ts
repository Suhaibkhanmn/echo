export * from "./types.js";
export * from "./schema.js";
export type { AccountabilityDb } from "./db.js";
export {
  scoreSalience,
  decaySalience,
  SURFACE_THRESHOLD,
  type SalienceBreakdown,
} from "./salience.js";
export {
  cosineSimilarity,
  meanVector,
  findBestCluster,
  shouldMergeNewFragments,
  computeAnchorVector,
  type ClusterMatch,
} from "./clustering.js";
export { surfaceForNight } from "./surface.js";
export { computePatterns, getWeeklyMirror } from "./patterns.js";
export { deriveKey, encrypt, decrypt, generatePairId, generatePassphrase } from "./crypto.js";
export {
  createSyncEvent,
  decryptSyncEvent,
  pushEvent,
  pullEvents,
  encryptContent,
  decryptContent,
  type SyncConfig,
  type SyncEvent,
} from "./sync.js";
