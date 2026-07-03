import json
import os
import urllib.parse
import urllib.request
from urllib.error import HTTPError, URLError
from http.server import BaseHTTPRequestHandler
from pathlib import Path

from api.lib.cache import get_cached_json, kv_get_json, kv_set_json, set_cached_json
from api.lib.config import MATCH_CACHE_KEY, MATCH_LAST_GOOD_KEY, cache_ttl_seconds
from api.lib.responses import json_response


API_BASE_URL = "https://v3.football.api-sports.io"
FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4"
WORLD_CUP_LEAGUE_ID = "1"
WORLD_CUP_SEASON = "2026"
FOOTBALL_DATA_COMPETITION = "WC"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MOCK_MATCHES_PATH = DATA_DIR / "mock_matches.json"
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
FOOTBALL_DATA_ENV_KEYS = ("FOOTBALL_DATA_KEY", "FOOTBALL_DATA_TOKEN", "FOOTBALL_DATA_API_KEY", "X_AUTH_TOKEN")
API_FOOTBALL_ENV_KEYS = ("API_FOOTBALL_KEY",)

TEAM_CODES = {
    "Argentina": "ar",
    "Australia": "au",
    "Belgium": "be",
    "Brazil": "br",
    "Canada": "ca",
    "Chile": "cl",
    "Colombia": "co",
    "Costa Rica": "cr",
    "Croatia": "hr",
    "Denmark": "dk",
    "Ecuador": "ec",
    "England": "gb-eng",
    "France": "fr",
    "Germany": "de",
    "Ghana": "gh",
    "Iran": "ir",
    "IR Iran": "ir",
    "Italy": "it",
    "Korea Republic": "kr",
    "Japan": "jp",
    "Mexico": "mx",
    "Morocco": "ma",
    "Nigeria": "ng",
    "Netherlands": "nl",
    "Poland": "pl",
    "Portugal": "pt",
    "Qatar": "qa",
    "Saudi Arabia": "sa",
    "Senegal": "sn",
    "Serbia": "rs",
    "South Korea": "kr",
    "Spain": "es",
    "Switzerland": "ch",
    "Tunisia": "tn",
    "United States": "us",
    "USA": "us",
    "Uruguay": "uy",
    "Wales": "gb-wls",
}

TLA_CODES = {
    "ARG": "ar",
    "AUS": "au",
    "BEL": "be",
    "BRA": "br",
    "CAN": "ca",
    "CHI": "cl",
    "COL": "co",
    "CRC": "cr",
    "CRO": "hr",
    "DEN": "dk",
    "ECU": "ec",
    "ENG": "gb-eng",
    "FRA": "fr",
    "GER": "de",
    "GHA": "gh",
    "IRN": "ir",
    "ITA": "it",
    "JPN": "jp",
    "KOR": "kr",
    "MAR": "ma",
    "MEX": "mx",
    "NED": "nl",
    "NGA": "ng",
    "POL": "pl",
    "POR": "pt",
    "QAT": "qa",
    "KSA": "sa",
    "SEN": "sn",
    "SRB": "rs",
    "ESP": "es",
    "SUI": "ch",
    "TUN": "tn",
    "USA": "us",
    "URU": "uy",
    "WAL": "gb-wls",
}

STAGE_ALIASES = {
    "round of 32": "Round of 32",
    "round of 16": "Round of 16",
    "8th finals": "Round of 16",
    "quarter-finals": "Quarter-finals",
    "quarter finals": "Quarter-finals",
    "semi-finals": "Semi-finals",
    "semi finals": "Semi-finals",
    "3rd place final": "Third-place",
    "third-place": "Third-place",
    "third place": "Third-place",
    "final": "Final",
}

FOOTBALL_DATA_STAGE_ALIASES = {
    "LAST_32": "Round of 32",
    "ROUND_OF_32": "Round of 32",
    "LAST_16": "Round of 16",
    "ROUND_OF_16": "Round of 16",
    "QUARTER_FINALS": "Quarter-finals",
    "SEMI_FINALS": "Semi-finals",
    "THIRD_PLACE": "Third-place",
    "THIRD_PLACE_PLAY_OFF": "Third-place",
    "FINAL": "Final",
    "GROUP_STAGE": "Group Stage",
}

FINISHED_STATUSES = {"FT", "AET", "PEN"}
LIVE_STATUSES = {"1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT"}
FOOTBALL_DATA_FINISHED_STATUSES = {"FINISHED"}
FOOTBALL_DATA_LIVE_STATUSES = {"IN_PLAY", "PAUSED", "LIVE"}
KNOCKOUT_STAGES = {
    "Round of 32",
    "Round of 16",
    "Quarter-finals",
    "Semi-finals",
    "Third-place",
    "Final",
}
KNOCKOUT_ORDER = {
    "Round of 32": 1,
    "Round of 16": 2,
    "Quarter-finals": 3,
    "Semi-finals": 4,
    "Third-place": 5,
    "Final": 6,
}
MAX_EVENT_LOOKUPS = 8


def read_mock_matches():
    with MOCK_MATCHES_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


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
    for key in keys:
        value = (os.environ.get(key) or "").strip()
        if value:
            return value
    return ""


def flag_for_team(team_name):
    code = TEAM_CODES.get(team_name or "", "")
    return {
        "name": team_name or "TBD",
        "code": code,
        "flag": f"https://flagcdn.com/w40/{code}.png" if code else "",
    }


def flag_for_football_data_team(team):
    team = team or {}
    name = team.get("name") or team.get("shortName") or "TBD"
    tla = (team.get("tla") or "").upper()
    code = TLA_CODES.get(tla) or TEAM_CODES.get(name, "")
    return {
        "name": name,
        "code": code,
        "flag": f"https://flagcdn.com/w40/{code}.png" if code else "",
    }


def normalize_stage(round_name):
    if not round_name:
        return "Knockout"
    lowered = round_name.lower()
    for key, value in STAGE_ALIASES.items():
        if key in lowered:
            return value
    return round_name.replace("_", " ").strip().title()


def normalize_football_data_stage(stage):
    if not stage:
        return "Knockout"
    return FOOTBALL_DATA_STAGE_ALIASES.get(stage, stage.replace("_", " ").strip().title())


def normalize_status(short_status):
    if short_status in FINISHED_STATUSES:
        return "completed"
    if short_status in LIVE_STATUSES:
        return "live"
    return "upcoming"


def normalize_football_data_status(status):
    if status in FOOTBALL_DATA_FINISHED_STATUSES:
        return "completed"
    if status in FOOTBALL_DATA_LIVE_STATUSES:
        return "live"
    return "upcoming"


def request_api(path, query, api_key):
    url = f"{API_BASE_URL}{path}?{urllib.parse.urlencode(query)}"
    request = urllib.request.Request(
        url,
        headers={
            "x-apisports-key": api_key,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API-Football HTTP {error.code}: {details[:500]}") from error
    except URLError as error:
        raise RuntimeError(f"API-Football connection error: {error.reason}") from error

    api_errors = payload.get("errors")
    if api_errors:
        raise RuntimeError(f"API-Football returned errors: {api_errors}")
    return payload


def request_football_data(path, query, api_key):
    url = f"{FOOTBALL_DATA_BASE_URL}{path}?{urllib.parse.urlencode(query)}"
    request = urllib.request.Request(
        url,
        headers={
            "X-Auth-Token": api_key,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"football-data.org HTTP {error.code}: {details[:500]}") from error
    except URLError as error:
        raise RuntimeError(f"football-data.org connection error: {error.reason}") from error


def fetch_goals(fixture_id, api_key):
    try:
        payload = request_api("/fixtures/events", {"fixture": fixture_id, "type": "Goal"}, api_key)
    except Exception:
        return []

    goals = []
    for event in payload.get("response", []):
        team = (event.get("team") or {}).get("name")
        player = (event.get("player") or {}).get("name")
        elapsed = (event.get("time") or {}).get("elapsed")
        if team and player:
            goals.append({"team": team, "player": player, "minute": elapsed})
    return goals


def match_score_value(score, side):
    score = score or {}
    for key in ("fullTime", "regularTime"):
        value = (score.get(key) or {}).get(side)
        if isinstance(value, int):
            return value
    return None


def normalize_football_data_match(item):
    home_team = item.get("homeTeam") or {}
    away_team = item.get("awayTeam") or {}
    score = item.get("score") or {}
    status = normalize_football_data_status(item.get("status"))
    home_name = home_team.get("name") or home_team.get("shortName") or "TBD"
    away_name = away_team.get("name") or away_team.get("shortName") or "TBD"
    score_winner = score.get("winner")

    winner = None
    if status == "completed":
        if score_winner == "HOME_TEAM":
            winner = home_name
        elif score_winner == "AWAY_TEAM":
            winner = away_name

    return {
        "id": str(item.get("id") or ""),
        "stage": normalize_football_data_stage(item.get("stage")),
        "homeTeam": flag_for_football_data_team(home_team),
        "awayTeam": flag_for_football_data_team(away_team),
        "date": item.get("utcDate"),
        "venue": item.get("venue") or "",
        "city": "",
        "status": status,
        "score": {
            "home": match_score_value(score, "home") if status in {"completed", "live"} else None,
            "away": match_score_value(score, "away") if status in {"completed", "live"} else None,
        },
        "winner": winner,
        "goals": [],
    }


def normalize_fixture(item):
    fixture = item.get("fixture") or {}
    teams = item.get("teams") or {}
    goals = item.get("goals") or {}
    league = item.get("league") or {}
    venue = fixture.get("venue") or {}
    status_payload = fixture.get("status") or {}
    short_status = status_payload.get("short")
    status = normalize_status(short_status)

    home_name = ((teams.get("home") or {}).get("name")) or "TBD"
    away_name = ((teams.get("away") or {}).get("name")) or "TBD"
    home_goals = goals.get("home")
    away_goals = goals.get("away")

    winner = None
    if status == "completed":
        home_winner = (teams.get("home") or {}).get("winner")
        away_winner = (teams.get("away") or {}).get("winner")
        if home_winner:
            winner = home_name
        elif away_winner:
            winner = away_name

    return {
        "id": str(fixture.get("id") or ""),
        "stage": normalize_stage(league.get("round")),
        "homeTeam": flag_for_team(home_name),
        "awayTeam": flag_for_team(away_name),
        "date": fixture.get("date"),
        "venue": venue.get("name") or "",
        "city": venue.get("city") or "",
        "status": status,
        "score": {
            "home": home_goals if status in {"completed", "live"} else None,
            "away": away_goals if status in {"completed", "live"} else None,
        },
        "winner": winner,
        "goals": [],
    }


def attach_goal_events(matches, api_key):
    completed_matches = [match for match in matches if match["status"] == "completed" and match["id"]]
    for match in completed_matches[:MAX_EVENT_LOOKUPS]:
        match["goals"] = fetch_goals(match["id"], api_key)


def sorted_matches(matches):
    return sorted(matches, key=lambda match: (KNOCKOUT_ORDER.get(match["stage"], 99), match.get("date") or ""))


def fetch_football_data_matches(api_key):
    try:
        payload = request_football_data(
            f"/competitions/{FOOTBALL_DATA_COMPETITION}/matches",
            {"season": WORLD_CUP_SEASON},
            api_key,
        )
    except Exception as error:
        raise RuntimeError(str(error)) from error

    fixtures = payload.get("matches", [])
    if not fixtures:
        raise RuntimeError("football-data.org returned no matches for competition=WC season=2026")

    normalized = [normalize_football_data_match(item) for item in fixtures]
    knockout_matches = [match for match in normalized if match["stage"] in KNOCKOUT_STAGES]
    selected_matches = knockout_matches or normalized

    return {
        "source": "football-data.org",
        "apiQuery": {"competition": FOOTBALL_DATA_COMPETITION, "season": WORLD_CUP_SEASON},
        "totalFixtures": len(fixtures),
        "knockoutFixtures": len(knockout_matches),
        "matches": sorted_matches(selected_matches),
    }


def fetch_api_football_matches(api_key):
    payload = request_api(
        "/fixtures",
        {"league": WORLD_CUP_LEAGUE_ID, "season": WORLD_CUP_SEASON},
        api_key,
    )
    fixtures = payload.get("response", [])
    if not fixtures:
        raise RuntimeError("API-Football returned no fixtures for league=1 season=2026")

    normalized = [normalize_fixture(item) for item in fixtures]
    knockout_matches = [match for match in normalized if match["stage"] in KNOCKOUT_STAGES]
    selected_matches = knockout_matches or normalized
    try:
        attach_goal_events(selected_matches, api_key)
    except Exception:
        pass

    return {
        "source": "api-football",
        "apiQuery": {"league": WORLD_CUP_LEAGUE_ID, "season": WORLD_CUP_SEASON},
        "totalFixtures": len(fixtures),
        "knockoutFixtures": len(knockout_matches),
        "matches": sorted_matches(selected_matches),
    }


def fetch_matches():
    load_local_env()
    football_data_key = env_value(FOOTBALL_DATA_ENV_KEYS)
    api_football_key = env_value(API_FOOTBALL_ENV_KEYS)
    errors = []

    if football_data_key:
        try:
            return fetch_football_data_matches(football_data_key)
        except Exception as error:
            errors.append(str(error))

    if api_football_key:
        try:
            return fetch_api_football_matches(api_football_key)
        except Exception as error:
            errors.append(str(error))

    if not football_data_key and not api_football_key:
        errors.append("FOOTBALL_DATA_KEY is not configured")

    return {
        "source": "mock",
        "fallbackReason": " | ".join(errors),
        "apiQuery": {"competition": FOOTBALL_DATA_COMPETITION, "season": WORLD_CUP_SEASON},
        "matches": read_mock_matches(),
    }


def get_matches_payload(force_refresh=False):
    ttl_seconds = cache_ttl_seconds()
    if not force_refresh:
        cached = get_cached_json(MATCH_CACHE_KEY)
        if cached:
            cached["cacheStatus"] = "hit"
            return cached

    payload = fetch_matches()
    payload["cacheStatus"] = "miss"
    if payload.get("source") != "mock":
        set_cached_json(MATCH_CACHE_KEY, payload, ttl_seconds)
        try:
            kv_set_json(MATCH_LAST_GOOD_KEY, payload)
        except Exception:
            pass
    else:
        try:
            last_good = kv_get_json(MATCH_LAST_GOOD_KEY)
            if last_good:
                last_good["cacheStatus"] = "last-good"
                last_good["fallbackReason"] = payload.get("fallbackReason", "Served last known good match data")
                return last_good
        except Exception:
            pass
    return payload


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True}, methods="GET, OPTIONS")

    def do_GET(self):
        try:
            payload = get_matches_payload()
            json_response(
                self,
                200,
                payload,
                cache_control=f"s-maxage={cache_ttl_seconds()}, stale-while-revalidate={cache_ttl_seconds() * 2}",
                methods="GET, OPTIONS",
            )
        except Exception as error:
            json_response(
                self,
                200,
                {
                    "source": "mock",
                    "fallbackReason": str(error),
                    "apiQuery": {"competition": FOOTBALL_DATA_COMPETITION, "season": WORLD_CUP_SEASON},
                    "matches": read_mock_matches(),
                },
                cache_control="s-maxage=60, stale-while-revalidate=300",
                methods="GET, OPTIONS",
            )
