import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"
ENV_PATH = ROOT_DIR / ".env"

WORLD_CUP_SEASON = "2026"
FOOTBALL_DATA_COMPETITION = "WC"
FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4"
API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io"
API_FOOTBALL_WORLD_CUP_LEAGUE_ID = "1"

MATCH_CACHE_KEY = "wc2026:matches:v1"
MATCH_LAST_GOOD_KEY = "wc2026:matches:last-good:v1"

CORRECT_WINNER_POINTS = 1
EXACT_SCORE_POINTS = 3

FOOTBALL_DATA_ENV_KEYS = ("FOOTBALL_DATA_KEY", "FOOTBALL_DATA_TOKEN", "FOOTBALL_DATA_API_KEY", "X_AUTH_TOKEN")
API_FOOTBALL_ENV_KEYS = ("API_FOOTBALL_KEY",)


def load_local_env():
    if not ENV_PATH.exists():
        return

    for raw_line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value


def env_value(keys):
    load_local_env()
    for key in keys:
        value = (os.environ.get(key) or "").strip()
        if value:
            return value
    return ""


def cache_ttl_seconds():
    load_local_env()
    try:
        return max(60, int(os.environ.get("MATCH_CACHE_TTL_SECONDS", "900")))
    except ValueError:
        return 900


def is_vercel_kv_configured():
    load_local_env()
    return bool(os.environ.get("KV_REST_API_URL") and os.environ.get("KV_REST_API_TOKEN"))


def is_google_sheets_configured():
    load_local_env()
    return bool(os.environ.get("GOOGLE_SHEETS_WEBHOOK_URL"))
