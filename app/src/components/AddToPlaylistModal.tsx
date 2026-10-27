import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Playlist, Track } from "../types";
import {
  getPlaylists,
  getTrackPlaylistIds,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  createPlaylist,
  LIKED_SONGS_ID,
} from "../db/localDb";
import { colors } from "../theme";
import CreatePlaylistModal from "./CreatePlaylistModal";

type Props = {
  track: Track | null;
  visible: boolean;
  onClose: () => void;
  autoLikeIfNew?: boolean;
};

export default function AddToPlaylistModal({
  track,
  visible,
  onClose,
  autoLikeIfNew = false,
}: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistIds, setActivePlaylistIds] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    if (visible && track) {
      loadData();
    }
  }, [visible, track?.id]);

  const loadData = async () => {
    if (!track) return;
    setLoading(true);
    try {
      const [list, memberIds] = await Promise.all([
        getPlaylists(),
        getTrackPlaylistIds(track.id),
      ]);
      setPlaylists(list);

      const activeSet = new Set(memberIds);
      // If autoLikeIfNew is true and track is not yet in Liked Songs, add it now (like Spotify)
      if (autoLikeIfNew && !activeSet.has(LIKED_SONGS_ID)) {
        await addTrackToPlaylist(LIKED_SONGS_ID, track);
        activeSet.add(LIKED_SONGS_ID);
      }
      setActivePlaylistIds(activeSet);
    } catch (e) {
      console.log("Error loading playlists or track memberships:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (pl: Playlist) => {
    if (!track || togglingId) return;
    setTogglingId(pl.id);
    const isMember = activePlaylistIds.has(pl.id);
    try {
      if (isMember) {
        await removeTrackFromPlaylist(pl.id, track.id);
        setActivePlaylistIds((prev) => {
          const next = new Set(prev);
          next.delete(pl.id);
          return next;
        });
      } else {
        await addTrackToPlaylist(pl.id, track);
        setActivePlaylistIds((prev) => new Set(prev).add(pl.id));
      }
      // Also update playlist track count locally
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === pl.id
            ? {
                ...p,
                trackCount: Math.max(
                  0,
                  (p.trackCount ?? 0) + (isMember ? -1 : 1)
                ),
              }
            : p
        )
      );
    } catch (e) {
      console.log("Error toggling playlist track:", e);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <>
      <Modal
        visible={visible && !isCreateOpen}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.sheet}>
            <View style={styles.grabPill} />

            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heading}>Add to Playlists</Text>
                {track && (
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {track.title ?? "Selected track"}
                  </Text>
                )}
              </View>

              <Pressable
                onPress={() => setIsCreateOpen(true)}
                style={styles.newBtn}
                hitSlop={8}
              >
                <Ionicons name="add" size={18} color={colors.text} />
                <Text style={styles.newBtnText}>New</Text>
              </Pressable>
            </View>

            {loading ? (
              <ActivityIndicator
                color={colors.accent}
                style={{ marginVertical: 32 }}
              />
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => {
                  const isChecked = activePlaylistIds.has(item.id);
                  const isLikedPlaylist = item.id === LIKED_SONGS_ID;
                  return (
                    <Pressable
                      onPress={() => handleToggle(item)}
                      style={({ pressed }) => [
                        styles.playlistRow,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.iconThumb,
                          isLikedPlaylist && styles.likedThumb,
                        ]}
                      >
                        {item.pictureUri ? (
                          <Image
                            source={{ uri: item.pictureUri }}
                            style={styles.coverImage}
                          />
                        ) : isLikedPlaylist ? (
                          <Ionicons
                            name="heart"
                            size={22}
                            color={colors.accent}
                          />
                        ) : (
                          <Ionicons
                            name="disc-outline"
                            size={22}
                            color={colors.textSecondary}
                          />
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.playlistName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.playlistSub}>
                          {item.trackCount ?? 0}{" "}
                          {item.trackCount === 1 ? "track" : "tracks"}
                        </Text>
                      </View>

                      {togglingId === item.id ? (
                        <ActivityIndicator
                          size="small"
                          color={colors.accent}
                        />
                      ) : (
                        <Ionicons
                          name={
                            isChecked
                              ? "checkmark-circle"
                              : "ellipse-outline"
                          }
                          size={26}
                          color={
                            isChecked
                              ? colors.accent
                              : colors.textSecondary
                          }
                        />
                      )}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>No playlists found</Text>
                  </View>
                }
              />
            )}

            <Pressable style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <CreatePlaylistModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={async (name) => {
          const created = await createPlaylist(name);
          if (track) {
            await addTrackToPlaylist(created.id, track);
            setActivePlaylistIds((prev) => new Set(prev).add(created.id));
          }
          await loadData();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  grabPill: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  heading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  trackTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  newBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  pressed: {
    backgroundColor: colors.card,
  },
  iconThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.card,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  likedThumb: {
    backgroundColor: "rgba(255, 46, 147, 0.15)",
    borderColor: colors.accent,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  playlistName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  playlistSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  doneBtn: {
    marginTop: 16,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  doneBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  empty: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
