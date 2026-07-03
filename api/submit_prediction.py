from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler

from api.auth import authenticated_user_from_headers
from api.lib.responses import error_payload, json_response, parse_json_body
from api.lib.storage import save_prediction
from api.matches import get_matches_payload


REQUIRED_FIELDS = ("matchId", "displayName", "predictedWinner", "homeScore", "awayScore")


def is_non_negative_integer(value):
    return isinstance(value, int) and value >= 0


def parse_match_date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def find_match(match_id):
    payload = get_matches_payload()
    for match in payload.get("matches", []):
        if str(match.get("id")) == str(match_id):
            return match
    return None


def validate_prediction_cutoff(match_id):
    match = find_match(match_id)
    if not match:
        return "Match could not be found"
    if match.get("status") != "upcoming":
        return "Predictions are closed for this match"

    kickoff = parse_match_date(match.get("date"))
    if not kickoff:
        return "Match kickoff time is unavailable"

    cutoff = kickoff - timedelta(hours=1)
    if datetime.now(timezone.utc) >= cutoff:
        return "Predictions close one hour before kickoff"
    return None


def is_prediction_open_for_match(match_id):
    return validate_prediction_cutoff(match_id) is None


def validate_score_matches_winner(payload):
    match = find_match(str(payload.get("matchId", "")).strip())
    if not match:
        return "Match could not be found"

    home_name = str((match.get("homeTeam") or {}).get("name") or "Home team").strip()
    away_name = str((match.get("awayTeam") or {}).get("name") or "Away team").strip()
    predicted_winner = str(payload.get("predictedWinner", "")).strip()
    advancing_team = str(payload.get("advancingTeam", "")).strip()
    home_score = payload.get("homeScore")
    away_score = payload.get("awayScore")

    if predicted_winner == "Draw / Penalties":
        if not advancing_team:
            return "advancingTeam is required for penalty predictions"
        if advancing_team not in {home_name, away_name}:
            return "advancingTeam must be one of the match teams"
        if home_score != away_score:
            return "main score must be tied for penalty predictions"
        return None

    if predicted_winner not in {home_name, away_name}:
        return "predictedWinner must be one of the match teams or Draw / Penalties"
    if predicted_winner == home_name and home_score <= away_score:
        return f"{home_name} goals must be greater than {away_name} goals"
    if predicted_winner == away_name and away_score <= home_score:
        return f"{away_name} goals must be greater than {home_name} goals"
    return None


def validate_prediction(payload):
    missing = [field for field in REQUIRED_FIELDS if field not in payload]
    if missing:
        return f"Missing required fields: {', '.join(missing)}"

    if not str(payload.get("matchId", "")).strip():
        return "matchId is required"
    cutoff_error = validate_prediction_cutoff(str(payload.get("matchId", "")).strip())
    if cutoff_error:
        return cutoff_error
    if not str(payload.get("displayName", "")).strip():
        return "displayName is required"
    if not str(payload.get("predictedWinner", "")).strip():
        return "predictedWinner is required"
    if not is_non_negative_integer(payload.get("homeScore")):
        return "homeScore must be a non-negative integer"
    if not is_non_negative_integer(payload.get("awayScore")):
        return "awayScore must be a non-negative integer"
    score_error = validate_score_matches_winner(payload)
    if score_error:
        return score_error
    return None


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True}, methods="POST, OPTIONS")

    def do_POST(self):
        try:
            payload = parse_json_body(self)
        except ValueError as error:
            json_response(self, 413, error_payload(str(error), "request_too_large"), methods="POST, OPTIONS")
            return
        except Exception:
            json_response(self, 400, error_payload("Invalid JSON body", "invalid_json"), methods="POST, OPTIONS")
            return

        requester = authenticated_user_from_headers(self.headers)
        if not requester:
            json_response(self, 401, error_payload("Login is required to submit predictions", "auth_required"), methods="POST, OPTIONS")
            return

        payload["displayName"] = requester.get("displayName") or requester.get("username") or payload.get("displayName", "")
        error = validate_prediction(payload)
        if error:
            json_response(self, 400, error_payload(error, "validation_error"), methods="POST, OPTIONS")
            return

        advancing_team = payload["advancingTeam"] if payload["predictedWinner"] == "Draw / Penalties" else payload["predictedWinner"]
        prediction = {
            "matchId": str(payload["matchId"]).strip(),
            "userId": str(requester.get("id", "")).strip(),
            "userEmail": str(requester.get("email") or requester.get("username") or "").strip(),
            "username": str(requester.get("username") or requester.get("email") or "").strip(),
            "displayName": str(requester.get("displayName") or payload["displayName"]).strip()[:80],
            "predictedWinner": str(payload["predictedWinner"]).strip(),
            "advancingTeam": str(advancing_team).strip(),
            "homeScore": payload["homeScore"],
            "awayScore": payload["awayScore"],
            "submittedAt": datetime.now(timezone.utc).isoformat(),
        }

        try:
            saved_prediction = save_prediction(prediction)
        except Exception as error:
            json_response(self, 503, error_payload("Prediction storage is unavailable", "storage_unavailable", str(error)), methods="POST, OPTIONS")
            return

        json_response(self, 200, {"success": True, "prediction": saved_prediction}, methods="POST, OPTIONS")

    def do_GET(self):
        json_response(self, 405, error_payload("Use POST to submit predictions", "method_not_allowed"), methods="POST, OPTIONS")
