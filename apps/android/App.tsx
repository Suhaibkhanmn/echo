import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { CaptureScreen } from "./src/screens/CaptureScreen";
import { TimelineScreen } from "./src/screens/TimelineScreen";
import { WalkThroughScreen } from "./src/screens/WalkThroughScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { getColors, sizes, spacing, radius } from "./src/lib/theme";
import {
  getCloseWindowCount,
  getTodayCount,
  subscribe,
  loadStore,
  lockStoreMemory,
} from "./src/lib/store";
import {
  bootstrapAuth,
  subscribeAuth,
  type AuthState,
} from "./src/lib/auth";
import { startSyncLoop, syncNow } from "./src/lib/sync";
import {
  configureNotifHandler,
  scheduleMorningCarryover,
  scheduleNightReminder,
  getNightTime,
} from "./src/lib/reminder";
import { loadSecrets } from "./src/lib/secrets";
import { useKeyboardInset } from "./src/lib/useKeyboardInset";

type Tab = "capture" | "timeline" | "tonight" | "settings";

configureNotifHandler();

function AppContent() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("capture");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [count, setCount] = useState(0);
  const [closeCount, setCloseCount] = useState(0);
  const keyboardInset = useKeyboardInset();
  const keyboardVisible = keyboardInset > 0;
  const [auth, setAuth] = useState<AuthState>({
    user: null,
    encKey: null,
    accessToken: null,
    refreshToken: null,
    ready: false,
  });

  useEffect(() => {
    void bootstrapAuth();
    void loadSecrets();
    const refreshCounts = () => {
      setCount(getTodayCount());
      setCloseCount(getCloseWindowCount());
    };
    const unsubscribe = subscribe(refreshCounts);
    refreshCounts();
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.user || !auth.encKey) {
      lockStoreMemory();
      setCount(0);
      setCloseCount(0);
      return;
    }
    loadStore();
    setCount(getTodayCount());
    setCloseCount(getCloseWindowCount());
  }, [auth.ready, auth.user?.id, !!auth.encKey]);

  useEffect(() => subscribeAuth(setAuth), []);

  useEffect(() => {
    if (!auth.user || !auth.encKey) return;
    const stop = startSyncLoop();
    void syncNow();
    void scheduleNightReminder(getNightTime()).catch(() => {});
    void scheduleMorningCarryover().catch(() => {});
    return stop;
  }, [auth.user?.id, !!auth.encKey]);

  const c = getColors(theme);

  if (!auth.ready) {
    return (
      <View style={[styles.bootWrap, { backgroundColor: c.bg }]}>
        <StatusBar
          barStyle={theme === "dark" ? "light-content" : "dark-content"}
          backgroundColor={c.bg}
        />
        <ActivityIndicator color={c.ink} />
      </View>
    );
  }

  if (!auth.user) {
    return (
      <View style={[styles.safe, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <StatusBar
          barStyle={theme === "dark" ? "light-content" : "dark-content"}
          backgroundColor={c.bg}
        />
        <AuthScreen theme={theme} />
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={c.bg}
      />

      <View style={[styles.content, { paddingTop: insets.top }]}>
        {tab === "capture" && <CaptureScreen theme={theme} />}
        {tab === "timeline" && <TimelineScreen theme={theme} />}
        {tab === "tonight" && <WalkThroughScreen theme={theme} />}
        {tab === "settings" && (
          <SettingsScreen
            theme={theme}
            onToggleTheme={() =>
              setTheme((t) => (t === "light" ? "dark" : "light"))
            }
          />
        )}
      </View>

      {!keyboardVisible ? (
        <View
          style={[
            styles.tabBar,
            {
              borderTopColor: c.divider,
              backgroundColor: c.bg,
              paddingBottom: Math.max(insets.bottom, spacing.xs),
              paddingTop: spacing.sm,
            },
          ]}
        >
          <TabButton label="Today" active={tab === "capture"} onPress={() => setTab("capture")} color={c} />
          <TabButton label="Log" active={tab === "timeline"} onPress={() => setTab("timeline")} color={c} />
          <TabButton
            label="Close"
            active={tab === "tonight"}
            onPress={() => setTab("tonight")}
            color={c}
            badge={closeCount > 0 ? closeCount : undefined}
          />
          <TabButton label="Settings" active={tab === "settings"} onPress={() => setTab("settings")} color={c} />
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function TabButton({
  label,
  active,
  onPress,
  color,
  badge,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  color: ReturnType<typeof getColors>;
  badge?: number;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.tabBtn}>
      <View
        style={[
          styles.tabInner,
          { backgroundColor: active ? color.surfaceAlt : "transparent" },
        ]}
      >
        <Text
          style={[
            styles.tabLabel,
            {
              color: active ? color.ink : color.muted,
              fontWeight: active ? "600" : "400",
            },
          ]}
        >
          {label}
        </Text>
        {badge !== undefined ? (
          <View style={[styles.badge, { backgroundColor: color.accent }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  bootWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.xs,
    minWidth: 0,
  },
  tabInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: 6,
    minHeight: 44,
  },
  tabLabel: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
    letterSpacing: 0.2,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFF",
    fontSize: 11,
    fontFamily: "sans-serif",
    fontWeight: "600",
  },
});
