import React, { useState, useEffect } from "react";
import { exportMarkdown, reclassifyEntries } from "../store";
import { classifyWithGemini } from "@accountability/llm";
import {
  subscribeSyncStatus,
  syncNow,
  bootstrapPush,
  type SyncStatus,
} from "../sync";
import { subscribeAuth, signOut, type AuthState } from "../auth";

interface SettingsProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function Settings({ theme, onToggleTheme }: SettingsProps) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_api_key") ?? "");
  const [llmEnabled, setLlmEnabled] = useState(() => localStorage.getItem("llm_enabled") === "true");
  const [nightTime, setNightTime] = useState(() => localStorage.getItem("night_time") ?? "22:00");
  const [saved, setSaved] = useState(false);

  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [auth, setAuth] = useState<AuthState>({
    user: null,
    accessToken: null,
    passphrase: null,
    ready: false,
  });
  const [syncMsg, setSyncMsg] = useState("");

  useEffect(() => subscribeSyncStatus(setSyncStatus), []);
  useEffect(() => subscribeAuth(setAuth), []);

  const handleSave = () => {
    localStorage.setItem("gemini_api_key", apiKey);
    localStorage.setItem("llm_enabled", String(llmEnabled));
    localStorage.setItem("night_time", nightTime);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReanalyze = async () => {
    setSaved(false);
    const count = await reclassifyEntries();
    setSyncMsg(`reanalyzed ${count} entries.`);
  };

  const handleTestGemini = async () => {
    const key = apiKey.trim();
    if (!key) {
      setSyncMsg("paste a Gemini key first.");
      return;
    }
    setSyncMsg("testing Gemini...");
    try {
      const result = await classifyWithGemini("Hooked", key);
      const ok = result.kind === "reference" || result.referenceType === "book";
      setSyncMsg(
        ok
          ? `Gemini works: Hooked -> ${result.referenceType || result.kind}.`
          : `Gemini replied: ${result.kind}.`
      );
    } catch (err: any) {
      setSyncMsg(`Gemini failed: ${String(err?.message ?? err).slice(0, 120)}`);
    }
  };

  const handleSyncNow = async () => {
    setSyncMsg("syncing...");
    const r = await syncNow();
    setSyncMsg(r.error ? `error: ${r.error}` : `pulled ${r.pulled} events.`);
  };

  const handleBootstrap = async () => {
    setSyncMsg("uploading local history (encrypted)...");
    try {
      const pushed = await bootstrapPush();
      setSyncMsg(`uploaded ${pushed} items.`);
    } catch (err: any) {
      setSyncMsg(`error: ${err?.message ?? err}`);
    }
  };

  const handleExport = () => {
    const md = exportMarkdown();
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `echo-export-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: "var(--sp-lg)" }}>
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "var(--font-lg)",
          fontWeight: 500,
          marginBottom: "var(--sp-lg)",
        }}
      >
        Settings
      </h2>

      <Section label="appearance">
        <Row label="theme">
          <button
            onClick={onToggleTheme}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              padding: "4px 12px",
              background: "var(--surface)",
              border: "1px solid var(--divider)",
              borderRadius: "var(--radius)",
              color: "var(--ink)",
              cursor: "pointer",
            }}
          >
            {theme}
          </button>
        </Row>
      </Section>

      <Section label="Close reminder">
        <Row label="time">
          <input
            type="time"
            value={nightTime}
            onChange={(e) => setNightTime(e.target.value)}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              padding: "4px 8px",
              background: "var(--surface)",
              border: "1px solid var(--divider)",
              borderRadius: "var(--radius)",
              color: "var(--ink)",
            }}
          />
        </Row>
        <Row label="use LLM">
          <button
            onClick={() => setLlmEnabled(!llmEnabled)}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              padding: "4px 12px",
              background: llmEnabled ? "var(--accent-muted)" : "var(--surface)",
              border: `1px solid ${llmEnabled ? "var(--accent)" : "var(--divider)"}`,
              borderRadius: "var(--radius)",
              color: llmEnabled ? "var(--accent)" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            {llmEnabled ? "on" : "off"}
          </button>
        </Row>
        {llmEnabled && (
          <>
            <Row label="gemini API key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza..."
                style={{
                  width: "200px",
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--font-sm)",
                  padding: "4px 8px",
                  background: "var(--surface)",
                  border: "1px solid var(--divider)",
                  borderRadius: "var(--radius)",
                  color: "var(--ink)",
                }}
              />
            </Row>
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--font-xs)",
                color: "var(--muted)",
                paddingLeft: "0",
                paddingBottom: "var(--sp-sm)",
              }}
            >
              Echo uses Gemini 3.1 Flash Lite and keeps calls low. get a key at{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent)" }}
              >
                aistudio.google.com
              </a>
              .
            </div>
            <Row label="reanalyze">
              <button
                onClick={handleReanalyze}
                style={smallBtnStyle}
              >
                last 10 entries
              </button>
            </Row>
            <Row label="test Gemini">
              <button
                onClick={handleTestGemini}
                style={smallBtnStyle}
              >
                test key
              </button>
            </Row>
          </>
        )}
      </Section>

      <Section label="account">
        <Row label="signed in as">
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              color: "var(--ink)",
            }}
          >
            {auth.user?.email ?? "—"}
          </span>
        </Row>
        <Row label="">
          <button
            onClick={() => signOut()}
            style={{ ...smallBtnStyle, color: "var(--danger, #b33)" }}
          >
            sign out
          </button>
        </Row>
      </Section>

      <Section label="sync">
        <Row label="status">
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              color: syncStatus?.lastError
                ? "var(--danger, #b33)"
                : syncStatus?.enabled
                  ? "var(--accent)"
                  : "var(--muted)",
            }}
          >
            {syncStatus?.lastError
              ? "error"
              : syncStatus?.enabled
                ? "active"
                : "off"}
          </span>
        </Row>
        {syncStatus?.lastSyncAt && (
          <Row label="last sync">
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "var(--font-sm)",
                color: "var(--ink)",
              }}
            >
              {syncStatus.lastSyncAt.toLocaleTimeString()}
            </span>
          </Row>
        )}
        {syncStatus?.lastError && (
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-xs)",
              color: "var(--danger, #b33)",
              padding: "var(--sp-xs) 0",
            }}
          >
            {syncStatus.lastError}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={async () => {
              setSyncMsg("syncing...");
              const r = await syncNow();
              setSyncMsg(
                r.error ? `error: ${r.error}` : `pulled ${r.pulled} events.`
              );
            }}
            style={smallBtnStyle}
          >
            sync now
          </button>
          <button
            onClick={async () => {
              setSyncMsg("uploading local history (encrypted)...");
              try {
                const pushed = await bootstrapPush();
                setSyncMsg(`uploaded ${pushed} items.`);
              } catch (err: any) {
                setSyncMsg(`error: ${err?.message ?? err}`);
              }
            }}
            style={smallBtnStyle}
          >
            upload local history
          </button>
        </div>
        {syncMsg && (
          <div
            style={{
              marginTop: 6,
              fontSize: "var(--font-xs)",
              color: "var(--muted)",
            }}
          >
            {syncMsg}
          </div>
        )}
      </Section>

      <Section label="data">
        <Row label="export markdown">
          <button
            onClick={handleExport}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              padding: "4px 12px",
              background: "var(--surface)",
              border: "1px solid var(--divider)",
              borderRadius: "var(--radius)",
              color: "var(--ink)",
              cursor: "pointer",
            }}
          >
            download .md
          </button>
        </Row>
        <Row label="backup">
          <button
            onClick={() => {
              const data = localStorage.getItem("accountability_data");
              if (!data) return;
              const blob = new Blob([data], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `echo-backup-${new Date().toISOString().split("T")[0]}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              padding: "4px 12px",
              background: "var(--surface)",
              border: "1px solid var(--divider)",
              borderRadius: "var(--radius)",
              color: "var(--ink)",
              cursor: "pointer",
            }}
          >
            download .json
          </button>
        </Row>
        <Row label="restore">
          <button
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".json";
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const data = reader.result as string;
                    JSON.parse(data);
                    localStorage.setItem("accountability_data", data);
                    window.location.reload();
                  } catch {
                    alert("Invalid backup file.");
                  }
                };
                reader.readAsText(file);
              };
              input.click();
            }}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              padding: "4px 12px",
              background: "var(--surface)",
              border: "1px solid var(--divider)",
              borderRadius: "var(--radius)",
              color: "var(--ink)",
              cursor: "pointer",
            }}
          >
            upload .json
          </button>
        </Row>
      </Section>

      <div style={{ marginTop: "var(--sp-lg)" }}>
        <button
          onClick={handleSave}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--font-sm)",
            padding: "var(--sp-sm) var(--sp-lg)",
            background: "var(--ink)",
            color: "var(--bg)",
            border: "none",
            borderRadius: "var(--radius)",
            cursor: "pointer",
          }}
        >
          {saved ? "saved" : "save"}
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "var(--sp-lg)" }}>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--font-xs)",
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "var(--sp-sm)",
          paddingBottom: "var(--sp-xs)",
          borderBottom: "1px solid var(--divider)",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--font-xs)",
  padding: "4px 10px",
  background: "var(--surface)",
  border: "1px solid var(--divider)",
  borderRadius: "var(--radius)",
  color: "var(--ink)",
  cursor: "pointer",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--sp-sm) 0",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--font-sm)",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
