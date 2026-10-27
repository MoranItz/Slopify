import re
import asyncio
from pathlib import Path

import yt_dlp

from db import add_track, get_track_by_id

TRACKS_DIR = Path(__file__).parent / "tracks"
TRACKS_DIR.mkdir(exist_ok=True)

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# ── Shared download concurrency controls ─────────────────────
_semaphore = asyncio.Semaphore(2)          # max 2 simultaneous yt-dlp jobs
_in_flight: dict[str, asyncio.Event] = {}  # video_id → Event (set when done)


def _pick_thumbnail(entry: dict) -> str | None:
    if entry.get("thumbnail"):
        return entry["thumbnail"]
    thumbs = entry.get("thumbnails") or []
    if thumbs:
        return thumbs[-1].get("url")  # last one is usually the largest
    if entry.get("id"):
        return f"https://i.ytimg.com/vi/{entry['id']}/hqdefault.jpg"
    return None


def search(query: str, limit: int = 10) -> list[dict]:
    options = {
        "quiet": True,
        "extract_flat": True, # list results only, don't dig into each video
        "skip_download": True, # don't download anything
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)

    results = []
    for entry in info.get("entries", []):
        if not entry or not entry.get("id"):
            continue
        results.append({
            "id": entry["id"],
            "title": entry.get("title"),
            "artist": entry.get("channel") or entry.get("uploader"),
            "duration": entry.get("duration"),
            "thumbnail": _pick_thumbnail(entry),
        })
    return results


def _download_sync(video_id: str) -> dict:
    """Blocking download – runs in a thread."""
    options = {
        "format": "bestaudio/best",
        "outtmpl": str(TRACKS_DIR / "%(id)s.%(ext)s"),
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "m4a",
        }],
        "quiet": True,
    }
    url = f"https://www.youtube.com/watch?v={video_id}"
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=True)

    filename = f"{video_id}.m4a"
    if not (TRACKS_DIR / filename).is_file():
        raise RuntimeError(f"download finished but {filename} is missing")

    title = info.get("title") or video_id
    artist = info.get("artist") or info.get("uploader")
    duration = info.get("duration")
    thumbnail = _pick_thumbnail(info)

    add_track(video_id, title, artist, duration, filename, thumbnail)
    return get_track_by_id(video_id)


async def download_queued(video_id: str) -> dict:
    """
    Download a single track through the shared semaphore.
    If the same video_id is already in-flight, wait for that one
    to finish instead of starting a duplicate download.
    """
    if not VIDEO_ID_RE.match(video_id):
        raise ValueError("invalid video id")

    # Cache check: already have it on disk?
    existing = get_track_by_id(video_id)
    if existing and (TRACKS_DIR / existing["filename"]).is_file():
        return existing

    # Dedup: if someone else is already downloading this track, wait for them
    if video_id in _in_flight:
        await _in_flight[video_id].wait()
        result = get_track_by_id(video_id)
        if result:
            return result
        # If still missing after the other download finished, fall through and try ourselves

    # Register ourselves as the downloader
    done_event = asyncio.Event()
    _in_flight[video_id] = done_event

    try:
        async with _semaphore:
            # Re-check cache after acquiring the semaphore (another queued job may have finished it)
            existing = get_track_by_id(video_id)
            if existing and (TRACKS_DIR / existing["filename"]).is_file():
                return existing
            return await asyncio.to_thread(_download_sync, video_id)
    finally:
        done_event.set()
        _in_flight.pop(video_id, None)


def download(video_id: str) -> dict:
    """Legacy synchronous wrapper – kept for backward compatibility."""
    if not VIDEO_ID_RE.match(video_id):
        raise ValueError("invalid video id")

    existing = get_track_by_id(video_id)
    if existing and (TRACKS_DIR / existing["filename"]).is_file():
        return existing

    return _download_sync(video_id)


def extract_playlist(url: str) -> dict:
    """
    Extract metadata for all videos in a YouTube playlist (no downloading).
    Returns {"name": "...", "tracks": [{id, title, artist, duration, thumbnail}, ...]}.
    """
    options = {
        "quiet": True,
        "extract_flat": True,
        "skip_download": True,
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)

    playlist_name = info.get("title") or "Imported Playlist"

    tracks = []
    for entry in info.get("entries", []):
        if not entry or not entry.get("id"):
            continue
        tracks.append({
            "id": entry["id"],
            "title": entry.get("title"),
            "artist": entry.get("channel") or entry.get("uploader"),
            "duration": entry.get("duration"),
            "thumbnail": _pick_thumbnail(entry),
        })
    return {"name": playlist_name, "tracks": tracks}