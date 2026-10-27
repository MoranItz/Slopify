import React from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Track } from "../types";
import { colors, formatDuration } from "../theme";

type Props = {
  track: Track;
  onPress: () => void;
  onMorePress?: () => void;
  /** Optional trailing element (e.g. a badge or button) */
  right?: React.ReactNode;
  busy?: boolean;
};

export default function TrackRow({
  track,
  onPress,
  onMorePress,
  right,
  busy,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {track.thumbnail ? (
        <Image source={{ uri: track.thumbnail }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.placeholder]} />
      )}

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title ?? "(untitled)"}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {track.artist ?? "Unknown"} · {formatDuration(track.duration)}
        </Text>
        {busy && <Text style={styles.busy}>downloading…</Text>}
      </View>

      {right}

      {onMorePress && (
        <Pressable
          onPress={onMorePress}
          hitSlop={12}
          style={styles.moreBtn}
        >
          <Ionicons
            name="ellipsis-vertical"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 14,
    backgroundColor: "transparent",
  },
  pressed: {
    backgroundColor: colors.surface,
    opacity: 0.85,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  info: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
  },
  busy: {
    color: colors.accent,
    fontSize: 12,
    marginTop: 3,
    fontWeight: "500",
  },
  moreBtn: {
    padding: 8,
    marginLeft: 4,
  },
});
