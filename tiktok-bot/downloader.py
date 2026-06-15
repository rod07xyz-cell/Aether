import os
import random
import requests
import logging
from config import (
    PEXELS_API_KEY, PIXABAY_API_KEY,
    VIDEO_CATEGORIES, RAW_DIR
)

logger = logging.getLogger(__name__)


def search_pexels(query: str, per_page: int = 10) -> list[dict]:
    if not PEXELS_API_KEY:
        logger.warning("PEXELS_API_KEY not set, skipping Pexels")
        return []
    headers = {"Authorization": PEXELS_API_KEY}
    url = "https://api.pexels.com/videos/search"
    params = {"query": query, "per_page": per_page, "size": "medium", "orientation": "portrait"}
    try:
        r = requests.get(url, headers=headers, params=params, timeout=10)
        r.raise_for_status()
        videos = r.json().get("videos", [])
        results = []
        for v in videos:
            files = v.get("video_files", [])
            # prefer HD portrait files
            hd = next((f for f in files if f.get("quality") == "hd"), files[0] if files else None)
            if hd:
                results.append({"url": hd["link"], "source": "pexels", "id": str(v["id"])})
        return results
    except Exception as e:
        logger.error(f"Pexels error: {e}")
        return []


def search_pixabay(query: str, per_page: int = 10) -> list[dict]:
    if not PIXABAY_API_KEY:
        logger.warning("PIXABAY_API_KEY not set, skipping Pixabay")
        return []
    url = "https://pixabay.com/api/videos/"
    params = {
        "key": PIXABAY_API_KEY,
        "q": query,
        "per_page": per_page,
        "video_type": "film",
        "safesearch": "true",
    }
    try:
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        hits = r.json().get("hits", [])
        results = []
        for v in hits:
            videos = v.get("videos", {})
            # prefer medium quality
            chosen = videos.get("medium") or videos.get("small") or videos.get("large")
            if chosen:
                results.append({"url": chosen["url"], "source": "pixabay", "id": str(v["id"])})
        return results
    except Exception as e:
        logger.error(f"Pixabay error: {e}")
        return []


def download_video(video: dict) -> str | None:
    os.makedirs(RAW_DIR, exist_ok=True)
    filename = f"{video['source']}_{video['id']}.mp4"
    path = os.path.join(RAW_DIR, filename)
    if os.path.exists(path):
        logger.info(f"Already downloaded: {filename}")
        return path
    try:
        logger.info(f"Downloading {video['url']}")
        r = requests.get(video["url"], stream=True, timeout=30)
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        logger.info(f"Saved: {path}")
        return path
    except Exception as e:
        logger.error(f"Download failed: {e}")
        return None


def fetch_random_video() -> str | None:
    category = random.choice(VIDEO_CATEGORIES)
    logger.info(f"Searching for: {category}")
    results = search_pexels(category) + search_pixabay(category)
    if not results:
        logger.error("No videos found from any source")
        return None
    video = random.choice(results)
    return download_video(video)
