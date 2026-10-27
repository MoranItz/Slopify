import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { searchYouTube, ingestTrack } from "../api";
import { Track } from "../types";
import { usePlayer } from "../player/PlayerProvider";
import TrackRow from "../components/TrackRow";
import AddToPlaylistModal from "../components/AddToPlaylistModal";
import { colors, shared } from "../theme";

export default function DiscoverScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] =
    useState<Track | null>(null);

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
    if (busyId) return;
    setBusyId(track.id);
    try {
      await ingestTrack(track.id); // downloads on server if needed
      setError(null);
      playTrack(track);
    } catch (e) {
      setError("Download failed: " + String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={shared.screen}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search YouTube…"
        placeholderTextColor={colors.textSecondary}
        style={[shared.searchInput, { marginTop: 8 }]}
      />

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
            busy={busyId === item.id}
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
  },
});
