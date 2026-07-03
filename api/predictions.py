from http.server import BaseHTTPRequestHandler

from api.auth import authenticated_user_from_headers
from api.lib.config import is_vercel_kv_configured
from api.lib.responses import error_payload, json_response, parse_json_body
from api.lib.storage import delete_prediction, list_predictions, prediction_identity_values, target_identity_values
from api.submit_prediction import validate_prediction_cutoff


def user_keys(user):
    return {
        str(user.get("id") or "").strip().lower(),
        str(user.get("username") or "").strip().lower(),
        str(user.get("email") or "").strip().lower(),
        str(user.get("displayName") or "").strip().lower(),
    } - {""}


def requester_can_access_prediction(requester, prediction):
    if requester.get("role") == "admin":
        return True
    return bool(user_keys(requester).intersection(prediction_identity_values(prediction)))


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True}, methods="GET, DELETE, OPTIONS")

    def do_GET(self):
        requester = authenticated_user_from_headers(self.headers)
        if not requester:
            json_response(self, 401, error_payload("Login is required to view predictions", "auth_required"), methods="GET, DELETE, OPTIONS")
            return

        predictions = list_predictions()
        json_response(
            self,
            200,
            {"source": "vercel-kv" if is_vercel_kv_configured() else "local-json", "predictions": predictions},
            cache_control="no-store",
            methods="GET, OPTIONS",
        )

    def do_DELETE(self):
        requester = authenticated_user_from_headers(self.headers)
        if not requester:
            json_response(self, 401, error_payload("Login is required to delete predictions", "auth_required"), methods="GET, DELETE, OPTIONS")
            return

        try:
            payload = parse_json_body(self)
        except Exception:
            json_response(self, 400, error_payload("Invalid JSON body", "invalid_json"), methods="GET, DELETE, OPTIONS")
            return

        match_id = str(payload.get("matchId", "")).strip()
        user_id = str(payload.get("userId", "")).strip()
        username = str(payload.get("username", "")).strip()
        user_email = str(payload.get("userEmail", "")).strip()
        display_name = str(payload.get("displayName", "")).strip()
        if not match_id or not target_identity_values(user_id, user_email, username, display_name):
            json_response(
                self,
                400,
                error_payload("matchId and a user identifier are required", "validation_error"),
                methods="GET, DELETE, OPTIONS",
            )
            return

        target = {
            "matchId": match_id,
            "userId": user_id,
            "username": username,
            "userEmail": user_email,
            "displayName": display_name,
        }
        if not requester_can_access_prediction(requester, target):
            json_response(self, 403, error_payload("You can only delete your own predictions", "forbidden"), methods="GET, DELETE, OPTIONS")
            return
        if requester.get("role") != "admin":
            cutoff_error = validate_prediction_cutoff(match_id)
            if cutoff_error and cutoff_error != "Match could not be found":
                json_response(self, 400, error_payload(cutoff_error, "prediction_locked"), methods="GET, DELETE, OPTIONS")
                return

        result = delete_prediction(match_id, user_id, user_email, username, display_name)
        json_response(self, 200, {"success": True, **result}, cache_control="no-store", methods="GET, DELETE, OPTIONS")
