import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Playlist, Track } from "../types";
import { getPlaylists, addTrackToPlaylist } from "../db/localDb";
import { colors } from "../theme";
import CreatePlaylistModal from "./CreatePlaylistModal";

type Props = {
  track: Track | null;
  visible: boolean;
  onClose: () => void;
  onAdded?: (playlistName: string) => void;
};

export default function AddToPlaylistModal({
  track,
  visible,
  onClose,
  onAdded,
}: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      loadPlaylists();
    }
  }, [visible]);

  const loadPlaylists = async () => {
    setLoading(true);
    try {
      const list = await getPlaylists();
      setPlaylists(list);
    } catch (e) {
      console.log("Error loading playlists:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (pl: Playlist) => {
    if (!track) return;
    setAddingId(pl.id);
    try {
      await addTrackToPlaylist(pl.id, track);
      onAdded?.(pl.name);
      onClose();
    } catch (e) {
      console.log("Error adding track to playlist:", e);
    } finally {
      setAddingId(null);
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
                <Text style={styles.heading}>Add to Playlist</Text>
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
                <Ionicons name="add" size={20} color={colors.text} />
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
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [
                      styles.playlistRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.iconThumb}>
                      <Ionicons
                        name="disc-outline"
                        size={24}
                        color={colors.accent}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.playlistName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.playlistSub}>
                        {item.trackCount ?? 0} tracks
                      </Text>
                    </View>

                    {addingId === item.id ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Ionicons
                        name="add-circle-outline"
                        size={24}
                        color={colors.textSecondary}
                      />
                    )}
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>No playlists yet</Text>
                    <Pressable
                      onPress={() => setIsCreateOpen(true)}
                      style={styles.emptyCreateBtn}
                    >
                      <Text style={styles.emptyCreateBtnText}>
                        Create your first playlist
                      </Text>
                    </Pressable>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      <CreatePlaylistModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={async (name) => {
          const { createPlaylist } = await import("../db/localDb");
          const created = await createPlaylist(name);
          if (track) {
            await addTrackToPlaylist(created.id, track);
            onAdded?.(created.name);
            onClose();
          } else {
            await loadPlaylists();
          }
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
    paddingBottom: 32,
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
    marginBottom: 16,
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
    paddingVertical: 12,
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
  empty: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 12,
  },
  emptyCreateBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  emptyCreateBtnText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
  },
});
