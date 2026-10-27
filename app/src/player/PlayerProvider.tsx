import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Track } from "../types";
import { getStreamUrl, ingestTrack } from "../api";

type PlayerContextType = {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  playQueue: (tracks: Track[], startIndex?: number) => void;
  playTrack: (track: Track) => void;
  /** Ingest a search result (downloads on server if needed), then play it. */
  ingestAndPlay: (track: Track) => Promise<void>;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seekTo: (seconds: number) => void;
};

const PlayerContext = createContext<PlayerContextType | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  // ── Load & play a single track ──────────────────────────────
  const loadTrack = useCallback(
    async (track: Track) => {
      setCurrentTrack(track);

      // Pre-flight check: if the file was deleted on the server, re-ingest it
      let needsIngest = false;
      try {
        const res = await fetch(getStreamUrl(track.id), { method: "GET", headers: { Range: "bytes=0-0" } });
        if (res.status === 404) {
          needsIngest = true;
        }
        // Abort the body so we don't download the whole file
        res.body?.cancel?.();
      } catch (e) {
        console.warn("Pre-flight check failed, trying to play anyway:", e);
      }

      if (needsIngest) {
        try {
          console.log(`Track ${track.id} missing on server, re-ingesting…`);
          await ingestTrack(track.id);
          console.log(`Track ${track.id} re-ingested successfully`);
        } catch (e) {
          console.error(`Failed to re-ingest track ${track.id}:`, e);
        }
      }

      player.replace({ uri: getStreamUrl(track.id) });
      player.play();
    },
    [player]
  );

  // ── Public API ──────────────────────────────────────────────
  const playQueue = useCallback(
    (tracks: Track[], startIndex = 0) => {
      const selected = tracks[startIndex];
      if (selected && currentTrack?.id === selected.id) {
        // Tapping the currently loaded song toggles playback (pause if playing, resume if paused)
        if (status.playing) {
          player.pause();
        } else {
          player.play();
        }
        return;
      }
      setQueue(tracks);
      setQueueIndex(startIndex);
      loadTrack(tracks[startIndex]);
    },
    [loadTrack, currentTrack, status.playing, player]
  );

  const playTrack = useCallback(
    (track: Track) => {
      if (currentTrack?.id === track.id) {
        if (status.playing) {
          player.pause();
        } else {
          player.play();
        }
        return;
      }
      playQueue([track], 0);
    },
    [playQueue, currentTrack, status.playing, player]
  );

  const ingestAndPlay = useCallback(
    async (track: Track) => {
      await ingestTrack(track.id);
      playTrack(track);
    },
    [playTrack]
  );

  const togglePlay = useCallback(() => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, status.playing]);

  const next = useCallback(() => {
    if (queueIndex < queue.length - 1) {
      const nextIdx = queueIndex + 1;
      setQueueIndex(nextIdx);
      loadTrack(queue[nextIdx]);
    } else if (queue.length > 0) {
      // Reached the end of the queue: keep playing the current song
      player.seekTo(0);
      player.play();
    }
  }, [queue, queueIndex, loadTrack, player]);

  const previous = useCallback(() => {
    if (queueIndex > 0) {
      const prevIdx = queueIndex - 1;
      setQueueIndex(prevIdx);
      loadTrack(queue[prevIdx]);
    }
    // If queueIndex === 0, cannot go back before the first track
  }, [queue, queueIndex, loadTrack]);

  const seekTo = useCallback(
    (seconds: number) => {
      player.seekTo(seconds);
    },
    [player]
  );

  // ── Auto-advance when a track ends ──────────────────────────
  useEffect(() => {
    if (status.didJustFinish) {
      next();
    }
  }, [status.didJustFinish, next]);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        queue,
        queueIndex,
        isPlaying: status.playing,
        currentTime: status.currentTime,
        duration: status.duration,
        isBuffering: status.isBuffering,
        playQueue,
        playTrack,
        ingestAndPlay,
        togglePlay,
        next,
        previous,
        seekTo,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}
