import React, { useState } from "react";
import { signIn, signUp, isConfigured } from "../auth";

type Mode = "signin" | "signup";

export function Auth() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = isConfigured();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("email and password required");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") await signUp(email, password);
      else await signIn(email, password);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-xl)",
        background: "var(--bg)",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-md)",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "var(--sp-md)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--sp-sm)",
          }}
        >
          <div
            aria-hidden
            style={{
              width: 48,
              height: 48,
              background: "#000",
              color: "#fff",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-serif)",
              fontSize: 28,
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: 0,
            }}
          >
            e
          </div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "28px",
              margin: 0,
              color: "var(--ink)",
              fontWeight: 500,
              letterSpacing: "-0.5px",
            }}
          >
            echo
          </h1>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "var(--font-base)",
              color: "var(--muted)",
              marginTop: "var(--sp-xs)",
            }}
          >
            {mode === "signup"
              ? "create an account to sync across devices."
              : "sign in to pick up where you left off."}
          </p>
        </div>

        {!configured && (
          <div
            style={{
              padding: "var(--sp-sm)",
              background: "rgba(155, 59, 59, 0.1)",
              border: "1px solid rgba(155, 59, 59, 0.3)",
              borderRadius: 6,
              color: "var(--danger, #9B3B3B)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              textAlign: "center",
            }}
          >
            supabase not configured. sync won't work.
          </div>
        )}

        <label style={labelStyle}>
          email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 6 characters"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            style={inputStyle}
          />
        </label>

        {error && (
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--font-sm)",
              color: "var(--danger, #9B3B3B)",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "var(--sp-md) var(--sp-lg)",
            background: busy ? "var(--muted)" : "var(--ink)",
            color: "var(--bg)",
            border: "none",
            borderRadius: 6,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--font-base)",
            fontWeight: 500,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.8 : 1,
            marginTop: "var(--sp-sm)",
          }}
        >
          {busy
            ? "…"
            : mode === "signup"
              ? "create account"
              : "sign in"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--muted)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--font-sm)",
            cursor: "pointer",
            padding: "var(--sp-sm)",
          }}
        >
          {mode === "signup"
            ? "already have an account? sign in"
            : "new here? create an account"}
        </button>

        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--font-xs)",
            color: "var(--muted)",
            textAlign: "center",
            marginTop: "var(--sp-md)",
            lineHeight: 1.6,
          }}
        >
          data is encrypted on your device before syncing.
          <br />
          only you can read it.
        </p>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--font-xs)",
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const inputStyle: React.CSSProperties = {
  padding: "var(--sp-md)",
  background: "var(--surface)",
  color: "var(--ink)",
  border: "1px solid var(--divider)",
  borderRadius: 6,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--font-base)",
  outline: "none",
  textTransform: "none",
  letterSpacing: 0,
};
