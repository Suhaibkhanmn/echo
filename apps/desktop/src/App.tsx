import React, { useState, useEffect } from "react";
import { Capture } from "./screens/Capture";
import { Timeline } from "./screens/Timeline";
import { WalkThrough } from "./screens/WalkThrough";
import { Settings } from "./screens/Settings";
import { Auth } from "./screens/Auth";
import { load, getTodayCount, getCloseCount, subscribe, setLocalEncryptionPassphrase, lockStoreMemory } from "./store";
import { startSyncLoop } from "./sync";
import { startReminderLoop, onReminderFired } from "./reminder";
import { bootstrapAuth, subscribeAuth, type AuthState } from "./auth";

type Screen = "capture" | "timeline" | "walkthrough" | "settings";

export function App() {
  const [screen, setScreen] = useState<Screen>("capture");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("theme") as "light" | "dark") ?? "light";
  });
  const [, setStoreVersion] = useState(0);
  const [auth, setAuth] = useState<AuthState>({
    user: null,
    accessToken: null,
    passphrase: null,
    ready: false,
  });

  useEffect(() => {
    bootstrapAuth();
  }, []);

  useEffect(() => subscribeAuth(setAuth), []);

  useEffect(() => {
    return subscribe(() => setStoreVersion((version) => version + 1));
  }, []);

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.user || !auth.passphrase) {
      lockStoreMemory();
      setStoreVersion((version) => version + 1);
      return;
    }
    void (async () => {
      await setLocalEncryptionPassphrase(auth.passphrase);
      await load();
      setStoreVersion((version) => version + 1);
    })();
  }, [auth.ready, auth.user?.id, auth.passphrase]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { register, isRegistered, unregister } = await import(
          "@tauri-apps/plugin-global-shortcut"
        );
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const accel = "CommandOrControl+Shift+Space";
        if (await isRegistered(accel)) {
          await unregister(accel);
        }
        await register(accel, async (event) => {
          if (event.state !== "Pressed") return;
          const win = getCurrentWindow();
          try {
            await win.unminimize();
          } catch {}
          await win.show();
          await win.setFocus();
          setScreen("capture");
        });
        cleanup = () => {
          unregister(accel).catch(() => {});
        };
      } catch (err) {
        console.warn("global shortcut unavailable:", err);
        const handler = (e: KeyboardEvent) => {
          if (e.ctrlKey && e.shiftKey && e.code === "Space") {
            e.preventDefault();
            setScreen("capture");
          }
        };
        window.addEventListener("keydown", handler);
        cleanup = () => window.removeEventListener("keydown", handler);
      }
    })();
    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const stop = startSyncLoop();
    return () => {
      stop();
    };
  }, []);

  useEffect(() => {
    const stopReminder = startReminderLoop();
    const offFired = onReminderFired(async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        try {
          await win.unminimize();
        } catch {}
        await win.show();
        await win.setFocus();
      } catch {}
      setScreen("walkthrough");
    });
    return () => {
      stopReminder();
      offFired();
    };
  }, []);

  if (!auth.ready) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
          color: "var(--muted)",
          fontFamily: "var(--font-sans)",
        }}
      >
        ...
      </div>
    );
  }

  if (!auth.user) {
    return <Auth />;
  }

  const navCount = screen === "walkthrough" ? getCloseCount() : getTodayCount();
  const navCountLabel = screen === "walkthrough" ? `${navCount} open` : `${navCount} today`;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--sp-sm) var(--sp-md)",
          borderBottom: "1px solid var(--divider)",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--font-sm)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: "var(--sp-md)", alignItems: "center" }}>
          <div
            aria-hidden
            style={{
              width: 22,
              height: 22,
              background: "#000",
              color: "#fff",
              borderRadius: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-serif)",
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1,
              marginRight: 2,
            }}
          >
            e
          </div>
          <NavButton active={screen === "capture"} onClick={() => setScreen("capture")}>
            Today
          </NavButton>
          <NavButton active={screen === "timeline"} onClick={() => setScreen("timeline")}>
            Log
          </NavButton>
          <NavButton active={screen === "walkthrough"} onClick={() => setScreen("walkthrough")}>
            Close
          </NavButton>
          <NavButton active={screen === "settings"} onClick={() => setScreen("settings")}>
            Settings
          </NavButton>
        </div>
        <span style={{ color: "var(--muted)" }}>{navCountLabel}</span>
      </nav>

      <main style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "720px" }}>
          {screen === "capture" && <Capture onCaptured={() => setStoreVersion((version) => version + 1)} />}
          {screen === "timeline" && <Timeline />}
          {screen === "walkthrough" && <WalkThrough />}
          {screen === "settings" && (
            <Settings
              theme={theme}
              onToggleTheme={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: "4px 0",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--font-sm)",
        color: active ? "var(--ink)" : "var(--muted)",
        borderBottom: active ? "1px solid var(--ink)" : "1px solid transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
