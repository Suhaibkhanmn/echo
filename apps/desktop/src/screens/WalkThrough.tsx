import React, { useState, useEffect, useRef, useCallback } from "react";
import { AgentBubble, OutcomeChips, ClusterChips, FreeTextInput } from "@accountability/ui";
import type { Outcome, SurfacedItem, PatternSummary } from "@accountability/core";
import type { AgentTurn, WalkThroughInput } from "@accountability/llm";
import { TemplatedFallback, GeminiAdapter } from "@accountability/llm";
import {
  getCloseSurfacedItems,
  getPatterns,
  getGlossary,
  getCloseEntries,
  getCloseCount,
  updateOutcome,
  updateEntryOutcome,
  markEntriesAsked,
  addGlossaryEntry,
  ejectFromCluster,
} from "../store";

type Phase = "ready" | "walking" | "done";
const MAX_CLOSE_ITEMS = 6;

interface Turn {
  role: "agent" | "user";
  content: string;
}

export function WalkThrough() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [surfaced, setSurfaced] = useState<SurfacedItem[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [patterns, setPatterns] = useState<PatternSummary[]>([]);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [askingGlossary, setAskingGlossary] = useState(false);
  const [isTiredMode, setIsTiredMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const apiKey = localStorage.getItem("gemini_api_key") ?? "";
  const llmEnabled = localStorage.getItem("llm_enabled") === "true";
  const adapter = llmEnabled && apiKey
    ? new GeminiAdapter(apiKey)
    : new TemplatedFallback();

  const totalEntries = getCloseCount();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const generateTurn = useCallback(
    async (userAnswer?: string, itemIdx?: number) => {
      const input: WalkThroughInput = {
        date: new Date().toLocaleDateString(),
        surfacedItems: surfaced,
        remainingCount: remaining,
        totalEntries,
        glossary: getGlossary(),
        patterns,
        turnHistory: turns.map((t) => ({ role: t.role, content: t.content })),
        currentItemIndex: itemIdx ?? currentItemIndex,
        userAnswer,
        isTiredMode,
        actionableCount: getCloseEntries().filter((e) => e.actionable).length,
        thoughtCount: getCloseEntries().filter((e) => e.actionable === false).length,
      };

      const agentTurn = await adapter.generateTurn(input);
      return agentTurn;
    },
    [surfaced, remaining, totalEntries, patterns, turns, currentItemIndex, isTiredMode, adapter]
  );

  const startWalk = async (tired: boolean = false) => {
    const { surfaced: s, remaining: r } = getCloseSurfacedItems();
    const p = getPatterns();
    const { items, remainingCount } = buildCloseItems(s, r, tired);

    setSurfaced(items);
    setRemaining(remainingCount);
    setPatterns(p);
    setIsTiredMode(tired);
    setPhase("walking");
    setCurrentItemIndex(0);

    if (items.length === 0) {
      setTurns([
        { role: "agent", content: "quiet day. nothing to close." },
      ]);
      setPhase("done");
      return;
    }

    const firstInput: WalkThroughInput = {
      date: new Date().toLocaleDateString(),
      surfacedItems: items,
      remainingCount,
      totalEntries,
      glossary: getGlossary(),
      patterns: p,
      turnHistory: [{ role: "agent", content: "__start__" }],
      currentItemIndex: 0,
      isTiredMode: tired,
      actionableCount: getCloseEntries().filter((e) => e.actionable).length,
      thoughtCount: getCloseEntries().filter((e) => e.actionable === false).length,
    };

    const firstTurn = await adapter.generateTurn(firstInput);
    markItemAsked(items[0], firstTurn.content);
    setTurns([{ role: "agent", content: firstTurn.content }]);
    setWaitingForInput(true);
  };

  const handleOutcome = async (outcome: Outcome) => {
    const item = surfaced[currentItemIndex];
    if (item?.clusterId) {
      updateOutcome(item.clusterId, outcome);
    } else if (item) {
      for (const entry of item.entries) {
        updateEntryOutcome(entry.id, outcome);
      }
    }

    const userTurn: Turn = { role: "user", content: outcome };
    const newTurns = [...turns, userTurn];
    setTurns(newTurns);
    setWaitingForInput(false);

    if (item?.type === "cluster" && item.cluster && !item.glossary && !item.cluster.confirmed && !askingGlossary) {
      setAskingGlossary(true);
      const glossaryQ = await generateTurn(outcome, currentItemIndex);
      if (glossaryQ.askingForGlossary) {
        setTurns([...newTurns, { role: "agent", content: glossaryQ.content }]);
        setWaitingForInput(true);
        return;
      }
    }

    moveToNextItem(newTurns);
  };

  const handleFreeText = async (text: string) => {
    const userTurn: Turn = { role: "user", content: text };
    const newTurns = [...turns, userTurn];
    setTurns(newTurns);

    if (askingGlossary) {
      const item = surfaced[currentItemIndex];
      if (item?.clusterId) {
        addGlossaryEntry(item.clusterId, text);
      }
      setAskingGlossary(false);
      moveToNextItem(newTurns);
      return;
    }

    setWaitingForInput(false);
    moveToNextItem(newTurns);
  };

  const moveToNextItem = async (currentTurns: Turn[]) => {
    const nextIdx = currentItemIndex + 1;

    if (nextIdx >= surfaced.length) {
      const closingInput: WalkThroughInput = {
        date: new Date().toLocaleDateString(),
        surfacedItems: surfaced,
        remainingCount: remaining,
        totalEntries,
        glossary: getGlossary(),
        patterns,
        turnHistory: currentTurns.map((t) => ({ role: t.role, content: t.content })),
        currentItemIndex: nextIdx,
        isTiredMode,
        actionableCount: getCloseEntries().filter((e) => e.actionable).length,
        thoughtCount: getCloseEntries().filter((e) => e.actionable === false).length,
      };
      const closing = await new TemplatedFallback().generateTurn(closingInput);
      if (closing.content) {
        const lastAgent = currentTurns.filter((t) => t.role === "agent").at(-1)?.content;
        const content = closing.content === lastAgent ? "done for today." : closing.content;
        setTurns([...currentTurns, { role: "agent", content }]);
      }
      setPhase("done");
      return;
    }

    setCurrentItemIndex(nextIdx);

    const nextInput: WalkThroughInput = {
      date: new Date().toLocaleDateString(),
      surfacedItems: surfaced,
      remainingCount: remaining,
      totalEntries,
      glossary: getGlossary(),
      patterns,
      turnHistory: currentTurns.map((t) => ({ role: t.role, content: t.content })),
      currentItemIndex: nextIdx,
      isTiredMode,
      actionableCount: getCloseEntries().filter((e) => e.actionable).length,
      thoughtCount: getCloseEntries().filter((e) => e.actionable === false).length,
    };
    const nextTurn = await adapter.generateTurn(nextInput);
    markItemAsked(surfaced[nextIdx], nextTurn.content);
    setTurns([...currentTurns, { role: "agent", content: nextTurn.content }]);
    setWaitingForInput(true);
  };

  const handleEject = (entryId: string) => {
    ejectFromCluster(entryId);
    const { surfaced: s } = getCloseSurfacedItems();
    setSurfaced(s);
  };

  const handleEnough = () => {
    setPhase("done");
    setTurns((prev) => [...prev, { role: "agent", content: "noted. rest can wait." }]);
  };

  const markItemAsked = (item: SurfacedItem | undefined, question: string) => {
    if (!item || !question) return;
    markEntriesAsked(item.entries.map((entry) => entry.id), question);
  };

  if (phase === "ready") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: "var(--sp-lg)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "var(--font-lg)",
            color: "var(--ink)",
          }}
        >
          {totalEntries === 0
            ? "nothing open."
            : `${totalEntries} ${totalEntries === 1 ? "thing" : "things"} open.`}
        </div>
        <div style={{ display: "flex", gap: "var(--sp-md)" }}>
          <button
            onClick={() => startWalk(false)}
            disabled={totalEntries === 0}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              padding: "var(--sp-sm) var(--sp-lg)",
              background: totalEntries === 0 ? "var(--divider)" : "var(--ink)",
              color: totalEntries === 0 ? "var(--muted)" : "var(--bg)",
              border: "none",
              borderRadius: "var(--radius)",
              cursor: totalEntries === 0 ? "default" : "pointer",
            }}
          >
            close the day
          </button>
          <button
            onClick={() => startWalk(true)}
            disabled={totalEntries === 0}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              padding: "var(--sp-sm) var(--sp-lg)",
              background: "var(--surface)",
              color: "var(--muted)",
              border: "1px solid var(--divider)",
              borderRadius: "var(--radius)",
              cursor: totalEntries === 0 ? "default" : "pointer",
            }}
          >
            one thing
          </button>
        </div>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--font-xs)",
            color: "var(--muted)",
            maxWidth: "300px",
            textAlign: "center",
          }}
        >
          one thing mode: only what matters most.
        </div>
      </div>
    );
  }

  const currentItem = surfaced[currentItemIndex];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {phase === "walking" && (
        <div
          style={{
            padding: "var(--sp-sm) var(--sp-lg)",
            borderBottom: "1px solid var(--divider)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={handleEnough}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-xs)",
              color: "var(--muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            enough
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "var(--sp-lg)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-md)",
        }}
      >
        {turns.map((turn, i) => (
          <div key={i}>
            {turn.role === "agent" ? (
              <AgentBubble content={turn.content} animate={i === turns.length - 1} />
            ) : (
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--font-sm)",
                  color: "var(--muted)",
                  padding: "var(--sp-xs) 0",
                }}
              >
                {turn.content}
              </div>
            )}
          </div>
        ))}

        {waitingForInput && phase === "walking" && (
          <div style={{ marginTop: "var(--sp-sm)" }}>
            {currentItem?.type === "cluster" && currentItem.entries.length > 1 && (
              <ClusterChips entries={currentItem.entries} onEject={handleEject} />
            )}
            {!askingGlossary && currentItem && (
              <OutcomeChips onSelect={handleOutcome} />
            )}
            <FreeTextInput
              onSubmit={handleFreeText}
              placeholder={
                askingGlossary
                  ? "type the meaning..."
                  : currentItem
                    ? "or type here..."
                    : "type to respond..."
              }
            />
          </div>
        )}

        {phase === "done" && (
          <div
            style={{
              textAlign: "center",
              marginTop: "var(--sp-xl)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-xs)",
              color: "var(--muted)",
            }}
          >
            closed.
          </div>
        )}
      </div>
    </div>
  );
}

function buildCloseItems(
  surfaced: SurfacedItem[],
  remaining: ReturnType<typeof getCloseEntries>,
  tired: boolean
): { items: SurfacedItem[]; remainingCount: number } {
  const allItems = [
    ...surfaced,
    ...remaining.map((entry) => ({
      type: "single" as const,
      entries: [entry],
      topSalience: entry.salienceScore,
    })),
  ];

  if (allItems.length === 0) return { items: [], remainingCount: 0 };
  const sorted = uniqueItems(allItems).sort((a, b) => itemPriority(b) - itemPriority(a));
  const chosen = tired ? sorted.slice(0, 1) : sorted.slice(0, MAX_CLOSE_ITEMS);
  return {
    items: chosen,
    remainingCount: countUnselectedEntries(chosen, sorted),
  };
}

function uniqueItems(items: SurfacedItem[]): SurfacedItem[] {
  const seen = new Set<string>();
  const unique: SurfacedItem[] = [];
  for (const item of items) {
    const key =
      item.clusterId ??
      item.entries
        .map((entry) => normalizeEntryContent(entry.carriedFromId ?? entry.content))
        .join("|");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function normalizeEntryContent(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, " ");
}

function countUnselectedEntries(chosen: SurfacedItem[], allItems: SurfacedItem[]): number {
  const chosenIds = new Set(chosen.flatMap((item) => item.entries.map((entry) => entry.id)));
  const allIds = new Set(allItems.flatMap((item) => item.entries.map((entry) => entry.id)));
  chosenIds.forEach((id) => allIds.delete(id));
  return allIds.size;
}

function itemPriority(item: SurfacedItem): number {
  const entry = item.entries[0];
  if (!entry) return item.topSalience;
  let score = item.topSalience * 5;
  if (entry.carriedFromId) score += 25;
  if (entry.actionable || entry.kind === "task" || entry.kind === "reminder") score += 40;
  else if (entry.kind === "reflection" || entry.kind === "question") score += 24;
  else if (entry.kind === "reference") score += 18;
  else if (entry.kind === "idea") score += 14;
  if (entry.shouldResurfaceTonight) score += 10;
  score += Math.min(8, Math.max(0, (Date.now() - entry.createdAt.getTime()) / 1000 / 60 / 60));
  return score;
}
