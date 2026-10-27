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

export async function getLibrary(query?: string): Promise<Track[]> {
  const url = query
    ? `${SERVER_URL}/tracks?q=${encodeURIComponent(query)}`
    : `${SERVER_URL}/tracks`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("server returned " + response.status);
  return response.json();
}
