import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
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
  /** Active playing context (e.g. playlist ID, 'library', 'discover') */
  activeSourceId: string | null;
  isShuffleActive: boolean;
  shufflePos: number;
  canGoNext: boolean;
  canGoPrevious: boolean;
  playQueue: (
    tracks: Track[],
    startIndex?: number,
    sourceId?: string,
    shuffle?: boolean
  ) => void;
  playTrack: (track: Track, sourceId?: string) => void;
  /** Ingest a search result (downloads on server if needed), then play it. */
  ingestAndPlay: (track: Track, sourceId?: string) => Promise<void>;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seekTo: (seconds: number) => void;
  /** Enable or disable shuffle on the currently active queue */
  setShuffleActive: (on: boolean, tracks?: Track[]) => void;
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
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);

  // ── Shuffle state ─────────────────────────────────────────────
  const [isShuffleActive, setIsShuffleActive] = useState(false);
  const [shufflePos, setShufflePos] = useState(0);
  const isShuffleActiveRef = useRef(false);
  const shuffledQueueRef = useRef<Track[]>([]);
  const shufflePosRef = useRef(0);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  // Keep refs for values needed inside callbacks without re-creating them
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const queueIndexRef = useRef(queueIndex);
  queueIndexRef.current = queueIndex;
  const activeSourceIdRef = useRef(activeSourceId);
  activeSourceIdRef.current = activeSourceId;
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;

  // ── Load & play a single track ──────────────────────────────
  const loadTrack = useCallback(
    async (track: Track) => {
      setCurrentTrack(track);
      currentTrackRef.current = track;

      // Pre-flight check: if the file was deleted on the server, re-ingest it
      let needsIngest = false;
      try {
        const res = await fetch(getStreamUrl(track.id), {
          method: "GET",
          headers: { Range: "bytes=0-0" },
        });
        if (res.status === 404) {
          needsIngest = true;
        }
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
    (
      tracks: Track[],
      startIndex = 0,
      sourceId?: string,
      shuffle = false
    ) => {
      const selected = tracks[startIndex] || tracks[0];
      if (!selected) return;

      // Tapping the currently playing song in the exact same source toggles play/pause
      if (
        currentTrackRef.current?.id === selected.id &&
        activeSourceIdRef.current === (sourceId ?? null)
      ) {
        if (status.playing) {
          player.pause();
        } else {
          player.play();
        }
        return;
      }

      // Switch active source context and queue
      const newSource = sourceId ?? null;
      setActiveSourceId(newSource);
      activeSourceIdRef.current = newSource;

      setQueue(tracks);
      queueRef.current = tracks;

      if (shuffle) {
        // Build deterministic randomized queue with selected track pinned at position 0
        const remaining = tracks.filter((t) => t.id !== selected.id);
        for (let i = remaining.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
        const fullShuffled = [selected, ...remaining];

        shuffledQueueRef.current = fullShuffled;
        shufflePosRef.current = 0;
        setShufflePos(0);

        setIsShuffleActive(true);
        isShuffleActiveRef.current = true;
      } else {
        shuffledQueueRef.current = [];
        shufflePosRef.current = 0;
        setShufflePos(0);

        setIsShuffleActive(false);
        isShuffleActiveRef.current = false;
      }

      setQueueIndex(startIndex);
      queueIndexRef.current = startIndex;
      loadTrack(selected);
    },
    [loadTrack, status.playing, player]
  );

  const playTrack = useCallback(
    (track: Track, sourceId?: string) => {
      if (
        currentTrackRef.current?.id === track.id &&
        activeSourceIdRef.current === (sourceId ?? null)
      ) {
        if (status.playing) {
          player.pause();
        } else {
          player.play();
        }
        return;
      }
      playQueue([track], 0, sourceId, false);
    },
    [playQueue, status.playing, player]
  );

  const ingestAndPlay = useCallback(
    async (track: Track, sourceId?: string) => {
      await ingestTrack(track.id);
      playTrack(track, sourceId);
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
    // ── Shuffle mode ──
    if (isShuffleActiveRef.current && shuffledQueueRef.current.length > 0) {
      const sq = shuffledQueueRef.current;
      const nextPos = shufflePosRef.current + 1;

      if (nextPos >= sq.length) {
        // Reached the end of the shuffled playlist: pause!
        player.pause();
        return;
      }

      shufflePosRef.current = nextPos;
      setShufflePos(nextPos);
      const nextTrack = sq[nextPos];

      const q = queueRef.current;
      const idx = q.findIndex((t) => t.id === nextTrack.id);
      if (idx >= 0) {
        setQueueIndex(idx);
        queueIndexRef.current = idx;
      }
      loadTrack(nextTrack);
      return;
    }

    // ── Normal sequential mode ──
    const q = queueRef.current;
    const qi = queueIndexRef.current;
    if (qi < q.length - 1) {
      const nextIdx = qi + 1;
      setQueueIndex(nextIdx);
      queueIndexRef.current = nextIdx;
      loadTrack(q[nextIdx]);
    } else if (q.length > 0) {
      // Reached the end of regular queue
      player.seekTo(0);
      player.play();
    }
  }, [loadTrack, player]);

  const previous = useCallback(() => {
    // ── Shuffle mode ──
    if (isShuffleActiveRef.current && shuffledQueueRef.current.length > 0) {
      const prevPos = shufflePosRef.current - 1;
      if (prevPos < 0) return; // Cannot go before the first song

      shufflePosRef.current = prevPos;
      setShufflePos(prevPos);
      const prevTrack = shuffledQueueRef.current[prevPos];

      const q = queueRef.current;
      const idx = q.findIndex((t) => t.id === prevTrack.id);
      if (idx >= 0) {
        setQueueIndex(idx);
        queueIndexRef.current = idx;
      }
      loadTrack(prevTrack);
      return;
    }

    // ── Normal sequential mode ──
    const qi = queueIndexRef.current;
    if (qi > 0) {
      const prevIdx = qi - 1;
      setQueueIndex(prevIdx);
      queueIndexRef.current = prevIdx;
      loadTrack(queueRef.current[prevIdx]);
    }
  }, [loadTrack]);

  const seekTo = useCallback(
    (seconds: number) => {
      player.seekTo(seconds);
    },
    [player]
  );

  // ── Toggle shuffle on the CURRENT active playlist ──
  const setShuffleActive = useCallback(
    (on: boolean, tracks?: Track[]) => {
      if (on) {
        const cur = currentTrackRef.current;
        const sourceTracks = tracks || queueRef.current;
        if (cur && sourceTracks.some((t) => t.id === cur.id)) {
          const remaining = sourceTracks.filter((t) => t.id !== cur.id);
          for (let i = remaining.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
          }
          shuffledQueueRef.current = [cur, ...remaining];
        } else {
          const copy = [...sourceTracks];
          for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
          }
          shuffledQueueRef.current = copy;
        }
        shufflePosRef.current = 0;
        setShufflePos(0);
        setIsShuffleActive(true);
        isShuffleActiveRef.current = true;
      } else {
        setIsShuffleActive(false);
        isShuffleActiveRef.current = false;
        shuffledQueueRef.current = [];
        shufflePosRef.current = 0;
        setShufflePos(0);
      }
    },
    []
  );

  // ── Auto-advance when a track ends ──────────────────────────
  useEffect(() => {
    if (status.didJustFinish) {
      next();
    }
  }, [status.didJustFinish, next]);

  const canGoPrevious = isShuffleActive ? shufflePos > 0 : queueIndex > 0;
  const canGoNext = isShuffleActive
    ? shufflePos < shuffledQueueRef.current.length - 1
    : queueIndex < queue.length - 1;

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
        activeSourceId,
        isShuffleActive,
        shufflePos,
        canGoNext,
        canGoPrevious,
        playQueue,
        playTrack,
        ingestAndPlay,
        togglePlay,
        next,
        previous,
        seekTo,
        setShuffleActive,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}
