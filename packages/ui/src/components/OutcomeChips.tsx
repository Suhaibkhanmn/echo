import React from "react";
import type { Outcome } from "@accountability/core";

interface OutcomeChipsProps {
  onSelect: (outcome: Outcome) => void;
  showLinked?: boolean;
}

const CHIPS: Array<{ outcome: Outcome; label: string }> = [
  { outcome: "did", label: "did it" },
  { outcome: "pushed", label: "pushed" },
  { outcome: "dropped", label: "dropped" },
  { outcome: "just_noted", label: "just noted" },
  { outcome: "linked", label: "link to..." },
];

export function OutcomeChips({ onSelect, showLinked = false }: OutcomeChipsProps) {
  const chips = showLinked ? CHIPS : CHIPS.filter((c) => c.outcome !== "linked");

  return (
    <div style={{ display: "flex", gap: "var(--sp-sm)", flexWrap: "wrap" }}>
      {chips.map((chip) => (
        <button
          key={chip.outcome}
          onClick={() => onSelect(chip.outcome)}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--font-sm)",
            padding: "4px 12px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--divider)",
            background: "var(--surface)",
            color: "var(--ink)",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseOver={(e) => {
            (e.target as HTMLElement).style.background = "var(--accent-muted)";
          }}
          onMouseOut={(e) => {
            (e.target as HTMLElement).style.background = "var(--surface)";
          }}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
