export type EntrySource = "text" | "voice" | "share" | "notif_reply";

export type Outcome = "did" | "pushed" | "dropped" | "just_noted" | "linked";
export type EntryKind =
  | "task"
  | "reminder"
  | "reference"
  | "idea"
  | "reflection"
  | "random_note"
  | "question"
  | "vent";
export type CommitmentLevel = "clear" | "soft" | "maybe" | "none";
export type ReferenceType = "book" | "article" | "video" | "product" | "link" | "unknown";

export interface Entry {
  id: string;
  createdAt: Date;
  device: string;
  content: string;
  source: EntrySource;
  voicePath?: string;
  embedding?: Float32Array;
  salienceScore: number;
  clusterId?: string;
  /** Populated asynchronously by Gemini or heuristic classifier */
  actionable?: boolean;
  kind?: EntryKind;
  commitmentLevel?: CommitmentLevel;
  referenceType?: ReferenceType;
  classificationConfidence?: number;
  shouldResurfaceTonight?: boolean;
  userFacingLine?: string;
  llmSummary?: string;
  deadline?: string | null;
  people?: string[];
  topic?: string;
  outcome?: Outcome;
  carriedFromId?: string;
  carriedForDate?: string;
  askCount?: number;
  lastAskedAt?: string;
  lastQuestionKey?: string;
}

export interface Cluster {
  id: string;
  label: string;
  firstSeen: Date;
  lastSeen: Date;
  occurrenceCount: number;
  pushedCount: number;
  doneCount: number;
  droppedCount: number;
  confirmed: boolean;
  anchorVector?: Float32Array;
  glossaryId?: string;
}

export interface GlossaryEntry {
  id: string;
  clusterId: string;
  meaning: string;
  learnedAt: Date;
}

export interface Reflection {
  id: string;
  date: string;
  summary?: string;
  llmUsed: boolean;
  durationS?: number;
  createdAt: Date;
}

export interface ReflectionTurn {
  id: string;
  reflectionId: string;
  turnIndex: number;
  role: "agent" | "user";
  content: string;
  clusterId?: string;
  entryIds?: string[];
  outcome?: Outcome;
  splitFromClusterId?: string;
  mergedIntoClusterId?: string;
}

export interface SurfacedItem {
  type: "cluster" | "single";
  clusterId?: string;
  cluster?: Cluster;
  entries: Entry[];
  glossary?: GlossaryEntry;
  topSalience: number;
}

export interface WalkThroughContext {
  date: string;
  surfacedItems: SurfacedItem[];
  remainingCount: number;
  totalEntries: number;
}

export interface PatternSummary {
  clusterId: string;
  label: string;
  meaning?: string;
  totalOccurrences: number;
  thisWeekOccurrences: number;
  pushedCount: number;
  doneCount: number;
  droppedCount: number;
  consecutivePushes: number;
  daysSinceLastTouched: number;
}
