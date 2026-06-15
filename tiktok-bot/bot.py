#!/usr/bin/env python3
"""Main bot runner. Called by cron at scheduled times."""

import logging
import os
from config import LOG_FILE
from downloader import fetch_random_video
from processor import process_video
from tiktok_uploader import upload_video

os.makedirs("logs", exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


def run():
    logger.info("=== Bot run started ===")

    raw_path = fetch_random_video()
    if not raw_path:
        logger.error("Could not download a video. Aborting.")
        return

    processed_path = process_video(raw_path)
    if not processed_path:
        logger.error("Video processing failed. Aborting.")
        return

    success = upload_video(processed_path)
    if success:
        logger.info("Video posted to TikTok successfully.")
    else:
        logger.error("TikTok upload failed.")


if __name__ == "__main__":
    run()
