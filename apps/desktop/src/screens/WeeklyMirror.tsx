import React, { useMemo } from "react";
import { getPatterns } from "../store";
import type { PatternSummary } from "@accountability/core";

export function WeeklyMirror() {
  const patterns = useMemo(() => {
    return getPatterns()
      .filter((p) => p.thisWeekOccurrences > 0 || p.consecutivePushes > 0)
      .sort((a, b) => b.thisWeekOccurrences - a.thisWeekOccurrences)
      .slice(0, 10);
  }, []);

  if (patterns.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--muted)",
          fontFamily: "var(--font-serif)",
        }}
      >
        not enough data for a weekly mirror yet.
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--sp-lg)", maxWidth: "500px" }}>
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "var(--font-lg)",
          fontWeight: 500,
          marginBottom: "var(--sp-lg)",
        }}
      >
        this week
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-md)" }}>
        {patterns.map((p) => (
          <PatternRow key={p.clusterId} pattern={p} />
        ))}
      </div>
    </div>
  );
}

function PatternRow({ pattern }: { pattern: PatternSummary }) {
  const label = pattern.meaning ?? pattern.label;
  const hasStreak = pattern.consecutivePushes >= 3;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "var(--sp-sm) 0",
        borderBottom: "1px solid var(--divider)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "var(--font-base)",
            color: hasStreak ? "var(--danger)" : "var(--ink)",
          }}
        >
          '{label}'
        </div>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--font-xs)",
            color: "var(--muted)",
            marginTop: "2px",
          }}
        >
          {pattern.thisWeekOccurrences} mentions this week
          {pattern.doneCount > 0 && ` · ${pattern.doneCount} done`}
          {pattern.pushedCount > 0 && ` · ${pattern.pushedCount} pushed`}
          {pattern.droppedCount > 0 && ` · ${pattern.droppedCount} dropped`}
        </div>
      </div>
      {hasStreak && (
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--font-xs)",
            color: "var(--danger)",
            background: "var(--danger-muted)",
            padding: "2px 8px",
            borderRadius: "var(--radius)",
            flexShrink: 0,
          }}
        >
          {pattern.consecutivePushes} pushes
        </span>
      )}
    </div>
  );
}
