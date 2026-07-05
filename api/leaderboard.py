from http.server import BaseHTTPRequestHandler

from api.lib.responses import json_response
from api.lib.scoring import score_prediction
from api.lib.storage import list_predictions, list_users, prediction_identity_values, user_identity_values
from api.matches import get_matches_payload


def build_leaderboard_from_predictions():
    predictions = list_predictions()
    matches_payload = get_matches_payload()
    matches_by_id = {match["id"]: match for match in matches_payload.get("matches", [])}
    users = {}
    identity_index = {}

    for user in list_users(include_private=False):
        user_key = user.get("id") or user.get("username") or user.get("email") or user.get("displayName")
        if not user_key:
            continue
        users[user_key] = {
            "userId": user.get("id", ""),
            "displayName": user.get("displayName") or user.get("username") or user.get("email") or "Unknown",
            "points": 0,
            "correctWinners": 0,
            "exactScores": 0,
            "totalPredictions": 0,
        }
        for identity in user_identity_values(user):
            identity_index[identity] = user_key

    for prediction in predictions:
        prediction_identities = prediction_identity_values(prediction)
        user_key = next((identity_index[identity] for identity in prediction_identities if identity in identity_index), None)
        user_key = user_key or prediction.get("userId") or prediction.get("username") or prediction.get("userEmail") or prediction.get("displayName") or "anonymous"
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
        scored = score_prediction(prediction, matches_by_id.get(prediction.get("matchId")))
        if not scored.get("scoringEligible"):
            continue
        row["totalPredictions"] += 1
        row["points"] += scored["points"]
        if scored["correctWinner"]:
            row["correctWinners"] += 1
        if scored["exactScore"]:
            row["exactScores"] += 1
        for identity in prediction_identities:
            identity_index[identity] = user_key

    records = sorted(
        users.values(),
        key=lambda row: (
            -int(row.get("points", 0)),
            -int(row.get("exactScores", 0)),
            -int(row.get("correctWinners", 0)),
            str(row.get("displayName", "")).lower(),
        ),
    )
    return assign_leaderboard_ranks(records)


def assign_leaderboard_ranks(records):
    ranked_records = []
    previous_points = None
    current_rank = 0

    for index, record in enumerate(records, start=1):
        points = int(record.get("points", 0))
        if previous_points is None or points != previous_points:
            current_rank = index
            previous_points = points
        ranked_records.append({**record, "rank": current_rank})

    return ranked_records


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
            cache_control="no-store",
            methods="GET, OPTIONS",
        )
