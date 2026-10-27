import { useState, useEffect, useCallback } from "react";
import { getAllSavedTrackIds } from "../db/localDb";
import { playlistEvents } from "../db/playlistEvents";

/**
 * Returns a Set of all track IDs that belong to ANY playlist
 * (including Liked Songs or any user-created playlist).
 */
export function useLikedTracks(): Set<string> {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const ids = await getAllSavedTrackIds();
      setSavedIds(new Set(ids));
    } catch (e) {
      console.log("Error loading saved track ids:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = playlistEvents.subscribe(refresh);
    return unsub;
  }, [refresh]);

  return savedIds;
}
