import * as SQLite from "expo-sqlite";
import { Playlist, Track } from "../types";
import { playlistEvents } from "./playlistEvents";

const DB_NAME = "slopify_local.db";

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getLocalDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
    await initDb(dbInstance);
  }
  return dbInstance;
}

export async function initDb(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS playlists (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT NOT NULL,
      picture_uri TEXT,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_tracks (
      id            TEXT PRIMARY KEY NOT NULL,
      title         TEXT,
      artist        TEXT,
      duration      INTEGER,
      thumbnail     TEXT,
      file_path     TEXT,
      downloaded_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL,
      track_id    TEXT NOT NULL,
      position    INTEGER NOT NULL,
      added_at    INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, track_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES local_tracks(id) ON DELETE CASCADE
    );
  `);
}

// ── Playlist Operations ──────────────────────────────────────────────

export async function getPlaylists(): Promise<Playlist[]> {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    picture_uri: string | null;
    created_at: number;
    track_count: number;
  }>(`
    SELECT p.id, p.name, p.picture_uri, p.created_at, COUNT(pt.track_id) as track_count
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    pictureUri: r.picture_uri,
    createdAt: r.created_at,
    trackCount: r.track_count,
  }));
}

export async function createPlaylist(
  name: string,
  pictureUri: string | null = null
): Promise<Playlist> {
  const db = await getLocalDb();
  const id = "pl_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO playlists (id, name, picture_uri, created_at) VALUES (?, ?, ?, ?)`,
    [id, name.trim(), pictureUri, now]
  );

  playlistEvents.emit();

  return {
    id,
    name: name.trim(),
    pictureUri,
    createdAt: now,
    trackCount: 0,
  };
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`DELETE FROM playlist_tracks WHERE playlist_id = ?`, [playlistId]);
  await db.runAsync(`DELETE FROM playlists WHERE id = ?`, [playlistId]);
  playlistEvents.emit();
}

export async function updatePlaylistPicture(
  playlistId: string,
  pictureUri: string | null
): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`UPDATE playlists SET picture_uri = ? WHERE id = ?`, [
    pictureUri,
    playlistId,
  ]);
  playlistEvents.emit();
}

// ── Track & Playlist Membership ──────────────────────────────────────

export async function saveTrackMetadata(track: Track): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO local_tracks (id, title, artist, duration, thumbnail, file_path, downloaded_at)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT downloaded_at FROM local_tracks WHERE id = ?), NULL))`,
    [
      track.id,
      track.title,
      track.artist,
      track.duration,
      track.thumbnail,
      track.filePath ?? null,
      track.id,
    ]
  );
}

export async function addTrackToPlaylist(
  playlistId: string,
  track: Track
): Promise<void> {
  const db = await getLocalDb();
  await saveTrackMetadata(track);

  // Determine next position
  const posRow = await db.getFirstAsync<{ max_pos: number | null }>(
    `SELECT MAX(position) as max_pos FROM playlist_tracks WHERE playlist_id = ?`,
    [playlistId]
  );
  const nextPos = (posRow?.max_pos ?? -1) + 1;

  await db.runAsync(
    `INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
     VALUES (?, ?, ?, ?)`,
    [playlistId, track.id, nextPos, Date.now()]
  );
  playlistEvents.emit();
}

export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string
): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(
    `DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?`,
    [playlistId, trackId]
  );
  playlistEvents.emit();
}

export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<{
    id: string;
    title: string | null;
    artist: string | null;
    duration: number | null;
    thumbnail: string | null;
    file_path: string | null;
  }>(
    `SELECT t.id, t.title, t.artist, t.duration, t.thumbnail, t.file_path
     FROM playlist_tracks pt
     JOIN local_tracks t ON pt.track_id = t.id
     WHERE pt.playlist_id = ?
     ORDER BY pt.position ASC`,
    [playlistId]
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    duration: r.duration,
    thumbnail: r.thumbnail,
    filePath: r.file_path,
  }));
}
