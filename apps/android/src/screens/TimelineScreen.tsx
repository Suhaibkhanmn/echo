import React, { useEffect, useMemo, useState } from "react";
import {
  SectionList,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  deleteEntry,
  getAllEntries,
  searchEntries,
  subscribe,
  type Entry,
} from "../lib/store";
import { getColors, radius, sizes, spacing } from "../lib/theme";

interface Props {
  theme: "light" | "dark";
}

export function TimelineScreen({ theme }: Props) {
  const c = getColors(theme);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const refresh = () =>
      setEntries(
        getAllEntries().sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )
      );
    refresh();
    const unsubscribe = subscribe(refresh);
    return () => {
      unsubscribe();
    };
  }, []);

  const displayed = useMemo(() => {
    if (!query.trim()) return entries;
    return searchEntries(query).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }, [entries, query]);

  const sections = useMemo(() => {
    const groups = new Map<string, Entry[]>();
    for (const entry of displayed) {
      const key = entry.createdAt.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([title, data]) => ({
      title,
      data,
    }));
  }, [displayed]);

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
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: c.ink }]}>Log</Text>
        <Text style={[styles.sub, { color: c.muted }]}>
          Search exact words or rough meaning.
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing.xl }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="doctor, money, family..."
          placeholderTextColor={c.subtle}
          style={[
            styles.search,
            {
              backgroundColor: c.surface,
              borderColor: c.divider,
              color: c.ink,
            },
          ]}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section }) => (
          <View style={{ backgroundColor: c.bg }}>
            <Text style={[styles.sectionTitle, { color: c.muted }]}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.86}
            onLongPress={() => confirmDelete(item)}
            style={[
              styles.card,
              { backgroundColor: c.surface, borderColor: c.divider },
            ]}
          >
            <View style={styles.cardMetaRow}>
              <Text style={[styles.cardTime, { color: c.subtle }]}>
                {item.createdAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {item.device === "desktop" ? "  /  desktop" : ""}
              </Text>
            </View>
            <Text style={[styles.cardContent, { color: c.ink }]}>
              {item.content}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={[styles.empty, { color: c.subtle }]}>
              {query ? "no matches." : "nothing yet."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  heading: {
    fontFamily: "serif",
    fontSize: sizes.xl,
    fontWeight: "500",
  },
  sub: {
    fontFamily: "serif",
    fontSize: sizes.sm,
    marginTop: spacing.xs,
  },
  search: {
    fontFamily: "sans-serif",
    fontSize: sizes.base,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 48,
    marginBottom: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  sectionTitle: {
    fontFamily: "sans-serif",
    fontSize: sizes.xs,
    textTransform: "uppercase",
    paddingVertical: spacing.md,
  },
  card: {
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  cardMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  cardTime: {
    flexShrink: 1,
    fontFamily: "sans-serif",
    fontSize: sizes.xs,
  },
  cardContent: {
    fontFamily: "serif",
    fontSize: sizes.base,
    lineHeight: sizes.base * 1.45,
  },
  emptyWrap: {
    paddingTop: spacing.xxxl,
    alignItems: "center",
  },
  empty: {
    fontFamily: "serif",
    fontSize: sizes.base,
  },
});
