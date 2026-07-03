import urllib.parse
from http.server import BaseHTTPRequestHandler

from api.lib.responses import json_response
from api.matches import (
    FOOTBALL_DATA_ENV_KEYS,
    env_value,
    fetch_matches,
    normalize_football_data_match,
    read_mock_matches,
    request_football_data,
)


def score_breakdown(score):
    score = score or {}
    return {
        "duration": score.get("duration") or "",
        "fullTime": score.get("fullTime") or {},
        "halfTime": score.get("halfTime") or {},
        "winner": score.get("winner") or "",
    }


def normalize_referees(referees):
    return [
        {
            "name": referee.get("name") or "",
            "type": referee.get("type") or "",
            "nationality": referee.get("nationality") or "",
        }
        for referee in referees or []
        if referee.get("name")
    ]


def fallback_match(match_id):
    payload = fetch_matches()
    for match in payload.get("matches", []):
        if str(match.get("id")) == str(match_id):
            return {
                "source": payload.get("source", "fallback"),
                "match": match,
                "details": {
                    "lastUpdated": "",
                    "referees": [],
                    "scoreBreakdown": {},
                    "goalDataUnavailable": True,
                    "goalDataMessage": "Goal scorer details are not available from the current match feed.",
                },
            }

    for match in read_mock_matches():
        if str(match.get("id")) == str(match_id):
            return {
                "source": "mock",
                "match": match,
                "details": {
                    "lastUpdated": "",
                    "referees": [],
                    "scoreBreakdown": {},
                    "goalDataUnavailable": True,
                    "goalDataMessage": "Showing local fallback match details.",
                },
            }
    raise ValueError("Match not found")


def get_match_details_payload(match_id):
    if not match_id:
        raise ValueError("match id is required")

    football_data_key = env_value(FOOTBALL_DATA_ENV_KEYS)
    if football_data_key and str(match_id).isdigit():
        try:
            raw = request_football_data(f"/matches/{match_id}", {}, football_data_key)
            match = normalize_football_data_match(raw)
            return {
                "source": "football-data.org",
                "match": match,
                "details": {
                    "lastUpdated": raw.get("lastUpdated") or "",
                    "referees": normalize_referees(raw.get("referees")),
                    "scoreBreakdown": score_breakdown(raw.get("score")),
                    "goalDataUnavailable": not bool(match.get("goals")),
                    "goalDataMessage": "Goal scorer events are not included in the current football-data.org match response.",
                },
            }
        except Exception:
            return fallback_match(match_id)

    return fallback_match(match_id)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True}, methods="GET, OPTIONS")

    def do_GET(self):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        match_id = query.get("id", [""])[0].strip()
        try:
            payload = get_match_details_payload(match_id)
            json_response(self, 200, payload, cache_control="no-store", methods="GET, OPTIONS")
        except Exception as error:
            json_response(
                self,
                404,
                {"success": False, "error": str(error), "match": None},
                cache_control="no-store",
                methods="GET, OPTIONS",
            )
