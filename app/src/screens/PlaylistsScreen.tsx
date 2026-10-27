import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  BackHandler,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Playlist, Track } from "../types";
import {
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  getPlaylistTracks,
  removeTrackFromPlaylist,
} from "../db/localDb";
import { playlistEvents } from "../db/playlistEvents";
import { usePlayer } from "../player/PlayerProvider";
import TrackRow from "../components/TrackRow";
import CreatePlaylistModal from "../components/CreatePlaylistModal";
import { colors, shared } from "../theme";

export default function PlaylistsScreen() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null
  );
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isShuffleOn, setIsShuffleOn] = useState(false);

  const { playQueue, currentTrack, isPlaying, togglePlay } = usePlayer();

  const loadPlaylists = useCallback(async () => {
    try {
      const data = await getPlaylists();
      setPlaylists(data);
    } catch (e) {
      console.log("Error loading playlists:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTracks = useCallback(async (pl: Playlist) => {
    setTracksLoading(true);
    try {
      const tracks = await getPlaylistTracks(pl.id);
      setPlaylistTracks(tracks);
    } catch (e) {
      console.log("Error loading playlist tracks:", e);
    } finally {
      setTracksLoading(false);
    }
  }, []);

  // Hardware back button on Android: go back to playlists list instead of exiting/jumping tabs
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (selectedPlaylist) {
          setSelectedPlaylist(null);
          return true; // consumed
        }
        return false; // let system/navigation handle it
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );
      return () => subscription.remove();
    }, [selectedPlaylist])
  );
  useFocusEffect(
    useCallback(() => {
      loadPlaylists();
      if (selectedPlaylist) {
        loadTracks(selectedPlaylist);
      }
    }, [loadPlaylists, selectedPlaylist, loadTracks])
  );

  // Subscribe to real-time playlist events (when tracks are added/removed or playlists created/deleted)
  useEffect(() => {
    const unsubscribe = playlistEvents.subscribe(() => {
      loadPlaylists();
      if (selectedPlaylist) {
        loadTracks(selectedPlaylist);
      }
    });
    return unsubscribe;
  }, [loadPlaylists, selectedPlaylist, loadTracks]);

  const openPlaylist = (pl: Playlist) => {
    setSelectedPlaylist(pl);
    loadTracks(pl);
  };

  // Keep track count and metadata in selectedPlaylist synced with current playlists state
  const currentSelected = selectedPlaylist
    ? playlists.find((p) => p.id === selectedPlaylist.id) ?? selectedPlaylist
    : null;

  const handleCreate = async (name: string) => {
    await createPlaylist(name);
    await loadPlaylists();
  };

  const handleDelete = (pl: Playlist) => {
    Alert.alert(
      "Delete Playlist",
      `Are you sure you want to delete "${pl.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deletePlaylist(pl.id);
            if (selectedPlaylist?.id === pl.id) {
              setSelectedPlaylist(null);
            }
            await loadPlaylists();
          },
        },
      ]
    );
  };

  const handleRemoveTrack = async (track: Track) => {
    if (!currentSelected) return;
    await removeTrackFromPlaylist(currentSelected.id, track.id);
  };

  const isCurrentTrackInPlaylist = Boolean(
    currentTrack && playlistTracks.some((t) => t.id === currentTrack.id)
  );
  const isThisPlaylistPlaying = isCurrentTrackInPlaylist && isPlaying;

  const handlePlaylistPlayPress = () => {
    if (playlistTracks.length === 0) return;
    if (isCurrentTrackInPlaylist) {
      togglePlay();
    } else {
      playQueue(playlistTracks, 0);
    }
  };

  // ── VIEW: PLAYLIST DETAIL ──────────────────────────────────────────
  if (currentSelected) {
    return (
      <View style={shared.screen}>
        <FlatList
          data={playlistTracks}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.detailHeader}>
              <Pressable
                onPress={() => setSelectedPlaylist(null)}
                hitSlop={14}
                style={styles.backBtn}
              >
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </Pressable>

              <View style={styles.artContainer}>
                <View style={styles.artFrame}>
                  {currentSelected.pictureUri ? (
                    <Image
                      source={{ uri: currentSelected.pictureUri }}
                      style={styles.coverArt}
                    />
                  ) : (
                    <View style={[styles.coverArt, styles.artPlaceholder]}>
                      <Ionicons name="disc" size={60} color={colors.accent} />
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.detailMeta}>
                <Text style={styles.detailTitle} numberOfLines={2}>
                  {currentSelected.name}
                </Text>
                <Text style={styles.detailCount}>
                  Playlist • {playlistTracks.length}{" "}
                  {playlistTracks.length === 1 ? "track" : "tracks"}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <View style={{ flex: 1 }} />
                {playlistTracks.length > 0 && (
                  <View style={styles.actionsRight}>
                    <Pressable
                      onPress={() => setIsShuffleOn((prev) => !prev)}
                      hitSlop={12}
                      style={styles.shuffleBtn}
                    >
                      <Ionicons
                        name="shuffle"
                        size={26}
                        color={
                          isShuffleOn ? colors.accent : colors.textSecondary
                        }
                      />
                      {isShuffleOn && <View style={styles.shuffleDot} />}
                    </Pressable>

                    <Pressable
                      onPress={handlePlaylistPlayPress}
                      style={styles.spotifyPlayBtn}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={isThisPlaylistPlaying ? "pause" : "play"}
                        size={28}
                        color="#FFF"
                        style={
                          !isThisPlaylistPlaying ? { marginLeft: 3 } : undefined
                        }
                      />
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          }
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              onPress={() => playQueue(playlistTracks, index)}
              onMorePress={() => {
                Alert.alert(item.title ?? "Track Options", undefined, [
                  {
                    text: "Remove from Playlist",
                    style: "destructive",
                    onPress: () => handleRemoveTrack(item),
                  },
                  { text: "Cancel", style: "cancel" },
                ]);
              }}
            />
          )}
          ListEmptyComponent={
            tracksLoading ? (
              <ActivityIndicator
                color={colors.accent}
                style={{ marginVertical: 32 }}
              />
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  This playlist is empty. Add songs from Discover or Library!
                </Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      </View>
    );
  }

  // ── VIEW: PLAYLISTS LIST ───────────────────────────────────────────
  return (
    <View style={shared.screen}>
      <View style={styles.topBar}>
        <Text style={styles.heading}>Your Playlists</Text>
        <Pressable
          onPress={() => setIsCreateOpen(true)}
          style={styles.createBtn}
        >
          <Ionicons name="add" size={22} color={colors.text} />
          <Text style={styles.createText}>New</Text>
        </Pressable>
      </View>

      {loading && playlists.length === 0 ? (
        <ActivityIndicator
          color={colors.accent}
          style={{ marginVertical: 32 }}
        />
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openPlaylist(item)}
              onLongPress={() => handleDelete(item)}
              style={({ pressed }) => [
                styles.playlistCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.cardCoverWrapper}>
                {item.pictureUri ? (
                  <Image
                    source={{ uri: item.pictureUri }}
                    style={styles.cardCover}
                  />
                ) : (
                  <View style={[styles.cardCover, styles.artPlaceholder]}>
                    <Ionicons
                      name="musical-notes"
                      size={28}
                      color={colors.accent}
                    />
                  </View>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.cardSub}>
                  {item.trackCount ?? 0}{" "}
                  {item.trackCount === 1 ? "track" : "tracks"}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          )}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="disc-outline"
                  size={64}
                  color={colors.card}
                  style={{ marginBottom: 12 }}
                />
                <Text style={styles.emptyHeading}>No playlists yet</Text>
                <Text style={styles.emptyText}>
                  Create your first playlist and start organizing your favorite
                  tracks.
                </Text>
                <Pressable
                  onPress={() => setIsCreateOpen(true)}
                  style={styles.bigCreateBtn}
                >
                  <Text style={styles.bigCreateBtnText}>Create Playlist</Text>
                </Pressable>
              </View>
            ) : undefined
          }
        />
      )}

      <CreatePlaylistModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  heading: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    gap: 4,
  },
  createText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  playlistCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.75,
  },
  cardCoverWrapper: {
    marginRight: 14,
  },
  cardCover: {
    width: 58,
    height: 58,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  artPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  cardSub: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  detailHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  backBtn: {
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  artContainer: {
    alignItems: "center",
    marginBottom: 18,
  },
  artFrame: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  coverArt: {
    width: 170,
    height: 170,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  detailMeta: {
    marginBottom: 8,
  },
  detailTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  detailCount: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
    fontWeight: "500",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  actionsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  shuffleBtn: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  shuffleDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    position: "absolute",
    bottom: 2,
  },
  spotifyPlayBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  emptyContainer: {
    alignItems: "center",
    paddingHorizontal: 32,
    marginTop: 48,
  },
  emptyHeading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  bigCreateBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 20,
  },
  bigCreateBtnText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
});
