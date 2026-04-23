import React, { useState, useMemo, useEffect } from "react";
import { EntryRow } from "@accountability/ui";
import { deleteEntry, getAllEntries, searchEntries, subscribe } from "../store";
import type { Entry } from "@accountability/core";

export function Timeline() {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const refresh = () => {
      setEntries(getAllEntries().reverse());
    };
    refresh();
    return subscribe(refresh);
  }, []);

  const displayed = useMemo(() => {
    if (!query.trim()) return entries;
    return searchEntries(query);
  }, [entries, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Entry[]>();
    for (const entry of displayed) {
      const dateKey = entry.createdAt.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const list = groups.get(dateKey) ?? [];
      list.push(entry);
      groups.set(dateKey, list);
    }
    return groups;
  }, [displayed]);

  return (
    <div style={{ padding: "var(--sp-lg)" }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search entries..."
        style={{
          width: "100%",
          padding: "var(--sp-sm) var(--sp-md)",
          background: "var(--surface)",
          border: "1px solid var(--divider)",
          borderRadius: "var(--radius)",
          color: "var(--ink)",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--font-sm)",
          outline: "none",
          marginBottom: "var(--sp-lg)",
        }}
      />

      {Array.from(grouped.entries()).map(([dateLabel, dayEntries]) => (
        <div key={dateLabel} style={{ marginBottom: "var(--sp-lg)" }}>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-xs)",
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "var(--sp-sm)",
            }}
          >
            {dateLabel}
          </div>
          {dayEntries.map((entry) => (
            <EntryRow
              key={entry.id}
              time={entry.createdAt.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              content={entry.content}
              salienceScore={entry.salienceScore}
              onDelete={() => {
                if (window.confirm(`delete "${entry.content}"?`)) {
                  deleteEntry(entry.id);
                }
              }}
            />
          ))}
        </div>
      ))}

      {displayed.length === 0 && (
        <div
          style={{
            textAlign: "center",
            color: "var(--muted)",
            fontFamily: "var(--font-serif)",
            marginTop: "var(--sp-xxl)",
          }}
        >
          {query ? "no matches." : "nothing yet."}
        </div>
      )}
    </div>
  );
}
