import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getColors, sizes, spacing, radius } from "../lib/theme";
import { getAuth, subscribeAuth, signOut, type AuthState } from "../lib/auth";
import {
  subscribeSyncStatus,
  syncNow,
  bootstrapPush,
  type SyncStatus,
} from "../lib/sync";
import { reclassifyEntries } from "../lib/store";
import { getGeminiApiKeySync, loadSecrets, setGeminiApiKey } from "../lib/secrets";
import { classifyWithGemini } from "@accountability/llm";
import {
  getNightTime,
  scheduleNightReminder,
  requestNotifPermission,
} from "../lib/reminder";

interface Props {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function SettingsScreen({ theme, onToggleTheme }: Props) {
  const c = getColors(theme);
  const insets = useSafeAreaInsets();
  const [auth, setAuth] = useState<AuthState>(getAuth());
  const [sync, setSync] = useState<SyncStatus>({ enabled: false, pendingCount: 0 });
  const [nightTime, setNightTime] = useState(getNightTime());
  const [geminiKey, setGeminiKey] = useState(
    getGeminiApiKeySync() ?? ""
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => subscribeAuth(setAuth), []);
  useEffect(() => subscribeSyncStatus(setSync), []);
  useEffect(() => {
    void loadSecrets().then(() => setGeminiKey(getGeminiApiKeySync() ?? ""));
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleSaveReminder = async () => {
    setBusy("reminder");
    try {
      const ok = await requestNotifPermission();
      if (!ok) {
        showToast("notification permission denied");
        return;
      }
      await scheduleNightReminder(nightTime);
      showToast("reminder saved");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveGemini = async () => {
    await setGeminiApiKey(geminiKey);
    showToast("saved");
  };

  const handleReanalyze = async () => {
    setBusy("reanalyze");
    try {
      const count = await reclassifyEntries();
      showToast(`reanalyzed ${count} entries`);
    } catch (err: any) {
      showToast(String(err?.message ?? err));
    } finally {
      setBusy(null);
    }
  };

  const handleTestGemini = async () => {
    const key = geminiKey.trim();
    if (!key) {
      showToast("paste a Gemini key first");
      return;
    }
    setBusy("test-gemini");
    try {
      const result = await classifyWithGemini("Hooked", key);
      const ok = result.kind === "reference" || result.referenceType === "book";
      showToast(
        ok
          ? `Gemini works: Hooked -> ${result.referenceType || result.kind}`
          : `Gemini replied: ${result.kind}`
      );
    } catch (err: any) {
      showToast(`Gemini failed: ${String(err?.message ?? err).slice(0, 90)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleSyncNow = async () => {
    setBusy("sync");
    const res = await syncNow();
    setBusy(null);
    if (res.error) showToast(res.error);
    else showToast(`pulled ${res.pulled} change${res.pulled === 1 ? "" : "s"}`);
  };

  const handleBootstrap = async () => {
    setBusy("bootstrap");
    try {
      const pushed = await bootstrapPush();
      showToast(`uploaded ${pushed} items`);
    } catch (err: any) {
      showToast(String(err?.message ?? err));
    } finally {
      setBusy(null);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      "sign out?",
      "your notes stay on the server (encrypted). you can sign back in anytime.",
      [
        { text: "cancel", style: "cancel" },
        {
          text: "sign out",
          style: "destructive",
          onPress: () => void signOut(),
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: c.bg }]}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: spacing.xxxl + insets.bottom },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.heading, { color: c.ink }]}>Settings</Text>

      <SectionLabel label="account" color={c.muted} />
      <Card borderColor={c.divider} bg={c.surface}>
        <Row
          label="signed in as"
          color={c.muted}
          value={auth.user?.email ?? "—"}
          valueColor={c.ink}
        />
        <Divider color={c.divider} />
        <TouchableOpacity
          onPress={handleSignOut}
          style={styles.cardBtn}
        >
          <Text style={[styles.cardBtnText, { color: c.danger }]}>
            sign out
          </Text>
        </TouchableOpacity>
      </Card>

      <SectionLabel label="sync" color={c.muted} />
      <Card borderColor={c.divider} bg={c.surface}>
        <Row
          label="status"
          color={c.muted}
          value={sync.enabled ? (sync.lastError ? "error" : "active") : "off"}
          valueColor={
            sync.enabled
              ? sync.lastError
                ? c.danger
                : c.accent
              : c.muted
          }
        />
        {sync.lastSyncAt ? (
          <>
            <Divider color={c.divider} />
            <Row
              label="last sync"
              color={c.muted}
              value={sync.lastSyncAt.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              valueColor={c.ink}
            />
          </>
        ) : null}
        {sync.pendingCount > 0 ? (
          <>
            <Divider color={c.divider} />
            <Row
              label="pending"
              color={c.muted}
              value={`${sync.pendingCount}`}
              valueColor={c.muted}
            />
          </>
        ) : null}
        {sync.lastError ? (
          <>
            <Divider color={c.divider} />
            <Text
              style={[
                styles.errorText,
                { color: c.danger, padding: spacing.md },
              ]}
            >
              {sync.lastError}
            </Text>
          </>
        ) : null}
        <Divider color={c.divider} />
        <TouchableOpacity
          onPress={handleSyncNow}
          style={styles.cardBtn}
          disabled={busy === "sync"}
        >
          {busy === "sync" ? (
            <ActivityIndicator color={c.ink} />
          ) : (
            <Text style={[styles.cardBtnText, { color: c.ink }]}>
              sync now
            </Text>
          )}
        </TouchableOpacity>
        <Divider color={c.divider} />
        <TouchableOpacity
          onPress={handleBootstrap}
          style={styles.cardBtn}
          disabled={busy === "bootstrap"}
        >
          {busy === "bootstrap" ? (
            <ActivityIndicator color={c.ink} />
          ) : (
            <Text style={[styles.cardBtnText, { color: c.ink }]}>
              upload local history
            </Text>
          )}
        </TouchableOpacity>
      </Card>

      <SectionLabel label="Close reminder" color={c.muted} />
      <Card borderColor={c.divider} bg={c.surface}>
        <View style={styles.rowWrap}>
          <Text style={[styles.rowLabel, { color: c.muted }]}>reminder at</Text>
          <TextInput
            value={nightTime}
            onChangeText={setNightTime}
            placeholder="22:00"
            placeholderTextColor={c.subtle}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            style={[
              styles.smallInput,
              {
                borderColor: c.divider,
                backgroundColor: c.surfaceAlt,
                color: c.ink,
              },
            ]}
          />
        </View>
        <Divider color={c.divider} />
        <TouchableOpacity
          onPress={handleSaveReminder}
          style={styles.cardBtn}
          disabled={busy === "reminder"}
        >
          {busy === "reminder" ? (
            <ActivityIndicator color={c.ink} />
          ) : (
            <Text style={[styles.cardBtnText, { color: c.ink }]}>
              save reminder
            </Text>
          )}
        </TouchableOpacity>
      </Card>

      <SectionLabel label="Gemini" color={c.muted} />
      <Card borderColor={c.divider} bg={c.surface}>
        <View style={{ padding: spacing.md }}>
          <Text style={[styles.rowLabel, { color: c.muted, marginBottom: spacing.xs }]}>
            api key
          </Text>
          <TextInput
            value={geminiKey}
            onChangeText={setGeminiKey}
            placeholder="paste gemini api key"
            placeholderTextColor={c.subtle}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.wideInput,
              {
                borderColor: c.divider,
                backgroundColor: c.surfaceAlt,
                color: c.ink,
              },
            ]}
          />
        </View>
        <Divider color={c.divider} />
        <TouchableOpacity onPress={handleSaveGemini} style={styles.cardBtn}>
          <Text style={[styles.cardBtnText, { color: c.ink }]}>save</Text>
        </TouchableOpacity>
        <Divider color={c.divider} />
        <TouchableOpacity
          onPress={handleTestGemini}
          style={styles.cardBtn}
          disabled={busy === "test-gemini"}
        >
          {busy === "test-gemini" ? (
            <ActivityIndicator color={c.ink} />
          ) : (
            <Text style={[styles.cardBtnText, { color: c.ink }]}>
              test Gemini key
            </Text>
          )}
        </TouchableOpacity>
        <Divider color={c.divider} />
        <TouchableOpacity
          onPress={handleReanalyze}
          style={styles.cardBtn}
          disabled={busy === "reanalyze"}
        >
          {busy === "reanalyze" ? (
            <ActivityIndicator color={c.ink} />
          ) : (
            <Text style={[styles.cardBtnText, { color: c.ink }]}>
              reanalyze last 10 entries
            </Text>
          )}
        </TouchableOpacity>
      </Card>

      <SectionLabel label="appearance" color={c.muted} />
      <Card borderColor={c.divider} bg={c.surface}>
        <TouchableOpacity onPress={onToggleTheme} style={styles.cardBtn}>
          <Text style={[styles.cardBtnText, { color: c.ink }]}>
            theme: {theme}
          </Text>
        </TouchableOpacity>
      </Card>

      {toast ? (
        <View style={[styles.toast, { backgroundColor: c.ink }]}>
          <Text style={[styles.toastText, { color: c.bg }]}>{toast}</Text>
        </View>
      ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text style={[styles.sectionLabel, { color }]}>{label}</Text>
  );
}

function Card({
  children,
  borderColor,
  bg,
}: {
  children: React.ReactNode;
  borderColor: string;
  bg: string;
}) {
  return (
    <View style={[styles.card, { borderColor, backgroundColor: bg }]}>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  color,
  valueColor,
}: {
  label: string;
  value: string;
  color: string;
  valueColor: string;
}) {
  return (
    <View style={styles.rowWrap}>
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  heading: {
    fontFamily: "serif",
    fontSize: sizes.xl,
    fontWeight: "500",
    letterSpacing: -0.3,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontFamily: "sans-serif",
    fontSize: sizes.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  rowWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    minHeight: 52,
  },
  rowLabel: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
  },
  rowValue: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
  },
  divider: { height: 1, width: "100%" },
  cardBtn: {
    padding: spacing.md,
    alignItems: "flex-start",
    minHeight: 52,
    justifyContent: "center",
  },
  cardBtnText: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
    fontWeight: "500",
  },
  smallInput: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.sm,
    width: 96,
    textAlign: "center",
  },
  wideInput: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.sm,
    width: "100%",
  },
  errorText: {
    fontFamily: "sans-serif",
    fontSize: sizes.xs,
  },
  toast: {
    position: "absolute",
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  toastText: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
  },
});
