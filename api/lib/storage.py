import json
import os
import hashlib
import re
import secrets
import uuid
from datetime import datetime, timezone

from .cache import kv_command
from .config import DATA_DIR, is_google_sheets_configured, is_vercel_kv_configured
from .http_client import request_json


PREDICTION_KEYS_SET = "wc2026:predictions:keys"
USER_KEYS_SET = "wc2026:users:keys"
USER_EMAIL_PREFIX = "wc2026:user-email:"
USERS_FILE = DATA_DIR / "users.json"
PREDICTIONS_FILE = DATA_DIR / "predictions.json"


def prediction_key(prediction):
    user_id = prediction.get("userId") or prediction.get("userEmail") or "anonymous"
    return f"wc2026:prediction:{user_id}:{prediction['matchId']}"


def prediction_key_from_parts(match_id, user_id="", user_email=""):
    user_key = user_id or user_email or "anonymous"
    return f"wc2026:prediction:{user_key}:{match_id}"


def read_local_predictions():
    if not PREDICTIONS_FILE.exists():
        return []
    try:
        return json.loads(PREDICTIONS_FILE.read_text(encoding="utf-8") or "[]")
    except json.JSONDecodeError:
        return []


def write_local_predictions(predictions):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PREDICTIONS_FILE.write_text(json.dumps(predictions, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


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
    else:
        key = prediction_key(saved)
        predictions = [item for item in read_local_predictions() if prediction_key(item) != key]
        saved["storage"] = "local-json"
        predictions.append(saved)
        write_local_predictions(predictions)

    append_prediction_to_google_sheets(saved)
    return saved


def list_predictions():
    if not is_vercel_kv_configured():
        return sorted(read_local_predictions(), key=lambda row: row.get("submittedAt", ""), reverse=True)

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
        key = prediction_key_from_parts(match_id, user_id, user_email)
        predictions = [item for item in read_local_predictions() if prediction_key(item) != key]
        write_local_predictions(predictions)
        return {"deleted": True, "storage": "local-json", "key": key}

    key = prediction_key_from_parts(match_id, user_id, user_email)
    kv_command(["DEL", key])
    kv_command(["SREM", PREDICTION_KEYS_SET, key])
    return {"deleted": True, "storage": "vercel-kv", "key": key}


def normalize_email(email):
    return str(email or "").strip().lower()


def public_user(user):
    if not user:
        return None
    return {
        "id": user.get("id", ""),
        "displayName": user.get("displayName", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "user"),
        "createdAt": user.get("createdAt", ""),
        "updatedAt": user.get("updatedAt", ""),
        "lastLoginAt": user.get("lastLoginAt", ""),
    }


def validate_password(password):
    value = str(password or "")
    if len(value) < 10:
        return "Use at least 10 characters."
    if not re.search(r"[A-Z]", value):
        return "Add at least one uppercase letter."
    if not re.search(r"[a-z]", value):
        return "Add at least one lowercase letter."
    if not re.search(r"[0-9]", value):
        return "Add at least one number."
    return ""


def hash_password(password, salt):
    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()


def user_key(user_id):
    return f"wc2026:user:{user_id}"


def email_key(email):
    return f"{USER_EMAIL_PREFIX}{normalize_email(email)}"


def read_local_users():
    if not USERS_FILE.exists():
        return []
    try:
        return json.loads(USERS_FILE.read_text(encoding="utf-8") or "[]")
    except json.JSONDecodeError:
        return []


def write_local_users(users):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    USERS_FILE.write_text(json.dumps(users, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def list_users(include_private=False):
    users = []
    if is_vercel_kv_configured():
        keys_response = kv_command(["SMEMBERS", USER_KEYS_SET])
        keys = (keys_response or {}).get("result") or []
        for key in keys[:2000]:
            item = kv_command(["GET", key])
            value = (item or {}).get("result")
            if not value:
                continue
            try:
                users.append(json.loads(value))
            except json.JSONDecodeError:
                continue
    else:
        users = read_local_users()

    users = sorted(users, key=lambda row: str(row.get("createdAt", "")))
    return users if include_private else [public_user(user) for user in users]


def find_user_by_id(user_id, include_private=True):
    user_id = str(user_id or "").strip()
    if not user_id:
        return None
    if is_vercel_kv_configured():
        item = kv_command(["GET", user_key(user_id)])
        value = (item or {}).get("result")
        if not value:
            return None
        try:
            user = json.loads(value)
        except json.JSONDecodeError:
            return None
        return user if include_private else public_user(user)
    for user in read_local_users():
        if user.get("id") == user_id:
            return user if include_private else public_user(user)
    return None


def find_user_by_email(email, include_private=True):
    clean_email = normalize_email(email)
    if not clean_email:
        return None
    if is_vercel_kv_configured():
        index = kv_command(["GET", email_key(clean_email)])
        user_id = (index or {}).get("result")
        if not user_id:
            return None
        return find_user_by_id(user_id, include_private=include_private)
    for user in read_local_users():
        if user.get("email") == clean_email:
            return user if include_private else public_user(user)
    return None


def persist_user(user):
    if is_vercel_kv_configured():
        kv_command(["SET", user_key(user["id"]), json.dumps(user, ensure_ascii=False)])
        kv_command(["SET", email_key(user["email"]), user["id"]])
        kv_command(["SADD", USER_KEYS_SET, user_key(user["id"])])
        return user

    users = [item for item in read_local_users() if item.get("id") != user.get("id")]
    users.append(user)
    write_local_users(users)
    return user


def create_user(display_name, email, password, role="user"):
    clean_name = str(display_name or "").strip()[:80]
    clean_email = normalize_email(email)
    clean_role = "admin" if role == "admin" else "user"
    if not clean_name:
        return {"success": False, "error": "Enter your display name."}
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", clean_email):
        return {"success": False, "error": "Enter a valid email address."}
    password_error = validate_password(password)
    if password_error:
        return {"success": False, "error": password_error}
    if find_user_by_email(clean_email):
        return {"success": False, "error": "An account already exists for this email."}

    salt = secrets.token_hex(16)
    user = {
        "id": str(uuid.uuid4()),
        "displayName": clean_name,
        "email": clean_email,
        "passwordHash": hash_password(password, salt),
        "salt": salt,
        "role": clean_role,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    persist_user(user)
    return {"success": True, "user": public_user(user)}


def authenticate_user(email, password):
    user = find_user_by_email(email, include_private=True)
    if not user:
        return {"success": False, "error": "Email or password is incorrect."}
    if hash_password(password, user.get("salt", "")) != user.get("passwordHash"):
        return {"success": False, "error": "Email or password is incorrect."}
    user["lastLoginAt"] = datetime.now(timezone.utc).isoformat()
    persist_user(user)
    return {"success": True, "user": public_user(user)}


def admin_save_user(user_id="", display_name="", email="", role="user", password=""):
    clean_id = str(user_id or "").strip()
    clean_name = str(display_name or "").strip()[:80]
    clean_email = normalize_email(email)
    clean_role = "admin" if role == "admin" else "user"
    if not clean_name:
        return {"success": False, "error": "Display name is required."}
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", clean_email):
        return {"success": False, "error": "Valid email is required."}

    existing = find_user_by_id(clean_id, include_private=True) if clean_id else None
    email_owner = find_user_by_email(clean_email, include_private=True)
    if email_owner and email_owner.get("id") != clean_id:
        return {"success": False, "error": "That email is already in use."}

    if existing:
        old_email = existing.get("email", "")
        existing.update({
            "displayName": clean_name,
            "email": clean_email,
            "role": clean_role,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
        if password:
            password_error = validate_password(password)
            if password_error:
                return {"success": False, "error": password_error}
            existing["salt"] = secrets.token_hex(16)
            existing["passwordHash"] = hash_password(password, existing["salt"])
        persist_user(existing)
        if is_vercel_kv_configured() and old_email and old_email != clean_email:
            kv_command(["DEL", email_key(old_email)])
        return {"success": True, "user": public_user(existing)}

    return create_user(clean_name, clean_email, password, clean_role)


def delete_user(user_id):
    user = find_user_by_id(user_id, include_private=True)
    if not user:
        return {"deleted": False, "storage": "none"}

    if is_vercel_kv_configured():
        key = user_key(user_id)
        kv_command(["DEL", key])
        kv_command(["SREM", USER_KEYS_SET, key])
        kv_command(["DEL", email_key(user.get("email", ""))])
        return {"deleted": True, "storage": "vercel-kv"}

    users = [item for item in read_local_users() if item.get("id") != user_id]
    write_local_users(users)
    return {"deleted": True, "storage": "local-json"}


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
