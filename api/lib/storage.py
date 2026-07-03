import json
import os
from datetime import datetime, timezone

from .cache import kv_command
from .config import is_google_sheets_configured, is_vercel_kv_configured
from .http_client import request_json


PREDICTION_KEYS_SET = "wc2026:predictions:keys"


def prediction_key(prediction):
    user_id = prediction.get("userId") or prediction.get("userEmail") or "anonymous"
    return f"wc2026:prediction:{user_id}:{prediction['matchId']}"


def prediction_key_from_parts(match_id, user_id="", user_email=""):
    user_key = user_id or user_email or "anonymous"
    return f"wc2026:prediction:{user_key}:{match_id}"


def save_prediction(prediction):
    saved = {
        **prediction,
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "storage": "server-echo",
    }

    if is_vercel_kv_configured():
        key = prediction_key(saved)
        kv_command(["SET", key, json.dumps(saved, ensure_ascii=False)])
        kv_command(["SADD", PREDICTION_KEYS_SET, key])
        saved["storage"] = "vercel-kv"

    append_prediction_to_google_sheets(saved)
    return saved


def list_predictions():
    if not is_vercel_kv_configured():
        return []

    keys_response = kv_command(["SMEMBERS", PREDICTION_KEYS_SET])
    keys = (keys_response or {}).get("result") or []
    predictions = []
    for key in keys[:1000]:
        item = kv_command(["GET", key])
        value = (item or {}).get("result")
        if not value:
            continue
        try:
            predictions.append(json.loads(value))
        except json.JSONDecodeError:
            continue
    return sorted(predictions, key=lambda row: row.get("submittedAt", ""), reverse=True)


def delete_prediction(match_id, user_id="", user_email=""):
    if not is_vercel_kv_configured():
        return {"deleted": False, "storage": "none"}

    key = prediction_key_from_parts(match_id, user_id, user_email)
    kv_command(["DEL", key])
    kv_command(["SREM", PREDICTION_KEYS_SET, key])
    return {"deleted": True, "storage": "vercel-kv", "key": key}


def append_prediction_to_google_sheets(prediction):
    if not is_google_sheets_configured():
        return

    url = os.environ["GOOGLE_SHEETS_WEBHOOK_URL"]
    secret = os.environ.get("GOOGLE_SHEETS_WEBHOOK_SECRET", "")
    payload = {"type": "prediction", "secret": secret, "prediction": prediction}
    try:
        request_json(url, method="POST", body=payload, timeout=5)
    except Exception:
        pass
