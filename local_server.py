import json
import os
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from api.leaderboard import get_leaderboard_payload
from api.matches import get_matches_payload
from api.lib.storage import delete_prediction, list_predictions, save_prediction
from api.submit_prediction import validate_prediction


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
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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

        if path == "/api/leaderboard":
            self.send_json(200, get_leaderboard_payload())
            return

        if path == "/api/predictions":
            predictions = list_predictions()
            self.send_json(200, {"source": "vercel-kv" if predictions else "empty", "predictions": predictions})
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
        elif path == "/points":
            self.path = "/points.html"
        elif path == "/":
            self.path = "/index.html"

        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/")
        if path != "/api/submit_prediction":
            self.send_json(404, {"success": False, "error": "Endpoint not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0") or "0")
            payload = json.loads(self.rfile.read(content_length).decode("utf-8") or "{}")
        except Exception:
            self.send_json(400, {"success": False, "error": "Invalid JSON body"})
            return

        error = validate_prediction(payload)
        if error:
            self.send_json(400, {"success": False, "error": error})
            return

        prediction = {
            "matchId": str(payload["matchId"]).strip(),
            "userId": str(payload.get("userId", "")).strip(),
            "userEmail": str(payload.get("userEmail", "")).strip(),
            "displayName": str(payload["displayName"]).strip()[:80],
            "predictedWinner": str(payload["predictedWinner"]).strip(),
            "advancingTeam": str(payload.get("advancingTeam", "")).strip(),
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
        user_email = str(payload.get("userEmail", "")).strip()
        if not match_id or not (user_id or user_email):
            self.send_json(400, {"success": False, "error": "matchId and userId or userEmail are required"})
            return

        result = delete_prediction(match_id, user_id, user_email)
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
