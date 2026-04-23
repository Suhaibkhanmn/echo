import React from "react";
import type { Entry } from "@accountability/core";

interface ClusterChipsProps {
  entries: Entry[];
  onEject?: (entryId: string) => void;
}

export function ClusterChips({ entries, onEject }: ClusterChipsProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--sp-xs)",
        flexWrap: "wrap",
        marginBottom: "var(--sp-sm)",
      }}
    >
      {entries.map((entry) => (
        <span
          key={entry.id}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--font-xs)",
            color: "var(--muted)",
            background: "var(--accent-muted)",
            padding: "2px 8px",
            borderRadius: "var(--radius)",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            maxWidth: "200px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.content.slice(0, 30)}
          {onEject && (
            <button
              onClick={() => onEject(entry.id)}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                padding: 0,
                fontSize: "var(--font-xs)",
                lineHeight: 1,
              }}
              title="remove from cluster"
            >
              x
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
