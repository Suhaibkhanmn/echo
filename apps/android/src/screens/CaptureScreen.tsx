import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addEntry,
  deleteEntry,
  getMorningCarryover,
  getTodayEntries,
  subscribe,
  type Entry,
} from "../lib/store";
import { getColors, radius, sizes, spacing } from "../lib/theme";

interface Props {
  theme: "light" | "dark";
}

export function CaptureScreen({ theme }: Props) {
  const c = getColors(theme);
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState("");
  const [recent, setRecent] = useState<Entry[]>([]);
  const [carryCount, setCarryCount] = useState(0);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const refresh = () => {
      setRecent(getTodayEntries().slice(-20).reverse());
      setCarryCount(getMorningCarryover().length);
    };
    refresh();
    const unsubscribe = subscribe(refresh);
    return () => {
      unsubscribe();
    };
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      addEntry(trimmed, "text");
      setValue("");
    } catch (err) {
      console.warn("addEntry failed", err);
    }
  };

  const confirmDelete = (entry: Entry) => {
    Alert.alert("delete this?", entry.content, [
      { text: "cancel", style: "cancel" },
      {
        text: "delete",
        style: "destructive",
        onPress: () => deleteEntry(entry.id),
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
      style={[styles.container, { backgroundColor: c.bg }]}
    >
      <View style={styles.body}>
        <Text style={[styles.heading, { color: c.ink }]}>Today</Text>
        <Text style={[styles.sub, { color: c.muted }]}>
          {carryCount > 0
            ? `${carryCount} carried from yesterday.`
            : recent.length === 0
              ? "drop whatever's on your mind."
              : `${recent.length} ${recent.length === 1 ? "thing" : "things"} so far.`}
        </Text>

        {recent.length > 0 ? (
          <FlatList
            data={recent}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.86}
                onLongPress={() => confirmDelete(item)}
                style={[
                  styles.noteCard,
                  { backgroundColor: c.surface, borderColor: c.divider },
                ]}
              >
                <View style={styles.noteHeader}>
                  <Text style={[styles.noteTime, { color: c.subtle }]}>
                    {item.createdAt.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <Text style={[styles.noteText, { color: c.ink }]}>
                  {item.content}
                </Text>
              </TouchableOpacity>
            )}
          />
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyHint, { color: c.subtle }]}>
              Drop it here now. Decide what matters later.
            </Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: c.surface,
            borderTopColor: c.divider,
            paddingBottom: Platform.OS === "ios"
              ? Math.max(insets.bottom, spacing.md)
              : spacing.md,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={setValue}
          placeholder="what's on your mind?"
          placeholderTextColor={c.subtle}
          multiline
          style={[
            styles.input,
            { color: c.ink, backgroundColor: c.surfaceAlt },
          ]}
        />
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!value.trim()}
          style={[
            styles.sendBtn,
            {
              backgroundColor: value.trim() ? c.ink : c.divider,
            },
          ]}
        >
          <Text
            style={[
              styles.sendBtnText,
              { color: value.trim() ? c.bg : c.subtle },
            ]}
          >
            add
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  heading: {
    fontFamily: "serif",
    fontSize: sizes.xl,
    fontWeight: "500",
  },
  sub: {
    fontFamily: "serif",
    fontSize: sizes.base,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  list: { paddingBottom: spacing.xxl, gap: spacing.md },
  noteCard: {
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
    gap: spacing.md,
  },
  noteTime: {
    fontFamily: "sans-serif",
    fontSize: sizes.xs,
  },
  noteText: {
    fontFamily: "serif",
    fontSize: sizes.base,
    lineHeight: sizes.base * 1.45,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: spacing.xxxl,
  },
  emptyHint: {
    fontFamily: "serif",
    fontSize: sizes.base,
    textAlign: "center",
    lineHeight: sizes.base * 1.6,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.md,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: "serif",
    fontSize: sizes.base,
    lineHeight: sizes.base * 1.4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    maxHeight: 140,
    minHeight: 48,
  },
  sendBtn: {
    paddingHorizontal: spacing.lg,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
  },
  sendBtnText: {
    fontFamily: "sans-serif",
    fontSize: sizes.sm,
    fontWeight: "600",
  },
});
