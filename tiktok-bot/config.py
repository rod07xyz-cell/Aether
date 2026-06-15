import os

# --- API Keys ---
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "")
PIXABAY_API_KEY = os.getenv("PIXABAY_API_KEY", "")

# --- TikTok ---
TIKTOK_CLIENT_KEY = os.getenv("TIKTOK_CLIENT_KEY", "")
TIKTOK_CLIENT_SECRET = os.getenv("TIKTOK_CLIENT_SECRET", "")
TIKTOK_ACCESS_TOKEN = os.getenv("TIKTOK_ACCESS_TOKEN", "")

# --- Video settings ---
VIDEO_DURATION_MIN = 7    # seconds
VIDEO_DURATION_MAX = 30   # seconds
VIDEO_CATEGORIES = ["nature", "animals", "city timelapse", "satisfying", "extreme sports"]

# --- Schedule (24h format, server timezone) ---
UPLOAD_TIMES = ["09:00", "15:00", "21:00"]  # 3 posts per day

# --- Paths ---
RAW_DIR = "videos/raw"
PROCESSED_DIR = "videos/processed"
LOG_FILE = "logs/bot.log"
