import React from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Track } from "../types";
import { colors, formatDuration } from "../theme";

type Props = {
  track: Track;
  onPress: () => void;
  onPlaylistPress?: () => void;
  onMorePress?: () => void;
  isLiked?: boolean;
  dragHandle?: React.ReactNode;
  /** Optional trailing element (e.g. a badge or button) */
  right?: React.ReactNode;
  busy?: boolean;
};

export default function TrackRow({
  track,
  onPress,
  onPlaylistPress,
  onMorePress,
  isLiked,
  dragHandle,
  right,
  busy,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {dragHandle}

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

      {onPlaylistPress && (
        <Pressable
          onPress={onPlaylistPress}
          hitSlop={10}
          style={styles.actionBtn}
        >
          <Ionicons
            name={isLiked ? "checkmark-circle" : "add-circle-outline"}
            size={22}
            color={isLiked ? colors.accent : colors.textSecondary}
          />
        </Pressable>
      )}

      {onMorePress && (
        <Pressable
          onPress={onMorePress}
          hitSlop={10}
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
    fontSize: 12,
    marginTop: 4,
  },
  busy: {
    color: colors.sunsetOrange,
    fontSize: 11,
    marginTop: 2,
    fontWeight: "600",
  },
  actionBtn: {
    padding: 6,
    marginRight: 2,
  },
  moreBtn: {
    padding: 6,
  },
});
