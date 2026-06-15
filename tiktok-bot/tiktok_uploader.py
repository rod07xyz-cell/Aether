import os
import requests
import logging
from config import TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_ACCESS_TOKEN

logger = logging.getLogger(__name__)

AUTH_URL = "https://open.tiktokapis.com/v2/oauth/token/"
UPLOAD_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/"
UPLOAD_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/"


def get_access_token(code: str) -> dict:
    """Exchange OAuth code for access token. Run once manually."""
    data = {
        "client_key": TIKTOK_CLIENT_KEY,
        "client_secret": TIKTOK_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": "https://rod07xyz-cell.github.io/Aether/callback",  # must match your TikTok app config
    }
    r = requests.post(AUTH_URL, data=data)
    r.raise_for_status()
    return r.json()


def upload_video(video_path: str, caption: str = "") -> bool:
    if not TIKTOK_ACCESS_TOKEN:
        logger.error("TIKTOK_ACCESS_TOKEN not set")
        return False

    file_size = os.path.getsize(video_path)
    headers = {
        "Authorization": f"Bearer {TIKTOK_ACCESS_TOKEN}",
        "Content-Type": "application/json; charset=UTF-8",
    }

    # Step 1: Init upload
    payload = {
        "post_info": {
            "title": caption or "Check this out! #viral #fyp",
            "privacy_level": "SELF_ONLY",
            "disable_duet": False,
            "disable_comment": False,
            "disable_stitch": False,
        },
        "source_info": {
            "source": "FILE_UPLOAD",
            "video_size": file_size,
            "chunk_size": file_size,
            "total_chunk_count": 1,
        },
    }
    r = requests.post(UPLOAD_INIT_URL, json=payload, headers=headers, timeout=15)
    if r.status_code != 200:
        logger.error(f"Init failed: {r.text}")
        return False

    data = r.json().get("data", {})
    publish_id = data.get("publish_id")
    upload_url = data.get("upload_url")

    # Step 2: Upload file
    with open(video_path, "rb") as f:
        video_data = f.read()

    upload_headers = {
        "Content-Type": "video/mp4",
        "Content-Range": f"bytes 0-{file_size - 1}/{file_size}",
        "Content-Length": str(file_size),
    }
    r2 = requests.put(upload_url, data=video_data, headers=upload_headers, timeout=120)
    if r2.status_code not in (200, 201):
        logger.error(f"Upload failed: {r2.text}")
        return False

    logger.info(f"Uploaded successfully. Publish ID: {publish_id}")
    return True
