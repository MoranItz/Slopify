import re
from pathlib import Path

import yt_dlp

from db import add_track, get_track_by_id

TRACKS_DIR = Path(__file__).parent / "tracks"
TRACKS_DIR.mkdir(exist_ok=True)

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


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


def download(video_id: str) -> dict:
    if not VIDEO_ID_RE.match(video_id):
        raise ValueError("invalid video id")

    # cache check: already have it in the database and on disk?
    existing = get_track_by_id(video_id)
    if existing and (TRACKS_DIR / existing["filename"]).is_file():
        return existing

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