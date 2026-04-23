import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { getColors, sizes, spacing, radius } from "../lib/theme";
import { signIn, signUp, isConfigured } from "../lib/auth";

interface Props {
  theme: "light" | "dark";
}

type Mode = "signin" | "signup";

export function AuthScreen({ theme }: Props) {
  const c = getColors(theme);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = isConfigured();

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("email and password required");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: c.bg }]}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>e</Text>
          </View>
          <Text style={[styles.brand, { color: c.ink }]}>echo</Text>
          <Text style={[styles.tagline, { color: c.muted }]}>
            {mode === "signup"
              ? "create an account to sync across devices."
              : "sign in to pick up where you left off."}
          </Text>
        </View>

        {!configured ? (
          <View style={[styles.warn, { backgroundColor: c.dangerMuted }]}>
            <Text style={[styles.warnText, { color: c.danger }]}>
              supabase not configured. sync won't work.
            </Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <Text style={[styles.label, { color: c.muted }]}>email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={c.subtle}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            style={[
              styles.input,
              {
                backgroundColor: c.surface,
                borderColor: c.divider,
                color: c.ink,
              },
            ]}
          />

          <Text style={[styles.label, { color: c.muted, marginTop: spacing.lg }]}>
            password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="at least 6 characters"
            placeholderTextColor={c.subtle}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={mode === "signup" ? "newPassword" : "password"}
            style={[
              styles.input,
              {
                backgroundColor: c.surface,
                borderColor: c.divider,
                color: c.ink,
              },
            ]}
          />

          {error ? (
            <Text style={[styles.error, { color: c.danger }]}>{error}</Text>
          ) : null}

          <TouchableOpacity
            onPress={submit}
            disabled={busy}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: busy ? c.subtle : c.ink,
                opacity: busy ? 0.8 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={c.bg} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: c.bg }]}>
                {mode === "signup" ? "create account" : "sign in"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError(null);
            }}
            style={styles.switchBtn}
          >
            <Text style={[styles.switchText, { color: c.muted }]}>
              {mode === "signup"
                ? "already have an account? sign in"
                : "new here? create an account"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: c.subtle }]}>
            data is encrypted on your device before syncing. only you can read it.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  header: { marginBottom: spacing.xxl, alignItems: "center" },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  logoMarkText: {
    color: "#fff",
    fontFamily: "serif",
    fontSize: 32,
    fontWeight: "500",
    lineHeight: 34,
  },
  brand: {
    fontFamily: "serif",
    fontSize: sizes.display,
    fontWeight: "500",
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: "serif",
    fontSize: sizes.base,
    marginTop: spacing.sm,
    textAlign: "center",
    lineHeight: sizes.base * 1.5,
  },
  warn: {
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  warnText: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
    textAlign: "center",
  },
  form: {},
  label: {
    fontFamily: "sans-serif",
    fontSize: sizes.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  input: {
    fontFamily: "sans-serif",
    fontSize: sizes.base,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 52,
  },
  error: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
    marginTop: spacing.md,
    textAlign: "center",
  },
  primaryBtn: {
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  primaryBtnText: {
    fontFamily: "sans-serif",
    fontSize: sizes.md,
    fontWeight: "500",
  },
  switchBtn: {
    marginTop: spacing.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  switchText: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
  },
  footer: {
    marginTop: spacing.xxl,
    alignItems: "center",
  },
  footerText: {
    fontFamily: "sans-serif",
    fontSize: sizes.xs,
    textAlign: "center",
    lineHeight: sizes.xs * 1.6,
    maxWidth: 300,
  },
});
