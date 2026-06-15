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


def get_dimensions(path: str) -> tuple[int, int]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height",
         "-of", "csv=p=0", path],
        capture_output=True, text=True
    )
    try:
        w, h = result.stdout.strip().split(",")
        return int(w), int(h)
    except Exception:
        return 0, 0


def process_video(input_path: str) -> str | None:
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    basename = os.path.basename(input_path)
    output_path = os.path.join(PROCESSED_DIR, basename)

    duration = get_duration(input_path)
    trim = f"-t {VIDEO_DURATION_MAX}" if duration > VIDEO_DURATION_MAX else ""

    w, h = get_dimensions(input_path)
    is_portrait = h > w

    if is_portrait:
        # Already vertical — just scale to 1080x1920
        vf = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
    else:
        # Landscape — crop center to 9:16 then scale
        vf = "crop=ih*9/16:ih,scale=1080:1920"

    cmd = (
        f'ffmpeg -y -i "{input_path}" {trim} '
        f'-vf "{vf}" '
        f'-c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k '
        f'"{output_path}"'
    )
    logger.info(f"Processing: {basename} ({w}x{h})")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error(f"ffmpeg error: {result.stderr}")
        return None
    logger.info(f"Processed: {output_path}")
    return output_path
