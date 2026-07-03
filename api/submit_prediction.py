from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler

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
    if payload.get("predictedWinner") == "Draw / Penalties":
        if not str(payload.get("advancingTeam", "")).strip():
            return "advancingTeam is required for penalty predictions"
        if payload.get("homeScore") != payload.get("awayScore"):
            return "main score must be tied for penalty predictions"
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

        error = validate_prediction(payload)
        if error:
            json_response(self, 400, error_payload(error, "validation_error"), methods="POST, OPTIONS")
            return

        prediction = {
            "matchId": str(payload["matchId"]).strip(),
            "userId": str(payload.get("userId", "")).strip(),
            "userEmail": str(payload.get("userEmail", "")).strip(),
            "username": str(payload.get("username", "")).strip(),
            "displayName": str(payload["displayName"]).strip()[:80],
            "predictedWinner": str(payload["predictedWinner"]).strip(),
            "advancingTeam": str(payload.get("advancingTeam") or payload["predictedWinner"]).strip(),
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
