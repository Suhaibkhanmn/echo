import type { SurfacedItem, GlossaryEntry, PatternSummary } from "@accountability/core";

export interface WalkThroughInput {
  date: string;
  surfacedItems: SurfacedItem[];
  remainingCount: number;
  totalEntries: number;
  glossary: GlossaryEntry[];
  patterns: PatternSummary[];
  turnHistory: Array<{ role: "agent" | "user"; content: string }>;
  currentItemIndex: number;
  userAnswer?: string;
  isTiredMode?: boolean;
  /** How many actionable vs thought entries today */
  actionableCount?: number;
  thoughtCount?: number;
}

export interface AgentTurn {
  content: string;
  askingAbout?: {
    clusterId?: string;
    entryIds?: string[];
  };
  isOpening?: boolean;
  isClosing?: boolean;
  askingForGlossary?: boolean;
}

export interface LlmAdapter {
  name: string;
  generateTurn(input: WalkThroughInput): Promise<AgentTurn>;
  isAvailable(): Promise<boolean>;
}
