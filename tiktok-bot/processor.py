import os
import subprocess
import logging
from config import VIDEO_DURATION_MAX, PROCESSED_DIR

logger = logging.getLogger(__name__)


def get_duration(path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True
    )
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def process_video(input_path: str) -> str | None:
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    basename = os.path.basename(input_path)
    output_path = os.path.join(PROCESSED_DIR, basename)

    duration = get_duration(input_path)
    trim = f"-t {VIDEO_DURATION_MAX}" if duration > VIDEO_DURATION_MAX else ""

    # Crop to 9:16 portrait, scale to 1080x1920
    cmd = (
        f'ffmpeg -y -i "{input_path}" {trim} '
        f'-vf "crop=ih*9/16:ih,scale=1080:1920" '
        f'-c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k '
        f'"{output_path}"'
    )
    logger.info(f"Processing: {basename}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error(f"ffmpeg error: {result.stderr}")
        return None
    logger.info(f"Processed: {output_path}")
    return output_path
