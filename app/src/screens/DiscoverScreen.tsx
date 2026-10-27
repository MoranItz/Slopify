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
      playTrack(track);
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
      {/* Search bar + Import button row */}
      <View style={styles.topRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search YouTube…"
          placeholderTextColor={colors.textSecondary}
          style={[shared.searchInput, styles.searchFlex]}
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

      {searching && (
        <ActivityIndicator
          color={colors.accent}
          style={{ marginVertical: 8 }}
        />
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            onPress={() => handleTap(item)}
            onMorePress={() => setSelectedTrackForPlaylist(item)}
            busy={busyIds.has(item.id)}
          />
        )}
        ListEmptyComponent={
          !searching && query.trim().length >= 3 ? (
            <Text style={styles.empty}>No results</Text>
          ) : undefined
        }
      />

      <AddToPlaylistModal
        track={selectedTrackForPlaylist}
        visible={!!selectedTrackForPlaylist}
        onClose={() => setSelectedTrackForPlaylist(null)}
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
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingRight: 16,
  },
  searchFlex: {
    flex: 1,
    marginBottom: 10,
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 10,
    marginLeft: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: {
    color: "#ff5555",
    paddingHorizontal: 14,
    paddingBottom: 4,
    fontSize: 13,
  },
  empty: {
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 32,
    fontSize: 14,
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
