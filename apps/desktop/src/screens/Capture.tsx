import React, { useState } from "react";
import { CaptureInput } from "@accountability/ui";
import { addEntry, deleteEntry, getTodayEntries } from "../store";

interface CaptureProps {
  onCaptured: () => void;
}

export function Capture({ onCaptured }: CaptureProps) {
  const [flash, setFlash] = useState(false);
  const [recentEntries, setRecentEntries] = useState(() =>
    getTodayEntries().slice(-5).reverse()
  );

  const handleSubmit = (text: string) => {
    addEntry(text, "text");
    setFlash(true);
    setTimeout(() => setFlash(false), 300);
    onCaptured();
    setRecentEntries(getTodayEntries().slice(-5).reverse());
  };

  const handleDelete = (entryId: string, content: string) => {
    if (!window.confirm(`delete "${content}"?`)) return;
    deleteEntry(entryId);
    setRecentEntries(getTodayEntries().slice(-5).reverse());
    onCaptured();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "var(--sp-xl)",
        gap: "var(--sp-xl)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          opacity: flash ? 0.5 : 1,
          transition: "opacity 0.15s",
        }}
      >
        <CaptureInput onSubmit={handleSubmit} placeholder="what's on your mind?" />
      </div>

      {recentEntries.length > 0 && (
        <div
          style={{
            width: "100%",
            maxWidth: "400px",
            marginTop: "var(--sp-lg)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-xs)",
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            recent
          </span>
          <div style={{ marginTop: "var(--sp-sm)" }}>
            {recentEntries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "var(--sp-md)",
                  padding: "var(--sp-xs) 0",
                  borderBottom: "1px solid var(--divider)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--font-xs)",
                    color: "var(--muted)",
                    flexShrink: 0,
                  }}
                >
                  {entry.createdAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "var(--font-base)",
                  }}
                >
                  {entry.content}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(entry.id, entry.content)}
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
                    marginLeft: "auto",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          position: "fixed",
          bottom: "var(--sp-md)",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--font-xs)",
          color: "var(--muted)",
        }}
      >
        ctrl+shift+space to open Today
      </div>
    </div>
  );
}
