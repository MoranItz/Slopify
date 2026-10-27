import React, { useCallback, useEffect, useRef, useState } from "react";
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
  PanResponder,
  Animated,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Playlist, Track } from "../types";
import {
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  getPlaylistTracks,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  updatePlaylistPicture,
  updatePlaylistName,
  getPlaylistShuffle,
  setPlaylistShuffle,
  LIKED_SONGS_ID,
} from "../db/localDb";
import { playlistEvents } from "../db/playlistEvents";
import { usePlayer } from "../player/PlayerProvider";
import TrackRow from "../components/TrackRow";
import AddToPlaylistModal from "../components/AddToPlaylistModal";
import CreatePlaylistModal from "../components/CreatePlaylistModal";
import { useLikedTracks } from "../hooks/useLikedTracks";
import { colors, shared } from "../theme";

const ROW_HEIGHT = 76;

function formatPlaylistDuration(totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ${minutes} ${
      minutes === 1 ? "minute" : "minutes"
    }`;
  }
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

// ── Draggable Row with Smooth Sliding Animation ─────────────────────
type DraggableTrackRowProps = {
  item: Track;
  index: number;
  isLiked: boolean;
  onPress: () => void;
  onPlaylistPress: () => void;
  onMorePress: () => void;
  animY: Animated.Value;
  onDragStart: (index: number) => void;
  onDragMove: (dy: number) => void;
  onDragRelease: (
    panY: Animated.Value,
    scale: Animated.Value,
    onDone: () => void
  ) => void;
};

function DraggableTrackRow({
  item,
  index,
  isLiked,
  onPress,
  onPlaylistPress,
  onMorePress,
  animY,
  onDragStart,
  onDragMove,
  onDragRelease,
}: DraggableTrackRowProps) {
  const panY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [isDragging, setIsDragging] = useState(false);

  const stateRef = useRef({ index, onDragStart, onDragMove, onDragRelease });
  stateRef.current = { index, onDragStart, onDragMove, onDragRelease };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 2,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        setIsDragging(true);
        panY.setValue(0);
        stateRef.current.onDragStart(stateRef.current.index);
        Animated.spring(scale, {
          toValue: 1.04,
          useNativeDriver: true,
          tension: 110,
          friction: 8,
        }).start();
      },
      onPanResponderMove: (_, gesture) => {
        panY.setValue(gesture.dy);
        stateRef.current.onDragMove(gesture.dy);
      },
      onPanResponderRelease: () => {
        stateRef.current.onDragRelease(panY, scale, () => {
          setIsDragging(false);
        });
      },
      onPanResponderTerminate: () => {
        stateRef.current.onDragRelease(panY, scale, () => {
          setIsDragging(false);
        });
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.rowWrapper,
        isDragging
          ? {
              transform: [{ translateY: panY }, { scale }],
              zIndex: 9999,
              elevation: 20,
              backgroundColor: colors.cardHover,
              borderRadius: 14,
              borderColor: colors.accent,
              borderWidth: 1.5,
              shadowColor: colors.accent,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.6,
              shadowRadius: 10,
            }
          : {
              transform: [{ translateY: animY }],
            },
      ]}
    >
      <TrackRow
        track={item}
        isLiked={isLiked}
        dragHandle={
          <View {...panResponder.panHandlers} style={styles.dragHandle}>
            <View
              style={[
                styles.dragLine,
                isDragging && styles.dragLineActive,
              ]}
            />
          </View>
        }
        onPress={onPress}
        onPlaylistPress={onPlaylistPress}
        onMorePress={onMorePress}
      />
    </Animated.View>
  );
}

// ── Main Playlists Screen ───────────────────────────────────────────
export default function PlaylistsScreen({ navigation }: any) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null
  );
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Rename playlist state
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [isShuffleOn, setIsShuffleOn] = useState(false);

  // Playlist picker state for song row
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] =
    useState<Track | null>(null);

  // FlatList scroll lock when dragging
  const [isDraggingActive, setIsDraggingActive] = useState(false);

  const savedTrackIds = useLikedTracks();
  const {
    playQueue,
    isPlaying,
    togglePlay,
    activeSourceId,
    setShuffleActive,
  } = usePlayer();

  const playlistTracksRef = useRef(playlistTracks);
  playlistTracksRef.current = playlistTracks;
  const currentSelectedRef = useRef(selectedPlaylist);
  currentSelectedRef.current = selectedPlaylist;

  // Remove top navigation "Playlists" bar when viewing a playlist page
  useEffect(() => {
    if (navigation) {
      navigation.setOptions({
        headerShown: selectedPlaylist === null,
      });
    }
  }, [navigation, selectedPlaylist]);

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
      const [tracks, isShuffled] = await Promise.all([
        getPlaylistTracks(pl.id),
        getPlaylistShuffle(pl.id),
      ]);
      setPlaylistTracks(tracks);
      setIsShuffleOn(isShuffled);
    } catch (e) {
      console.log("Error loading playlist tracks:", e);
    } finally {
      setTracksLoading(false);
    }
  }, []);

  // Hardware back button on Android
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (selectedPlaylist) {
          setSelectedPlaylist(null);
          return true;
        }
        return false;
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

  const currentSelected = selectedPlaylist
    ? playlists.find((p) => p.id === selectedPlaylist.id) ?? selectedPlaylist
    : null;

  const handleCreate = async (name: string) => {
    await createPlaylist(name);
    await loadPlaylists();
  };

  const handleDelete = (pl: Playlist) => {
    if (pl.id === LIKED_SONGS_ID) {
      return;
    }

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

  const handlePickPicture = async () => {
    if (!currentSelected || currentSelected.id === LIKED_SONGS_ID) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        await updatePlaylistPicture(currentSelected.id, uri);
        await loadPlaylists();
      }
    } catch (e) {
      console.log("Error picking image:", e);
    }
  };

  const handleSaveRename = async () => {
    if (!currentSelected || !renameInput.trim()) return;
    try {
      await updatePlaylistName(currentSelected.id, renameInput.trim());
      setIsRenameOpen(false);
      await loadPlaylists();
    } catch (e) {
      console.log("Error renaming playlist:", e);
    }
  };

  const handleRemoveTrack = async (track: Track) => {
    if (!currentSelected) return;
    await removeTrackFromPlaylist(currentSelected.id, track.id);
  };

  const isThisPlaylistPlaying =
    isPlaying && activeSourceId === currentSelected?.id;

  const handleToggleShuffle = async () => {
    if (!currentSelected || playlistTracks.length === 0) return;
    const newOn = !isShuffleOn;
    setIsShuffleOn(newOn);
    await setPlaylistShuffle(currentSelected.id, newOn);

    if (activeSourceId === currentSelected.id) {
      setShuffleActive(newOn, playlistTracks);
    }
  };

  const handlePlaylistPlayPress = () => {
    if (playlistTracks.length === 0 || !currentSelected) return;
    if (activeSourceId === currentSelected.id) {
      togglePlay();
    } else {
      const startIdx = isShuffleOn
        ? Math.floor(Math.random() * playlistTracks.length)
        : 0;
      playQueue(playlistTracks, startIdx, currentSelected.id, isShuffleOn);
    }
  };

  const startIndexRef = useRef<number>(-1);
  const targetIndexRef = useRef<number>(-1);
  const rowAnimsRef = useRef<{ [trackId: string]: Animated.Value }>({});

  const getRowAnim = (id: string) => {
    if (!rowAnimsRef.current[id]) {
      rowAnimsRef.current[id] = new Animated.Value(0);
    }
    return rowAnimsRef.current[id];
  };

  const handleDragStart = (startIndex: number) => {
    startIndexRef.current = startIndex;
    targetIndexRef.current = startIndex;
    setIsDraggingActive(true);
  };

  const handleDragMove = (gestureDy: number) => {
    const startIndex = startIndexRef.current;
    if (startIndex < 0) return;

    const list = playlistTracksRef.current;
    const count = list.length;
    if (count <= 1) return;

    const slotOffset = Math.round(gestureDy / ROW_HEIGHT);
    const targetIndex = Math.max(
      0,
      Math.min(count - 1, startIndex + slotOffset)
    );

    if (targetIndex !== targetIndexRef.current) {
      targetIndexRef.current = targetIndex;

      for (let i = 0; i < count; i++) {
        if (i === startIndex) continue;
        const id = list[i].id;
        const anim = getRowAnim(id);

        let targetShift = 0;
        if (startIndex < targetIndex && i > startIndex && i <= targetIndex) {
          targetShift = -ROW_HEIGHT;
        } else if (
          startIndex > targetIndex &&
          i < startIndex &&
          i >= targetIndex
        ) {
          targetShift = ROW_HEIGHT;
        }

        Animated.spring(anim, {
          toValue: targetShift,
          useNativeDriver: true,
          tension: 85,
          friction: 9,
        }).start();
      }
    }
  };

  const handleDragRelease = (
    panY: Animated.Value,
    scale: Animated.Value,
    onDone: () => void
  ) => {
    const startIndex = startIndexRef.current;
    const targetIndex = targetIndexRef.current;
    const list = playlistTracksRef.current;

    if (
      startIndex < 0 ||
      targetIndex < 0 ||
      startIndex === targetIndex ||
      targetIndex >= list.length
    ) {
      Animated.parallel([
        Animated.spring(panY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 90,
          friction: 9,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 90,
          friction: 9,
        }),
      ]).start(() => {
        list.forEach((t) => getRowAnim(t.id).setValue(0));
        startIndexRef.current = -1;
        targetIndexRef.current = -1;
        setIsDraggingActive(false);
        onDone();
      });
      return;
    }

    const finalOffset = (targetIndex - startIndex) * ROW_HEIGHT;

    Animated.parallel([
      Animated.spring(panY, {
        toValue: finalOffset,
        useNativeDriver: true,
        tension: 80,
        friction: 9,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 9,
      }),
    ]).start(async () => {
      // 1. Reset all shift anims and panY
      list.forEach((t) => getRowAnim(t.id).setValue(0));
      panY.setValue(0);
      onDone();

      // 2. Commit new order to state
      const updated = [...list];
      const [moved] = updated.splice(startIndex, 1);
      updated.splice(targetIndex, 0, moved);
      setPlaylistTracks(updated);

      startIndexRef.current = -1;
      targetIndexRef.current = -1;
      setIsDraggingActive(false);

      // 3. Persist to DB
      const playlist = currentSelectedRef.current;
      if (playlist) {
        await reorderPlaylistTracks(
          playlist.id,
          updated.map((t) => t.id)
        );
      }
    });
  };

  // ── VIEW: PLAYLIST DETAIL ──────────────────────────────────────────
  if (currentSelected) {
    const isLikedPlaylist = currentSelected.id === LIKED_SONGS_ID;
    const totalDurationSec = playlistTracks.reduce(
      (sum, t) => sum + (t.duration ?? 0),
      0
    );

    return (
      <View style={shared.screen}>
        <FlatList
          data={playlistTracks}
          keyExtractor={(item) => item.id}
          scrollEnabled={!isDraggingActive}
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
                <Pressable
                  onPress={handlePickPicture}
                  disabled={isLikedPlaylist}
                  style={[
                    styles.artFrame,
                    isLikedPlaylist && styles.likedArtFrame,
                  ]}
                >
                  {currentSelected.pictureUri ? (
                    <Image
                      source={{ uri: currentSelected.pictureUri }}
                      style={styles.coverArt}
                    />
                  ) : isLikedPlaylist ? (
                    <View style={[styles.coverArt, styles.likedCover]}>
                      <Ionicons name="heart" size={72} color="#FFF" />
                    </View>
                  ) : (
                    <View style={[styles.coverArt, styles.artPlaceholder]}>
                      <Ionicons name="disc" size={60} color={colors.accent} />
                    </View>
                  )}

                  {!isLikedPlaylist && (
                    <View style={styles.editPhotoBadge}>
                      <Ionicons name="camera" size={14} color="#FFF" />
                    </View>
                  )}
                </Pressable>
              </View>

              <View style={styles.metaAndActionsRow}>
                <View style={styles.detailMeta}>
                  <View style={styles.titleRow}>
                    <Text style={styles.detailTitle} numberOfLines={2}>
                      {currentSelected.name}
                    </Text>
                    {!isLikedPlaylist && (
                      <Pressable
                        onPress={() => {
                          setRenameInput(currentSelected.name);
                          setIsRenameOpen(true);
                        }}
                        hitSlop={12}
                        style={styles.pencilBtn}
                      >
                        <Ionicons
                          name="pencil"
                          size={18}
                          color={colors.textSecondary}
                        />
                      </Pressable>
                    )}
                  </View>

                  <Text style={styles.detailCount}>
                    Playlist • {playlistTracks.length}{" "}
                    {playlistTracks.length === 1 ? "track" : "tracks"}
                  </Text>
                  {playlistTracks.length > 0 && (
                    <Text style={styles.detailDuration}>
                      {formatPlaylistDuration(totalDurationSec)}
                    </Text>
                  )}
                </View>

                {playlistTracks.length > 0 && (
                  <View style={styles.actionsRight}>
                    <Pressable
                      onPress={handleToggleShuffle}
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
            <DraggableTrackRow
              item={item}
              index={index}
              isLiked={savedTrackIds.has(item.id)}
              animY={getRowAnim(item.id)}
              onPress={() =>
                playQueue(
                  playlistTracks,
                  index,
                  currentSelected?.id,
                  isShuffleOn
                )
              }
              onPlaylistPress={() => setSelectedTrackForPlaylist(item)}
              onMorePress={() => {
                Alert.alert(item.title ?? "Track Options", undefined, [
                  {
                    text: "Add to other playlist…",
                    onPress: () => setSelectedTrackForPlaylist(item),
                  },
                  {
                    text: "Remove from Playlist",
                    style: "destructive",
                    onPress: () => handleRemoveTrack(item),
                  },
                  { text: "Cancel", style: "cancel" },
                ]);
              }}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragRelease={handleDragRelease}
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

        <AddToPlaylistModal
          track={selectedTrackForPlaylist}
          visible={!!selectedTrackForPlaylist}
          onClose={() => setSelectedTrackForPlaylist(null)}
          autoLikeIfNew={true}
        />

        {/* ── Rename Playlist Modal ──────────────────────────────── */}
        <Modal
          visible={isRenameOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsRenameOpen(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalOverlay}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setIsRenameOpen(false)}
            >
              <Pressable
                style={styles.renameCard}
                onPress={(e) => e.stopPropagation()}
              >
                <Text style={styles.renameTitle}>Rename Playlist</Text>
                <TextInput
                  value={renameInput}
                  onChangeText={setRenameInput}
                  placeholder="Playlist name"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.renameInput}
                  autoFocus
                  selectTextOnFocus
                />
                <View style={styles.renameBtnRow}>
                  <Pressable
                    style={styles.renameCancelBtn}
                    onPress={() => setIsRenameOpen(false)}
                  >
                    <Text style={styles.renameCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.renameSaveBtn,
                      !renameInput.trim() && { opacity: 0.5 },
                    ]}
                    disabled={!renameInput.trim()}
                    onPress={handleSaveRename}
                  >
                    <Text style={styles.renameSaveText}>Save</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
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
          renderItem={({ item }) => {
            const isLiked = item.id === LIKED_SONGS_ID;

            return (
              <Pressable
                onPress={() => openPlaylist(item)}
                onLongPress={() => !isLiked && handleDelete(item)}
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
                  ) : isLiked ? (
                    <View style={[styles.cardCover, styles.likedCardCover]}>
                      <Ionicons name="heart" size={28} color="#FFF" />
                    </View>
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
            );
          }}
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
  likedCardCover: {
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
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
    paddingBottom: 4,
    marginBottom: 0,
  },
  backBtn: {
    alignSelf: "flex-start",
    marginTop: 14,
    marginBottom: 10,
    padding: 6,
  },
  artContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  artFrame: {
    position: "relative",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  likedArtFrame: {
    shadowColor: colors.accent,
    shadowOpacity: 0.55,
  },
  coverArt: {
    width: 170,
    height: 170,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  likedCover: {
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  editPhotoBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(23, 18, 38, 0.85)",
    padding: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaAndActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 6,
  },
  detailMeta: {
    flex: 1,
    paddingRight: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  pencilBtn: {
    padding: 4,
  },
  detailCount: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
    fontWeight: "500",
  },
  detailDuration: {
    color: colors.accent,
    fontSize: 13,
    marginTop: 2,
    fontWeight: "600",
  },
  actionsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
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
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  rowWrapper: {
    height: ROW_HEIGHT,
    justifyContent: "center",
  },
  dragHandle: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
    marginLeft: -6,
  },
  dragLine: {
    width: 3,
    height: 24,
    borderRadius: 1.5,
    backgroundColor: colors.border,
  },
  dragLineActive: {
    backgroundColor: colors.accent,
    width: 4,
    shadowColor: colors.accent,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
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

  // ── Modal styles for rename ──────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  renameCard: {
    width: "85%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  renameTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  renameInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  renameBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  renameCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  renameCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  renameSaveBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
  renameSaveText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
});
