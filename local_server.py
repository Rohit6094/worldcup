import json
import os
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from api.auth import authenticated_user_from_headers, get_auth_payload, handle_auth_delete, handle_auth_post
from api.lib.config import is_vercel_kv_configured
from api.leaderboard import get_leaderboard_payload
from api.match_details import get_match_details_payload
from api.matches import get_matches_payload
from api.lib.storage import delete_prediction, list_predictions, prediction_identity_values, save_prediction, target_identity_values
from api.submit_prediction import validate_prediction, validate_prediction_cutoff


ROOT_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT_DIR / "public"
ENV_PATH = ROOT_DIR / ".env"
HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8000"))


def load_dotenv(path=ENV_PATH):
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def json_bytes(payload):
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


class LocalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        super().end_headers()

    def send_json(self, status_code, payload):
        body = json_bytes(payload)
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/") or "/"

        if path == "/api/matches":
            query = parse_qs(urlparse(self.path).query)
            force_refresh = query.get("refresh", ["0"])[0].lower() in {"1", "true", "yes"}
            self.send_json(200, get_matches_payload(force_refresh=force_refresh))
            return

        if path == "/api/match_details":
            query = parse_qs(urlparse(self.path).query)
            match_id = query.get("id", [""])[0].strip()
            try:
                self.send_json(200, get_match_details_payload(match_id))
            except Exception as error:
                self.send_json(404, {"success": False, "error": str(error), "match": None})
            return

        if path == "/api/leaderboard":
            self.send_json(200, get_leaderboard_payload())
            return

        if path == "/api/predictions":
            requester = authenticated_user_from_headers(self.headers)
            if not requester:
                self.send_json(401, {"success": False, "error": "Login is required to view predictions"})
                return
            predictions = list_predictions()
            self.send_json(200, {"source": "vercel-kv" if is_vercel_kv_configured() else "local-json", "predictions": predictions})
            return

        if path == "/api/auth":
            self.send_json(200, get_auth_payload())
            return

        if path == "/api/submit_prediction":
            self.send_json(405, {"success": False, "error": "Use POST to submit predictions"})
            return

        if path == "/matches":
            self.path = "/matches.html"
        elif path == "/leaderboard":
            self.path = "/leaderboard.html"
        elif path == "/login":
            self.path = "/login.html"
        elif path == "/signup":
            self.path = "/signup.html"
        elif path == "/admin":
            self.path = "/admin.html"
        elif path == "/predictions":
            self.path = "/points.html"
        elif path == "/points":
            self.path = "/points.html"
        elif path == "/":
            self.path = "/index.html"

        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/")
        if path == "/api/auth":
            try:
                content_length = int(self.headers.get("Content-Length", "0") or "0")
                payload = json.loads(self.rfile.read(content_length).decode("utf-8") or "{}")
            except Exception:
                self.send_json(400, {"success": False, "error": "Invalid JSON body"})
                return

            result = handle_auth_post(payload, authenticated_user_from_headers(self.headers))
            self.send_json(200 if result.get("success") else 400, result)
            return

        if path != "/api/submit_prediction":
            self.send_json(404, {"success": False, "error": "Endpoint not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0") or "0")
            payload = json.loads(self.rfile.read(content_length).decode("utf-8") or "{}")
        except Exception:
            self.send_json(400, {"success": False, "error": "Invalid JSON body"})
            return

        requester = authenticated_user_from_headers(self.headers)
        if not requester:
            self.send_json(401, {"success": False, "error": "Login is required to submit predictions"})
            return

        payload["displayName"] = requester.get("displayName") or requester.get("username") or payload.get("displayName", "")
        error = validate_prediction(payload)
        if error:
            self.send_json(400, {"success": False, "error": error})
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
            self.send_json(503, {"success": False, "error": "Prediction storage is unavailable", "details": str(error)})
            return
        self.send_json(200, {"success": True, "prediction": saved_prediction})

    def do_DELETE(self):
        path = urlparse(self.path).path.rstrip("/")
        if path == "/api/auth":
            try:
                content_length = int(self.headers.get("Content-Length", "0") or "0")
                payload = json.loads(self.rfile.read(content_length).decode("utf-8") or "{}")
            except Exception:
                self.send_json(400, {"success": False, "error": "Invalid JSON body"})
                return

            result = handle_auth_delete(payload, authenticated_user_from_headers(self.headers))
            self.send_json(200 if result.get("success") else 400, result)
            return

        if path != "/api/predictions":
            self.send_json(404, {"success": False, "error": "Endpoint not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0") or "0")
            payload = json.loads(self.rfile.read(content_length).decode("utf-8") or "{}")
        except Exception:
            self.send_json(400, {"success": False, "error": "Invalid JSON body"})
            return

        match_id = str(payload.get("matchId", "")).strip()
        user_id = str(payload.get("userId", "")).strip()
        username = str(payload.get("username", "")).strip()
        user_email = str(payload.get("userEmail", "")).strip()
        display_name = str(payload.get("displayName", "")).strip()
        if not match_id or not target_identity_values(user_id, user_email, username, display_name):
            self.send_json(400, {"success": False, "error": "matchId and a user identifier are required"})
            return

        requester = authenticated_user_from_headers(self.headers)
        requester_keys = {
            str((requester or {}).get("id") or "").strip().lower(),
            str((requester or {}).get("username") or "").strip().lower(),
            str((requester or {}).get("email") or "").strip().lower(),
            str((requester or {}).get("displayName") or "").strip().lower(),
        } - {""}
        target_keys = prediction_identity_values({
            "userId": user_id,
            "username": username,
            "userEmail": user_email,
            "displayName": display_name,
        })
        if not requester:
            self.send_json(401, {"success": False, "error": "Login is required to delete predictions"})
            return
        if requester.get("role") != "admin" and not requester_keys.intersection(target_keys):
            self.send_json(403, {"success": False, "error": "You can only delete your own predictions"})
            return
        if requester.get("role") != "admin":
            cutoff_error = validate_prediction_cutoff(match_id)
            if cutoff_error and cutoff_error != "Match could not be found":
                self.send_json(400, {"success": False, "error": cutoff_error, "code": "prediction_locked"})
                return

        result = delete_prediction(match_id, user_id, user_email, username, display_name)
        self.send_json(200, {"success": True, **result})


def main():
    load_dotenv()
    has_football_data_key = bool(
        os.environ.get("FOOTBALL_DATA_KEY")
        or os.environ.get("FOOTBALL_DATA_TOKEN")
        or os.environ.get("FOOTBALL_DATA_API_KEY")
        or os.environ.get("X_AUTH_TOKEN")
    )
    has_api_football_key = bool(os.environ.get("API_FOOTBALL_KEY"))
    print(f"Loaded .env: {'yes' if ENV_PATH.exists() else 'no'}")
    print(f"FOOTBALL_DATA_KEY configured: {'yes' if has_football_data_key else 'no'}")
    print(f"API_FOOTBALL_KEY fallback configured: {'yes' if has_api_football_key else 'no'}")
    print(f"Serving http://{HOST}:{PORT}")
    print(f"API test URL: http://{HOST}:{PORT}/api/matches")

    server = ThreadingHTTPServer((HOST, PORT), LocalHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
