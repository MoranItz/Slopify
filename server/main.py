import asyncio

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

import yt_dlp

from db import initialize_database, get_track_by_id, list_tracks
from ingest import search, download_queued, extract_playlist, TRACKS_DIR

app = FastAPI()
initialize_database()


@app.get("/health")  # simple server health check
def health():
    return {"status": "100 OK"}


@app.get("/search")  # search youtube by query string
def search_youtube(q: str):
    query = q.strip()
    if not query:
        raise HTTPException(status_code=400, detail="empty query")
    try:
        return search(query)
    except yt_dlp.utils.YoutubeDLError as e:
        raise HTTPException(status_code=502, detail=f"search failed: {e}")


@app.post("/tracks/{video_id}/ingest")  # download and ingest a track by video id
async def ingest_track(video_id: str):
    try:
        return await download_queued(video_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid video id")
    except yt_dlp.utils.YoutubeDLError as e:
        raise HTTPException(status_code=502, detail=f"download failed: {e}")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/tracks")  # return a list of all ingested tracks in the db (optional ?q= search)
def get_tracks(q: str | None = None):
    return list_tracks(q)


@app.get("/tracks/{track_id}/stream")  # stream the audio file for a given track id
def stream_track(track_id: str):
    track = get_track_by_id(track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="track not found")

    path = TRACKS_DIR / track["filename"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="audio file missing")

    return FileResponse(path, media_type="audio/mp4")


# ── YouTube playlist import ──────────────────────────────────

async def _download_playlist_tracks(video_ids: list[str]):
    """Background task: download all tracks through the shared queue."""
    tasks = [download_queued(vid) for vid in video_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    succeeded = sum(1 for r in results if not isinstance(r, Exception))
    failed = sum(1 for r in results if isinstance(r, Exception))
    print(f"Playlist import done: {succeeded} downloaded, {failed} failed")


@app.post("/playlists/ingest")
async def ingest_playlist(url: str, background_tasks: BackgroundTasks):
    """
    Accept a YouTube playlist URL, extract all video IDs,
    and schedule downloads in the background (2 at a time).
    Returns immediately with the playlist name and track list metadata.
    """
    url = url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="empty url")

    try:
        result = await asyncio.to_thread(extract_playlist, url)
    except yt_dlp.utils.YoutubeDLError as e:
        raise HTTPException(status_code=502, detail=f"playlist extraction failed: {e}")

    tracks = result["tracks"]
    playlist_name = result["name"]

    if not tracks:
        raise HTTPException(status_code=404, detail="no tracks found in playlist")

    video_ids = [t["id"] for t in tracks]
    background_tasks.add_task(_download_playlist_tracks, video_ids)

    return {
        "name": playlist_name,
        "count": len(tracks),
        "tracks": tracks,
    }
