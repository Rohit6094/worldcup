from http.server import BaseHTTPRequestHandler

from api.lib.responses import json_response
from api.lib.storage import list_predictions


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True}, methods="GET, OPTIONS")

    def do_GET(self):
        predictions = list_predictions()
        json_response(
            self,
            200,
            {"source": "vercel-kv" if predictions else "empty", "predictions": predictions},
            cache_control="no-store",
            methods="GET, OPTIONS",
        )
