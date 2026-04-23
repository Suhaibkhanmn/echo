import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getCloseSurfacedItems,
  getOpenCloseWindowEntries,
  getCloseWindowCount,
  updateOutcome,
  updateEntryOutcome,
  markEntriesAsked,
  addGlossaryEntry,
  getGlossary,
  getPatterns,
  type Outcome,
  type Entry,
  type SurfacedItem,
} from "../lib/store";
import { getGeminiApiKeySync } from "../lib/secrets";
import { GeminiAdapter, TemplatedFallback } from "@accountability/llm";
import type { WalkThroughInput, LlmAdapter } from "@accountability/llm";
import { getColors, sizes, spacing, radius } from "../lib/theme";

interface Props {
  theme: "light" | "dark";
}

type Phase = "ready" | "walking" | "done";

interface Turn {
  role: "agent" | "user";
  content: string;
}

const OUTCOME_CHIPS: Array<{ outcome: Outcome; label: string }> = [
  { outcome: "did", label: "did it" },
  { outcome: "pushed", label: "pushed" },
  { outcome: "dropped", label: "dropped" },
  { outcome: "just_noted", label: "just noted" },
];

const MAX_CLOSE_ITEMS = 6;

function fallbackQuestion(label: string, entry?: Entry): string {
  if (!entry) return "noted.";
  if (entry.actionable || entry.kind === "task" || entry.kind === "reminder") {
    return `'${label}' - done?`;
  }
  if (entry.kind === "reflection" || entry.kind === "question") {
    return `'${label}' - still true?`;
  }
  if (entry.kind === "reference") {
    return `'${label}' - still want to revisit this?`;
  }
  if (entry.kind === "idea") {
    return `'${label}' - worth keeping?`;
  }
  return `'${label}' - noted.`;
}

export function WalkThroughScreen({ theme }: Props) {
  const c = getColors(theme);
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("ready");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [surfaced, setSurfaced] = useState<SurfacedItem[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [askingGlossary, setAskingGlossary] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [isTired, setIsTired] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const adapterRef = useRef<LlmAdapter | null>(null);
  const adapterKeyRef = useRef<string | null>(null);

  const totalEntries = getCloseWindowCount();

  // Initialize the LLM adapter
  function getAdapter(): LlmAdapter {
    const apiKey = getGeminiApiKeySync()?.trim() || null;
    if (!adapterRef.current || adapterKeyRef.current !== apiKey) {
      adapterRef.current = apiKey
        ? new GeminiAdapter(apiKey)
        : new TemplatedFallback();
      adapterKeyRef.current = apiKey;
    }
    return adapterRef.current;
  }

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [turns]);

  /** Build the WalkThroughInput payload for the LLM adapter */
  function buildInput(
    items: SurfacedItem[],
    remainingCount: number,
    idx: number,
    history: Turn[],
    tired: boolean,
    userAnswer?: string
  ): WalkThroughInput {
    const todayEntries = getOpenCloseWindowEntries();
    const actionableCount = todayEntries.filter((e) => e.actionable).length;
    const thoughtCount = todayEntries.length - actionableCount;

    return {
      date: new Date().toISOString().slice(0, 10),
      surfacedItems: items,
      remainingCount,
      totalEntries: todayEntries.length,
      glossary: getGlossary(),
      patterns: getPatterns(),
      turnHistory: history.map((t) => ({ role: t.role, content: t.content })),
      currentItemIndex: idx,
      userAnswer,
      isTiredMode: tired,
      actionableCount,
      thoughtCount,
    };
  }

  const startWalk = async (tired: boolean) => {
    const { surfaced: s, remaining: r } = getCloseSurfacedItems();
    const { items, remainingCount } = buildCloseItems(s, r, tired);

    setSurfaced(items);
    setRemaining(remainingCount);
    setIsTired(tired);
    setPhase("walking");
    setCurrentIdx(0);
    setAskingGlossary(false);
    setIsThinking(true);

    try {
      const initialTurns: Turn[] = [
        { role: "agent", content: buildLocalOpening(totalEntries, items.length, tired) },
      ];

      if (items.length > 0) {
        const questionInput = buildInput(items, remainingCount, 0, initialTurns, tired);
        const quickQuestion = await new TemplatedFallback().generateTurn(questionInput);
        initialTurns.push({ role: "agent", content: quickQuestion.content });
        markItemAsked(items[0], quickQuestion.content);
        setTurns(initialTurns);
        setWaitingForInput(true);
        setIsThinking(false);

        const adapter = getAdapter();
        if (adapter.name === "templated") return;

        const question = await adapter.generateTurn(questionInput);
        const refinedTurns: Turn[] = [
          initialTurns[0],
          { role: "agent", content: question.content },
        ];
        markItemAsked(items[0], question.content);
        setTurns(refinedTurns);
      } else {
        initialTurns.push({ role: "agent", content: "quiet day. nothing to close." });
        setTurns(initialTurns);
        setPhase("done");
      }
    } catch {
      // Fallback to simple opening
      const fallbackTurns: Turn[] = [
        { role: "agent", content: `${totalEntries} things today. close the day?` },
      ];
      setTurns(fallbackTurns);
      setWaitingForInput(items.length > 0);
      if (items.length === 0) setPhase("done");
    } finally {
      setIsThinking(false);
    }
  };

  const handleOutcome = (outcome: Outcome) => {
    const item = surfaced[currentIdx];
    if (item?.clusterId) updateOutcome(item.clusterId, outcome);
    else item?.entries.forEach((entry) => updateEntryOutcome(entry.id, outcome));
    const newTurns: Turn[] = [
      ...turns,
      {
        role: "user",
        content:
          OUTCOME_CHIPS.find((ch) => ch.outcome === outcome)?.label ?? outcome,
      },
    ];
    setTurns(newTurns);
    setWaitingForInput(false);

    if (
      item?.type === "cluster" &&
      item.cluster &&
      !item.glossary &&
      !item.cluster.confirmed &&
      !askingGlossary
    ) {
      setAskingGlossary(true);
      setTimeout(() => {
        const q = `what's '${item.cluster!.label}'?`;
        setTurns((prev) => [...prev, { role: "agent", content: q }]);
        setWaitingForInput(true);
      }, 600);
      return;
    }
    moveNext(newTurns);
  };

  const handleFreeTextSubmit = () => {
    const text = freeText.trim();
    if (!text) return;
    setFreeText("");

    const newTurns: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(newTurns);

    if (askingGlossary) {
      const item = surfaced[currentIdx];
      if (item?.clusterId) addGlossaryEntry(item.clusterId, text);
      setAskingGlossary(false);
      moveNext(newTurns);
      return;
    }

    setWaitingForInput(false);
    moveNext(newTurns);
  };

  const moveNext = async (currentTurns: Turn[]) => {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= surfaced.length) {
      const finalTurns = [...currentTurns];
      if (remaining > 0) {
        finalTurns.push({ role: "agent", content: `${remaining} other notes. heard. closed.` });
      } else {
        finalTurns.push({ role: "agent", content: "done for today." });
      }
      setTurns(finalTurns);
      setPhase("done");
      return;
    }
    setCurrentIdx(nextIdx);
    setIsThinking(true);

    try {
      const input = buildInput(surfaced, remaining, nextIdx, currentTurns, isTired);
      const quickTurn = await new TemplatedFallback().generateTurn(input);
      markItemAsked(surfaced[nextIdx], quickTurn.content);
      setTurns((prev) => [...prev, { role: "agent", content: quickTurn.content }]);
      setWaitingForInput(true);

      const adapter = getAdapter();
      if (adapter.name === "templated") return;

      const turn = await adapter.generateTurn(input);
      markItemAsked(surfaced[nextIdx], turn.content);
      setTurns((prev) => [
        ...prev.slice(0, -1),
        { role: "agent", content: turn.content },
      ]);
    } catch {
      // Fallback: simple question
      const entry = surfaced[nextIdx]?.entries[0];
      const label = entry?.content.slice(0, 30) ?? "this";
      const q = fallbackQuestion(label, entry);
      markItemAsked(surfaced[nextIdx], q);
      setTurns((prev) => [...prev, { role: "agent", content: q }]);
      setWaitingForInput(true);
    } finally {
      setIsThinking(false);
    }
  };

  function markItemAsked(item: SurfacedItem | undefined, question: string) {
    if (!item) return;
    markEntriesAsked(item.entries.map((entry) => entry.id), question);
  }

  const handleEnough = () => {
    setPhase("done");
    setTurns((prev) => [
      ...prev,
      { role: "agent", content: "noted. rest can wait." },
    ]);
  };

  const reset = () => {
    setPhase("ready");
    setTurns([]);
    setCurrentIdx(0);
    setSurfaced([]);
    setRemaining(0);
    setWaitingForInput(false);
    setAskingGlossary(false);
    setFreeText("");
  };

  // READY screen (pre-walk)
  if (phase === "ready") {
    return (
      <View style={[styles.readyContainer, { backgroundColor: c.bg }]}>
        <View style={styles.readyInner}>
          <Text style={[styles.readyHeading, { color: c.ink }]}>Close</Text>
          <Text style={[styles.readyCount, { color: c.muted }]}>
            {totalEntries === 0
              ? "nothing open."
              : `${totalEntries} ${totalEntries === 1 ? "thing" : "things"} open.`}
          </Text>
        </View>

        <View style={styles.readyButtons}>
          <TouchableOpacity
            onPress={() => startWalk(false)}
            disabled={totalEntries === 0}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: totalEntries === 0 ? c.divider : c.ink,
                opacity: totalEntries === 0 ? 0.6 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.primaryBtnText,
                { color: totalEntries === 0 ? c.subtle : c.bg },
              ]}
            >
              close the day
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => startWalk(true)}
            disabled={totalEntries === 0}
            style={[
              styles.secondaryBtn,
              {
                borderColor: c.divider,
                opacity: totalEntries === 0 ? 0.6 : 1,
              },
            ]}
          >
            <Text style={[styles.secondaryBtnText, { color: c.inkSoft }]}>
              one thing
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.readyHint, { color: c.subtle }]}>
          one thing mode: only what matters most.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
      style={[styles.container, { backgroundColor: c.bg }]}
    >
      <View
        style={[
          styles.topBar,
          { borderBottomColor: c.divider, backgroundColor: c.bg },
        ]}
      >
        {phase === "walking" ? (
          <TouchableOpacity onPress={handleEnough} style={styles.topBtn}>
            <Text style={[styles.topBtnText, { color: c.muted }]}>
              enough
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={reset} style={styles.topBtn}>
            <Text style={[styles.topBtnText, { color: c.muted }]}>close</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
      {turns.map((turn, i) => (
          <View key={i} style={styles.turnWrap}>
            {turn.role === "agent" ? (
              <Text style={[styles.agentText, { color: c.ink }]}>
                {turn.content}
              </Text>
            ) : (
              <View style={styles.userBubbleWrap}>
                <View
                  style={[
                    styles.userBubble,
                    { backgroundColor: c.accentMuted },
                  ]}
                >
                  <Text style={[styles.userText, { color: c.accentInk }]}>
                    {turn.content}
                  </Text>
                </View>
              </View>
            )}
          </View>
        ))}

        {isThinking && phase === "walking" ? (
          <View style={styles.thinkingRow}>
            <ActivityIndicator color={c.muted} size="small" />
            <Text style={[styles.thinkingText, { color: c.subtle }]}>
              thinking
            </Text>
          </View>
        ) : null}

        {phase === "done" ? (
          <TouchableOpacity
            onPress={reset}
            style={[styles.doneBtn, { borderColor: c.divider }]}
          >
            <Text style={[styles.doneBtnText, { color: c.inkSoft }]}>
              start over
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {waitingForInput && phase === "walking" ? (
        <View
          style={[
            styles.inputDock,
            {
              borderTopColor: c.divider,
      backgroundColor: c.bg,
              paddingBottom: Platform.OS === "ios"
                ? Math.max(insets.bottom, spacing.md)
                : spacing.md,
            },
          ]}
        >
          {!askingGlossary ? (
            <View style={styles.chipsRow}>
              {OUTCOME_CHIPS.map((chip) => (
                <TouchableOpacity
                  key={chip.outcome}
                  onPress={() => handleOutcome(chip.outcome)}
                  style={[
                    styles.chip,
                    {
                      borderColor: c.divider,
                      backgroundColor: c.surface,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: c.ink }]}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <View style={styles.inputBar}>
            <TextInput
              value={freeText}
              onChangeText={setFreeText}
              placeholder={
                askingGlossary ? "type the meaning..." : "or type here..."
              }
              placeholderTextColor={c.subtle}
              multiline
              style={[
                styles.input,
                {
                  color: c.ink,
                  backgroundColor: c.surfaceAlt,
                },
              ]}
            />
            <TouchableOpacity
              onPress={handleFreeTextSubmit}
              disabled={!freeText.trim()}
              style={[
                styles.sendBtn,
                {
                  backgroundColor: freeText.trim() ? c.ink : c.divider,
                },
              ]}
            >
              <Text
                style={[
                  styles.sendBtnText,
                  { color: freeText.trim() ? c.bg : c.subtle },
                ]}
              >
                send
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function chooseOneThing(items: SurfacedItem[], remaining: Entry[]): SurfacedItem {
  const candidates = [
    ...items,
    ...remaining.map((entry) => ({
      type: "single" as const,
      entries: [entry],
      topSalience: entry.salienceScore,
    })),
  ];
  return [...candidates].sort((a, b) => itemPriority(b) - itemPriority(a))[0] ?? items[0];
}

function buildCloseItems(
  surfaced: SurfacedItem[],
  remaining: Entry[],
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

  if (tired) {
    const item = chooseOneThing(surfaced, remaining);
    return {
      items: [item],
      remainingCount: countUnselectedEntries([item], allItems),
    };
  }

  const sorted = [...allItems].sort((a, b) => itemPriority(b) - itemPriority(a));
  const mustAsk = sorted.filter((item) => {
    const entry = item.entries[0];
    return (
      item.type === "cluster" ||
      !entry?.outcome ||
      !!entry?.carriedFromId ||
      !!entry?.actionable ||
      entry?.kind === "task" ||
      entry?.kind === "reminder" ||
      entry?.shouldResurfaceTonight
    );
  });
  const chosen = uniqueItems([...mustAsk, ...sorted]).slice(0, MAX_CLOSE_ITEMS);
  return {
    items: chosen,
    remainingCount: countUnselectedEntries(chosen, allItems),
  };
}

function uniqueItems(items: SurfacedItem[]): SurfacedItem[] {
  const seen = new Set<string>();
  const unique: SurfacedItem[] = [];
  for (const item of items) {
    const key =
      item.clusterId ??
      item.entries
        .map((entry) => entry.carriedFromId ?? normalizeEntryContent(entry.content))
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
  if (!entry.outcome) score += 12;
  if (entry.carriedFromId) score += 25;
  if (entry.actionable || entry.kind === "task" || entry.kind === "reminder") score += 40;
  else if (entry.kind === "reflection" || entry.kind === "question") score += 24;
  else if (entry.kind === "reference") score += 18;
  else if (entry.kind === "idea") score += 14;
  if (entry.shouldResurfaceTonight) score += 10;
  score += Math.min(8, Math.max(0, (Date.now() - entry.createdAt.getTime()) / 1000 / 60 / 60));
  return score;
}

function buildLocalOpening(totalEntries: number, surfacedCount: number, tired: boolean): string {
  if (totalEntries === 0) return "quiet day. nothing to close.";
  if (tired) return "one thing from today.";
  if (surfacedCount <= 1) return "one thing worth closing.";
  return `${surfacedCount} things worth closing.`;
}

const styles = StyleSheet.create({
  readyContainer: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xl,
  },
  readyInner: { alignItems: "center" },
  readyHeading: {
    fontFamily: "serif",
    fontSize: sizes.display,
    fontWeight: "500",
    letterSpacing: -0.5,
  },
  readyCount: {
    fontFamily: "serif",
    fontSize: sizes.base,
    marginTop: spacing.sm,
  },
  readyButtons: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  primaryBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnText: {
    fontFamily: "sans-serif",
    fontSize: sizes.md,
    fontWeight: "500",
  },
  secondaryBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryBtnText: {
    fontFamily: "sans-serif",
    fontSize: sizes.md,
  },
  readyHint: {
    fontFamily: "serif",
    fontSize: sizes.sm,
    textAlign: "center",
    maxWidth: 280,
  },
  container: { flex: 1 },
  topBar: {
    borderBottomWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    alignItems: "flex-end",
  },
  topBtn: { padding: spacing.sm },
  topBtnText: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
  },
  scrollArea: { flex: 1 },
  scrollContent: {
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  turnWrap: {},
  agentText: {
    fontFamily: "serif",
    fontSize: sizes.md,
    lineHeight: sizes.md * 1.55,
  },
  userBubbleWrap: {
    alignItems: "flex-end",
  },
  userBubble: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    maxWidth: "85%",
  },
  userText: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
  },
  inputDock: {
    borderTopWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
  },
  chipText: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
    fontWeight: "500",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: "serif",
    fontSize: sizes.base,
    lineHeight: sizes.base * 1.4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    maxHeight: 120,
    minHeight: 48,
  },
  sendBtn: {
    paddingHorizontal: spacing.lg,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
  },
  sendBtnText: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  doneBtn: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    alignSelf: "center",
  },
  doneBtnText: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
    fontWeight: "500",
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  thinkingText: {
    fontFamily: "sans-serif",
    fontSize: sizes.xs,
  },
});
