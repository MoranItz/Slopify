import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { searchYouTube, ingestTrack, ingestPlaylist } from "../api";
import { Track } from "../types";
import { usePlayer } from "../player/PlayerProvider";
import TrackRow from "../components/TrackRow";
import AddToPlaylistModal from "../components/AddToPlaylistModal";
import { createPlaylist, addTrackToPlaylist } from "../db/localDb";
import { useLikedTracks } from "../hooks/useLikedTracks";
import { colors, shared } from "../theme";

export default function DiscoverScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] =
    useState<Track | null>(null);

  // ── Playlist import modal state ─────────────────────────────
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [importingPlaylist, setImportingPlaylist] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const likedIds = useLikedTracks();
  const { playTrack } = usePlayer();

  // Debounced search
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const data = await searchYouTube(text);
        if (!cancelled) {
          setResults(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError("Search failed: " + String(e));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function handleTap(track: Track) {
    if (busyIds.has(track.id)) return; // already downloading this one

    // Mark busy
    setBusyIds((prev) => new Set(prev).add(track.id));
    try {
      await ingestTrack(track.id); // downloads on server (queued, 2 at a time)
      setError(null);
      playTrack(track, "discover");
    } catch (e) {
      setError("Download failed: " + String(e));
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }
  }

  async function handleImportPlaylist() {
    const url = playlistUrl.trim();
    if (!url) return;

    setImportingPlaylist(true);
    setImportResult(null);
    try {
      const data = await ingestPlaylist(url);

      // Create a local playlist with the YouTube playlist name
      const playlist = await createPlaylist(data.name);

      // Add all tracks to the new playlist
      for (const track of data.tracks) {
        await addTrackToPlaylist(playlist.id, track);
      }

      setImportResult(
        `"${data.name}" — ${data.count} songs importing! Check your Playlists and Library.`
      );
      setPlaylistUrl("");
      // Auto-close after a short delay
      setTimeout(() => {
        setShowPlaylistModal(false);
        setImportResult(null);
      }, 3500);
    } catch (e) {
      setImportResult("Import failed: " + String(e));
    } finally {
      setImportingPlaylist(false);
    }
  }

  return (
    <View style={shared.screen}>
      <View style={styles.centeredContainer}>
        {/* Search bar + Import button row */}
        <View style={styles.topRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search YouTube…"
            placeholderTextColor={colors.textSecondary}
            style={styles.searchInput}
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.importButton}
            onPress={() => setShowPlaylistModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="list" size={18} color={colors.text} />
            <Ionicons
              name="add"
              size={14}
              color={colors.accent}
              style={{ marginLeft: -4, marginTop: -8 }}
            />
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {/* Search results box in a distinct container */}
        <View style={styles.resultsBox}>
          {searching && results.length === 0 ? (
            <View style={styles.statusBox}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.statusText}>Searching YouTube…</Text>
            </View>
          ) : results.length > 0 ? (
            <>
              {searching && (
                <View style={styles.inlineSearching}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.inlineSearchingText}>Updating…</Text>
                </View>
              )}
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TrackRow
                    track={item}
                    isLiked={likedIds.has(item.id)}
                    onPress={() => handleTap(item)}
                    onPlaylistPress={() => setSelectedTrackForPlaylist(item)}
                    onMorePress={() => setSelectedTrackForPlaylist(item)}
                    busy={busyIds.has(item.id)}
                  />
                )}
              />
            </>
          ) : !searching && query.trim().length >= 3 ? (
            <View style={styles.statusBox}>
              <Ionicons
                name="search-outline"
                size={40}
                color={colors.textSecondary}
              />
              <Text style={styles.statusTitle}>No results found</Text>
              <Text style={styles.statusSub}>
                Try searching for a different song or artist
              </Text>
            </View>
          ) : (
            <View style={styles.statusBox}>
              <Ionicons
                name="musical-notes-outline"
                size={42}
                color={colors.border}
              />
              <Text style={styles.statusTitle}>Discover Music</Text>
              <Text style={styles.statusSub}>
                Search results will show up here
              </Text>
            </View>
          )}
        </View>
      </View>

      <AddToPlaylistModal
        track={selectedTrackForPlaylist}
        visible={!!selectedTrackForPlaylist}
        onClose={() => setSelectedTrackForPlaylist(null)}
        autoLikeIfNew={true}
      />

      {/* ── Import YouTube Playlist Modal ─────────────────────── */}
      <Modal
        visible={showPlaylistModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!importingPlaylist) {
            setShowPlaylistModal(false);
            setImportResult(null);
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => {
              if (!importingPlaylist) {
                setShowPlaylistModal(false);
                setImportResult(null);
              }
            }}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
              <Text style={styles.modalTitle}>Import YouTube Playlist</Text>
              <Text style={styles.modalSubtitle}>
                Paste a YouTube playlist link below. Songs will download in the
                background and appear in your Library.
              </Text>

              <TextInput
                value={playlistUrl}
                onChangeText={setPlaylistUrl}
                placeholder="https://youtube.com/playlist?list=..."
                placeholderTextColor={colors.textSecondary}
                style={styles.urlInput}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!importingPlaylist}
                selectTextOnFocus
              />

              {importResult && (
                <Text
                  style={[
                    styles.resultText,
                    importResult.startsWith("Import failed")
                      ? { color: "#ff5555" }
                      : { color: "#44dd88" },
                  ]}
                >
                  {importResult}
                </Text>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    if (!importingPlaylist) {
                      setShowPlaylistModal(false);
                      setImportResult(null);
                      setPlaylistUrl("");
                    }
                  }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.importBtn,
                    (importingPlaylist || !playlistUrl.trim()) &&
                      styles.importBtnDisabled,
                  ]}
                  onPress={handleImportPlaylist}
                  disabled={importingPlaylist || !playlistUrl.trim()}
                >
                  {importingPlaylist ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : (
                    <Text style={styles.importText}>Import</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centeredContainer: {
    width: "92%",
    maxWidth: 560,
    alignSelf: "center",
    flex: 1,
    paddingTop: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginLeft: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: {
    color: "#ff5555",
    paddingHorizontal: 8,
    paddingBottom: 6,
    fontSize: 13,
  },
  resultsBox: {
    width: "100%",
    flex: 1,
    maxHeight: "84%",
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  listContent: {
    paddingVertical: 8,
  },
  inlineSearching: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 46, 147, 0.08)",
  },
  inlineSearchingText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "600",
  },
  statusBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    minHeight: 220,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 4,
  },
  statusSub: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },

  // ── Modal styles ──────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: "85%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  urlInput: {
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  resultText: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  importBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    minWidth: 90,
    alignItems: "center",
  },
  importBtnDisabled: {
    opacity: 0.4,
  },
  importText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
});
