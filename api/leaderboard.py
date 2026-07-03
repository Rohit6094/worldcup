from http.server import BaseHTTPRequestHandler

from api.lib.responses import json_response
from api.lib.scoring import score_prediction
from api.lib.storage import list_predictions, list_users
from api.matches import get_matches_payload


def build_leaderboard_from_predictions():
    predictions = list_predictions()
    matches_payload = get_matches_payload()
    matches_by_id = {match["id"]: match for match in matches_payload.get("matches", [])}
    users = {}

    for user in list_users(include_private=False):
        user_key = user.get("id") or user.get("email") or user.get("displayName")
        if not user_key:
            continue
        users[user_key] = {
            "userId": user.get("id", ""),
            "displayName": user.get("displayName") or user.get("email") or "Unknown",
            "points": 0,
            "correctWinners": 0,
            "exactScores": 0,
            "totalPredictions": 0,
        }

    for prediction in predictions:
        user_key = prediction.get("userId") or prediction.get("userEmail") or prediction.get("displayName") or "anonymous"
        row = users.setdefault(
            user_key,
            {
                "userId": prediction.get("userId", ""),
                "displayName": prediction.get("displayName") or "Unknown",
                "points": 0,
                "correctWinners": 0,
                "exactScores": 0,
                "totalPredictions": 0,
            },
        )
        row["totalPredictions"] += 1
        scored = score_prediction(prediction, matches_by_id.get(prediction.get("matchId")))
        row["points"] += scored["points"]
        if scored["correctWinner"]:
            row["correctWinners"] += 1
        if scored["exactScore"]:
            row["exactScores"] += 1

    records = sorted(
        users.values(),
        key=lambda row: (
            -int(row.get("points", 0)),
            -int(row.get("exactScores", 0)),
            -int(row.get("correctWinners", 0)),
            str(row.get("displayName", "")).lower(),
        ),
    )
    for index, record in enumerate(records, start=1):
        record["rank"] = index
    return records


def get_leaderboard_payload():
    records = build_leaderboard_from_predictions()
    return {"source": "server-users-and-predictions", "top10": records[:10], "overall": records}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True}, methods="GET, OPTIONS")

    def do_GET(self):
        json_response(
            self,
            200,
            get_leaderboard_payload(),
            cache_control="s-maxage=60, stale-while-revalidate=300",
            methods="GET, OPTIONS",
        )
