import { GoogleGenAI } from "@google/genai";
import type { LlmAdapter, WalkThroughInput, AgentTurn } from "./types";
import { WALK_THROUGH_SYSTEM_PROMPT } from "./prompts/system";
import { TONIGHT_OPENING_PROMPT } from "./prompts/tonight-opening";
import { TemplatedFallback } from "./fallback";

const BANNED_TOKENS = [
  "frustrated", "tired", "struggling", "anxious", "overwhelmed",
  "excited", "proud", "disappointed", "stressed", "worried",
  "motivated", "lazy", "productive", "unproductive", "ambitious",
  "procrastinating",
];

const BANNED_PHRASES = [
  "i notice", "it seems like", "it sounds like", "i hear that",
  "i can see", "that must be", "good job", "great work",
  "keep it up", "you got this", "don't worry",
];

const MAX_WORDS = 12;
const MAX_OPENING_WORDS = 25;
const PRIMARY_MODEL = "gemini-3.1-flash-lite";

function validateResponse(content: string, maxWords: number = MAX_WORDS): string | null {
  const trimmed = content.trim();
  if (!trimmed) return "empty response";
  const words = trimmed.split(/\s+/);
  if (words.length > maxWords) return `over word limit: ${words.length}`;
  const lower = trimmed.toLowerCase();
  for (const token of BANNED_TOKENS) {
    if (new RegExp(`\\b${token}\\b`, "i").test(lower)) return `banned token: ${token}`;
  }
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) return `banned phrase: ${phrase}`;
  }
  return null;
}

function parseContent(raw: string): string {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.content === "string") return parsed.content.trim();
    } catch {}
  }
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export class GeminiAdapter implements LlmAdapter {
  name = "gemini";
  private client: GoogleGenAI | null = null;
  private fallback = new TemplatedFallback();

  constructor(private apiKey?: string) {}

  private getApiKey(): string | null {
    return (
      this.apiKey ??
      (typeof process !== "undefined" ? process.env?.GEMINI_API_KEY : null) ??
      null
    );
  }

  async isAvailable(): Promise<boolean> {
    return !!this.getApiKey();
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const key = this.getApiKey();
      if (!key) throw new Error("No Gemini API key configured");
      this.client = new GoogleGenAI({ apiKey: key });
    }
    return this.client;
  }

  /** Build the JSON payload sent to Gemini for a Tonight conversation turn. */
  buildPayload(input: WalkThroughInput): object {
    const currentItem = input.surfacedItems[input.currentItemIndex];
    const relevantPatterns = input.patterns.filter(
      (p) => currentItem?.clusterId && p.clusterId === currentItem.clusterId
    );

    return {
      currentItem: currentItem
        ? {
            type: currentItem.type,
            label:
              currentItem.cluster?.label ??
              currentItem.entries[0]?.content.slice(0, 50),
            entries: currentItem.entries.map((e) => ({
              content: e.content,
              time: e.createdAt.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              actionable: e.actionable ?? false,
              kind: e.kind ?? (e.actionable ? "task" : "random_note"),
              commitmentLevel: e.commitmentLevel ?? "none",
              referenceType: e.referenceType ?? "unknown",
              askCount: e.askCount ?? 0,
              lastQuestionKey: e.lastQuestionKey ?? "",
              shouldResurfaceTonight: e.shouldResurfaceTonight ?? false,
              deadline: e.deadline ?? null,
              people: e.people ?? [],
              topic: e.topic ?? "",
              llmSummary: e.llmSummary ?? "",
            })),
            glossary: currentItem.glossary?.meaning,
            occurrenceCount: currentItem.cluster?.occurrenceCount ?? 1,
            pushedCount: currentItem.cluster?.pushedCount ?? 0,
            doneCount: currentItem.cluster?.doneCount ?? 0,
          }
        : null,
      turnHistory: input.turnHistory.slice(-6),
      patternMemory: relevantPatterns.map((p) => ({
        label: p.label,
        meaning: p.meaning,
        totalOccurrences: p.totalOccurrences,
        pushedCount: p.pushedCount,
        consecutivePushes: p.consecutivePushes,
      })),
      actionableCount: input.actionableCount ?? 0,
      thoughtCount: input.thoughtCount ?? 0,
      userAnswer: input.userAnswer,
      turnNumber: input.turnHistory.length,
      totalEntries: input.totalEntries,
      isTiredMode: input.isTiredMode,
    };
  }

  private async callModel(
    model: string,
    payload: object,
    systemPrompt: string,
    maxTokens: number = 60
  ): Promise<string> {
    const client = this.getClient();
    const response = await client.models.generateContent({
      model,
      contents: [
        { role: "user", parts: [{ text: JSON.stringify(payload) }] },
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.55,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object" as const,
          properties: { content: { type: "string" as const } },
          required: ["content"],
        },
      },
    });
    return parseContent(response.text ?? "");
  }

  /** Generate the Tonight opening — a smart summary, not just a count. */
  async generateOpening(input: WalkThroughInput): Promise<AgentTurn> {
    const key = this.getApiKey();
    if (!key) return this.fallback.generateTurn(input);

    const payload = {
      actionableCount: input.actionableCount ?? 0,
      thoughtCount: input.thoughtCount ?? 0,
      totalEntries: input.totalEntries,
      isTiredMode: input.isTiredMode,
      surfacedCount: input.surfacedItems.length,
      remainingCount: input.remainingCount,
      notablePatterns: input.patterns
        .filter((p) => p.consecutivePushes >= 2 || p.thisWeekOccurrences >= 3)
        .slice(0, 3)
        .map((p) => ({
          label: p.meaning ?? p.label,
          pushes: p.consecutivePushes,
          weekOccurrences: p.thisWeekOccurrences,
        })),
    };

    try {
      const content = await this.callModel(PRIMARY_MODEL, payload, TONIGHT_OPENING_PROMPT, 70);
      const violation = validateResponse(content, MAX_OPENING_WORDS);
      if (violation) return this.fallback.generateTurn(input);
      return { content, isOpening: true };
    } catch {
      return this.fallback.generateTurn(input);
    }
  }

  async generateTurn(input: WalkThroughInput): Promise<AgentTurn> {
    const key = this.getApiKey();
    if (!key) return this.fallback.generateTurn(input);

    // Opening turn: generate summary
    if (input.turnHistory.length === 0) {
      return this.generateOpening(input);
    }

    const payload = this.buildPayload(input);

    try {
      const content = await this.callModel(PRIMARY_MODEL, payload, WALK_THROUGH_SYSTEM_PROMPT);
      const violation = validateResponse(content);
      if (violation) return this.fallback.generateTurn(input);

      return { content, askingAbout: this.getAskingAbout(input) };
    } catch {
      return this.fallback.generateTurn(input);
    }
  }

  private getAskingAbout(input: WalkThroughInput) {
    const item = input.surfacedItems[input.currentItemIndex];
    if (!item) return undefined;
    return { clusterId: item.clusterId, entryIds: item.entries.map((e) => e.id) };
  }
}
