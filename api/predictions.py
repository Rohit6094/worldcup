from http.server import BaseHTTPRequestHandler

from api.lib.config import is_vercel_kv_configured
from api.lib.responses import error_payload, json_response, parse_json_body
from api.lib.storage import delete_prediction, list_predictions


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True}, methods="GET, DELETE, OPTIONS")

    def do_GET(self):
        predictions = list_predictions()
        json_response(
            self,
            200,
            {"source": "vercel-kv" if is_vercel_kv_configured() else "local-json", "predictions": predictions},
            cache_control="no-store",
            methods="GET, OPTIONS",
        )

    def do_DELETE(self):
        try:
            payload = parse_json_body(self)
        except Exception:
            json_response(self, 400, error_payload("Invalid JSON body", "invalid_json"), methods="GET, DELETE, OPTIONS")
            return

        match_id = str(payload.get("matchId", "")).strip()
        user_id = str(payload.get("userId", "")).strip()
        user_email = str(payload.get("username") or payload.get("userEmail", "")).strip()
        if not match_id or not (user_id or user_email):
            json_response(
                self,
                400,
                error_payload("matchId and userId or userEmail are required", "validation_error"),
                methods="GET, DELETE, OPTIONS",
            )
            return

        result = delete_prediction(match_id, user_id, user_email)
        json_response(self, 200, {"success": True, **result}, cache_control="no-store", methods="GET, DELETE, OPTIONS")
