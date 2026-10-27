import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getLibrary } from "../api";
import { Track } from "../types";
import { libraryEvents } from "../db/playlistEvents";
import { usePlayer } from "../player/PlayerProvider";
import TrackRow from "../components/TrackRow";
import AddToPlaylistModal from "../components/AddToPlaylistModal";
import { colors, shared } from "../theme";

export default function LibraryScreen() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] =
    useState<Track | null>(null);

  const { playQueue } = usePlayer();

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const data = await getLibrary(q && q.trim() ? q.trim() : undefined);
      setTracks(data);
      setError(null);
    } catch (e) {
      console.log("library fetch error:", e);
      setError("Failed to load library: " + String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when switching to Library tab
  useFocusEffect(
    useCallback(() => {
      load(query);
    }, [load, query])
  );

  // Subscribe to real-time download events (updates whenever a song finishes downloading)
  useEffect(() => {
    const unsubscribe = libraryEvents.subscribe(() => {
      load(query);
    });
    return unsubscribe;
  }, [load, query]);

  // Debounced search when query changes
  useEffect(() => {
    const timer = setTimeout(() => load(query), 400);
    return () => clearTimeout(timer);
  }, [query, load]);

  function handleTap(track: Track, index: number) {
    // Play the whole library as a queue starting from the tapped track
    playQueue(tracks, index);
  }

  return (
    <View style={shared.screen}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search library…"
        placeholderTextColor={colors.textSecondary}
        style={[shared.searchInput, { marginTop: 8 }]}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && tracks.length === 0 && (
        <ActivityIndicator
          color={colors.accent}
          style={{ marginVertical: 16 }}
        />
      )}

      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            onPress={() => handleTap(item, index)}
            onMorePress={() => setSelectedTrackForPlaylist(item)}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              {query.trim()
                ? "No tracks match your search"
                : "Your library is empty — discover some music!"}
            </Text>
          ) : undefined
        }
      />

      <AddToPlaylistModal
        track={selectedTrackForPlaylist}
        visible={!!selectedTrackForPlaylist}
        onClose={() => setSelectedTrackForPlaylist(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
    paddingHorizontal: 24,
  },
});
