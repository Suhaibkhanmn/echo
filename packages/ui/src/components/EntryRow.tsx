import React from "react";

interface EntryRowProps {
  time: string;
  content: string;
  clusterLabel?: string;
  summary?: string;
  salienceScore?: number;
  onDelete?: () => void;
}

export function EntryRow({ time, content, clusterLabel, summary, onDelete }: EntryRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--sp-md)",
        padding: "var(--sp-sm) 0",
        borderBottom: "1px solid var(--divider)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--font-xs)",
          color: "var(--muted)",
          flexShrink: 0,
          width: "48px",
        }}
      >
        {time}
      </span>
      <div
        style={{
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "var(--font-base)",
            overflowWrap: "anywhere",
          }}
        >
          {content}
        </div>
        {summary && summary !== content && (
          <div
            style={{
              marginTop: 4,
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-xs)",
              lineHeight: 1.4,
              color: "var(--muted)",
              overflowWrap: "anywhere",
            }}
          >
            {summary}
          </div>
        )}
      </div>
      {clusterLabel && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            maxWidth: "160px",
            flexShrink: 0,
          }}
        >
          <Chip>{clusterLabel}</Chip>
        </div>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="delete entry"
          title="delete"
          style={{
            border: "none",
            background: "transparent",
            color: "var(--muted)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--font-sm)",
            lineHeight: 1,
            padding: 4,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--font-xs)",
        color: "var(--accent)",
        background: "var(--accent-muted)",
        border: "1px solid var(--divider)",
        padding: "2px 8px",
        borderRadius: "var(--radius)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
