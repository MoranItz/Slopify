from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

import yt_dlp

from db import initialize_database, get_track_by_id, list_tracks
from ingest import search, download, TRACKS_DIR

app = FastAPI()
initialize_database()


@app.get("/health") # simple server health check
def health():
    return {"status": "100 OK"}


@app.get("/search") # seach youtube by query string
def search_youtube(q: str):
    query = q.strip()
    if not query:
        raise HTTPException(status_code=400, detail="empty query")
    try:
        return search(query)
    except yt_dlp.utils.YoutubeDLError as e:
        raise HTTPException(status_code=502, detail=f"search failed: {e}")


@app.post("/tracks/{video_id}/ingest") # download and ingest a track by video id ( the code in the video url )
def ingest_track(video_id: str):
    try:
        return download(video_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid video id")
    except yt_dlp.utils.YoutubeDLError as e:
        raise HTTPException(status_code=502, detail=f"download failed: {e}")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/tracks") # return a list of all ingested tracks in the db (optional ?q= search)
def get_tracks(q: str | None = None):
    return list_tracks(q)


@app.get("/tracks/{track_id}/stream") # stream the audio file for a given track id from the db
def stream_track(track_id: str):
    track = get_track_by_id(track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="track not found")

    path = TRACKS_DIR / track["filename"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="audio file missing")

    return FileResponse(path, media_type="audio/mp4")