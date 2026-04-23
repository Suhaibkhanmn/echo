import { GoogleGenAI } from "@google/genai";
import { CLASSIFY_SYSTEM_PROMPT } from "./prompts/classify";

const CLASSIFY_MODEL = "gemini-3.1-flash-lite";

export interface IntentClassification {
  actionable: boolean;
  kind: "task" | "reminder" | "reference" | "idea" | "reflection" | "random_note" | "question" | "vent";
  commitmentLevel: "clear" | "soft" | "maybe" | "none";
  referenceType: "book" | "article" | "video" | "product" | "link" | "unknown";
  confidence: number;
  shouldResurfaceTonight: boolean;
  userFacingLine: string;
  summary: string;
  deadline: string | null;
  people: string[];
  topic: string;
}

/**
 * Classify an entry using Gemini. Returns whether it's actionable + metadata.
 * Called asynchronously after capture — never blocks the UI.
 */
export async function classifyWithGemini(
  text: string,
  apiKey: string
): Promise<IntentClassification> {
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.generateContent({
    model: CLASSIFY_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      systemInstruction: CLASSIFY_SYSTEM_PROMPT,
      temperature: 0.3,
      maxOutputTokens: 80,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object" as const,
        properties: {
          actionable: { type: "boolean" as const },
          kind: {
            type: "string" as const,
            enum: ["task", "reminder", "reference", "idea", "reflection", "random_note", "question", "vent"],
          },
          commitmentLevel: {
            type: "string" as const,
            enum: ["clear", "soft", "maybe", "none"],
          },
          referenceType: {
            type: "string" as const,
            enum: ["book", "article", "video", "product", "link", "unknown"],
          },
          confidence: { type: "number" as const },
          shouldResurfaceTonight: { type: "boolean" as const },
          userFacingLine: { type: "string" as const },
          summary: { type: "string" as const },
          deadline: { type: "string" as const, nullable: true },
          people: { type: "array" as const, items: { type: "string" as const } },
          topic: { type: "string" as const },
        },
        required: [
          "actionable",
          "kind",
          "commitmentLevel",
          "referenceType",
          "confidence",
          "shouldResurfaceTonight",
          "userFacingLine",
          "summary",
          "people",
          "topic",
        ],
      },
    },
  });

  const raw = response.text ?? "";
  try {
    const parsed = JSON.parse(raw);
    return {
      actionable: !!parsed.actionable,
      kind: normalizeKind(parsed.kind),
      commitmentLevel: normalizeCommitment(parsed.commitmentLevel),
      referenceType: normalizeReferenceType(parsed.referenceType),
      confidence: normalizeConfidence(parsed.confidence),
      shouldResurfaceTonight: !!parsed.shouldResurfaceTonight,
      userFacingLine:
        typeof parsed.userFacingLine === "string" ? parsed.userFacingLine : "",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      deadline: typeof parsed.deadline === "string" ? parsed.deadline : null,
      people: Array.isArray(parsed.people) ? parsed.people : [],
      topic: typeof parsed.topic === "string" ? parsed.topic : "",
    };
  } catch {
    return {
      actionable: false,
      kind: "random_note",
      commitmentLevel: "none",
      referenceType: "unknown",
      confidence: 0.4,
      shouldResurfaceTonight: false,
      userFacingLine: "saved as a note.",
      summary: "",
      deadline: null,
      people: [],
      topic: "",
    };
  }
}

function normalizeKind(value: unknown): IntentClassification["kind"] {
  const allowed: IntentClassification["kind"][] = [
    "task",
    "reminder",
    "reference",
    "idea",
    "reflection",
    "random_note",
    "question",
    "vent",
  ];
  return allowed.includes(value as IntentClassification["kind"])
    ? (value as IntentClassification["kind"])
    : "random_note";
}

function normalizeReferenceType(value: unknown): IntentClassification["referenceType"] {
  const allowed: IntentClassification["referenceType"][] = [
    "book",
    "article",
    "video",
    "product",
    "link",
    "unknown",
  ];
  return allowed.includes(value as IntentClassification["referenceType"])
    ? (value as IntentClassification["referenceType"])
    : "unknown";
}

function normalizeConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function normalizeCommitment(value: unknown): IntentClassification["commitmentLevel"] {
  const allowed: IntentClassification["commitmentLevel"][] = [
    "clear",
    "soft",
    "maybe",
    "none",
  ];
  return allowed.includes(value as IntentClassification["commitmentLevel"])
    ? (value as IntentClassification["commitmentLevel"])
    : "none";
}

/**
 * Classify with Gemini, falling back to heuristic if unavailable.
 */
export async function classifyEntry(
  text: string,
  apiKey?: string
): Promise<IntentClassification> {
  if (apiKey) {
    try {
      return await classifyWithGemini(text, apiKey);
    } catch (err) {
      console.warn("Gemini classification failed, using heuristic:", err);
    }
  }
  const { classifyHeuristic } = await import("./classify-heuristic");
  return classifyHeuristic(text);
}
