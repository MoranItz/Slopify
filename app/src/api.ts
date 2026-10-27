import { Track } from "./types";
import { libraryEvents } from "./db/playlistEvents";

export const SERVER_URL = "http://192.168.68.114:8000";

export function getStreamUrl(trackId: string): string {
  return `${SERVER_URL}/tracks/${trackId}/stream`;
}

export async function searchYouTube(query: string): Promise<Track[]> {
  const response = await fetch(
    `${SERVER_URL}/search?q=${encodeURIComponent(query)}`
  );
  if (!response.ok) throw new Error("server returned " + response.status);
  return response.json();
}

export async function ingestTrack(id: string): Promise<Track> {
  const response = await fetch(`${SERVER_URL}/tracks/${id}/ingest`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("server returned " + response.status);
  const data = await response.json();
  libraryEvents.emit();
  return data;
}

/**
 * Fire-and-forget ingest: kicks off the download on the server
 * but does NOT await the response. Resolves immediately.
 */
export function ingestTrackBackground(id: string): void {
  fetch(`${SERVER_URL}/tracks/${id}/ingest`, { method: "POST" })
    .then(() => libraryEvents.emit())
    .catch((e) => console.warn(`Background ingest failed for ${id}:`, e));
}

export async function getLibrary(query?: string): Promise<Track[]> {
  const url = query
    ? `${SERVER_URL}/tracks?q=${encodeURIComponent(query)}`
    : `${SERVER_URL}/tracks`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("server returned " + response.status);
  return response.json();
}

/**
 * Import a YouTube playlist. The server extracts track metadata immediately
 * and downloads audio files in the background.
 */
export async function ingestPlaylist(
  url: string
): Promise<{ name: string; count: number; tracks: Track[] }> {
  const response = await fetch(
    `${SERVER_URL}/playlists/ingest?url=${encodeURIComponent(url)}`,
    { method: "POST" }
  );
  if (!response.ok) throw new Error("server returned " + response.status);
  const data = await response.json();
  libraryEvents.emit();
  return data;
}
