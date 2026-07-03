from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

from api.lib.responses import error_payload, json_response, parse_json_body
from api.lib.storage import save_prediction


REQUIRED_FIELDS = ("matchId", "displayName", "predictedWinner", "homeScore", "awayScore")


def is_non_negative_integer(value):
    return isinstance(value, int) and value >= 0


def validate_prediction(payload):
    missing = [field for field in REQUIRED_FIELDS if field not in payload]
    if missing:
        return f"Missing required fields: {', '.join(missing)}"

    if not str(payload.get("matchId", "")).strip():
        return "matchId is required"
    if not str(payload.get("displayName", "")).strip():
        return "displayName is required"
    if not str(payload.get("predictedWinner", "")).strip():
        return "predictedWinner is required"
    if not str(payload.get("advancingTeam", "")).strip():
        return "advancingTeam is required"
    if not is_non_negative_integer(payload.get("homeScore")):
        return "homeScore must be a non-negative integer"
    if not is_non_negative_integer(payload.get("awayScore")):
        return "awayScore must be a non-negative integer"
    if payload.get("predictedWinner") != "Draw / Penalties" and payload.get("advancingTeam") != payload.get("predictedWinner"):
        return "advancingTeam must match predictedWinner unless predicting Draw / Penalties"
    if payload.get("predictedWinner") == "Draw / Penalties":
        if payload.get("homeScore") != payload.get("awayScore"):
            return "main score must be tied for penalty predictions"
        if not is_non_negative_integer(payload.get("penaltyHomeScore")):
            return "penaltyHomeScore must be a non-negative integer"
        if not is_non_negative_integer(payload.get("penaltyAwayScore")):
            return "penaltyAwayScore must be a non-negative integer"
        if payload.get("penaltyHomeScore") == payload.get("penaltyAwayScore"):
            return "penalty score must have a winning team"
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
            "advancingTeam": str(payload.get("advancingTeam", "")).strip(),
            "homeScore": payload["homeScore"],
            "awayScore": payload["awayScore"],
            "penaltyHomeScore": payload.get("penaltyHomeScore"),
            "penaltyAwayScore": payload.get("penaltyAwayScore"),
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
