import json
import os
import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from .cache import kv_command
from .config import DATA_DIR, is_google_sheets_configured, is_vercel_kv_configured
from .http_client import request_json


PREDICTION_KEYS_SET = "wc2026:predictions:keys"
USER_KEYS_SET = "wc2026:users:keys"
SESSION_KEYS_SET = "wc2026:sessions:keys"
USER_EMAIL_PREFIX = "wc2026:user-email:"
USER_USERNAME_PREFIX = "wc2026:user-username:"
SESSION_PREFIX = "wc2026:session:"
USERS_FILE = DATA_DIR / "users.json"
PREDICTIONS_FILE = DATA_DIR / "predictions.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"


def prediction_key(prediction):
    user_id = prediction.get("userId") or prediction.get("username") or prediction.get("userEmail") or "anonymous"
    return f"wc2026:prediction:{user_id}:{prediction['matchId']}"


def prediction_key_from_parts(match_id, user_id="", user_email=""):
    user_key = user_id or user_email or "anonymous"
    return f"wc2026:prediction:{user_key}:{match_id}"


def session_token_hash(token):
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def session_key(token_hash):
    return f"{SESSION_PREFIX}{token_hash}"


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


def read_local_sessions():
    if not SESSIONS_FILE.exists():
        return []
    try:
        return json.loads(SESSIONS_FILE.read_text(encoding="utf-8") or "[]")
    except json.JSONDecodeError:
        return []


def write_local_sessions(sessions):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SESSIONS_FILE.write_text(json.dumps(sessions, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


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


def create_session(user):
    token = secrets.token_urlsafe(32)
    token_hash = session_token_hash(token)
    session = {
        "tokenHash": token_hash,
        "userId": user.get("id", ""),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    if is_vercel_kv_configured():
        key = session_key(token_hash)
        kv_command(["SET", key, json.dumps(session, ensure_ascii=False)])
        kv_command(["SADD", SESSION_KEYS_SET, key])
    else:
        sessions = [item for item in read_local_sessions() if item.get("tokenHash") != token_hash]
        sessions.append(session)
        write_local_sessions(sessions)

    return token


def find_user_by_session_token(token, include_private=True):
    token_hash = session_token_hash(token)
    if not token or not token_hash:
        return None

    if is_vercel_kv_configured():
        item = kv_command(["GET", session_key(token_hash)])
        value = (item or {}).get("result")
        if not value:
            return None
        try:
            session = json.loads(value)
        except json.JSONDecodeError:
            return None
        return find_user_by_id(session.get("userId"), include_private=include_private)

    for session in read_local_sessions():
        if session.get("tokenHash") == token_hash:
            return find_user_by_id(session.get("userId"), include_private=include_private)
    return None


def delete_sessions_for_user(user_id):
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return 0

    if is_vercel_kv_configured():
        keys_response = kv_command(["SMEMBERS", SESSION_KEYS_SET])
        keys = (keys_response or {}).get("result") or []
        deleted = 0
        for key in keys[:3000]:
            item = kv_command(["GET", key])
            value = (item or {}).get("result")
            if not value:
                continue
            try:
                session = json.loads(value)
            except json.JSONDecodeError:
                continue
            if session.get("userId") == clean_user_id:
                kv_command(["DEL", key])
                kv_command(["SREM", SESSION_KEYS_SET, key])
                deleted += 1
        return deleted

    sessions = read_local_sessions()
    remaining = [session for session in sessions if session.get("userId") != clean_user_id]
    write_local_sessions(remaining)
    return len(sessions) - len(remaining)


def normalize_username(username):
    return str(username or "").strip().lower()


def normalize_email(email):
    return normalize_username(email)


def public_user(user):
    if not user:
        return None
    return {
        "id": user.get("id", ""),
        "displayName": user.get("displayName", ""),
        "username": user.get("username") or user.get("email", ""),
        "email": user.get("email") or user.get("username", ""),
        "role": user.get("role", "user"),
        "createdAt": user.get("createdAt", ""),
        "updatedAt": user.get("updatedAt", ""),
        "lastLoginAt": user.get("lastLoginAt", ""),
    }


def validate_password(password):
    return "" if str(password or "") else "Enter a password."


def hash_password(password, salt):
    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()


def user_key(user_id):
    return f"wc2026:user:{user_id}"


def email_key(email):
    return f"{USER_EMAIL_PREFIX}{normalize_email(email)}"


def username_key(username):
    return f"{USER_USERNAME_PREFIX}{normalize_username(username)}"


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


def user_identity_values(user):
    values = {
        str(user.get("id") or "").strip(),
        normalize_username(user.get("username")),
        normalize_email(user.get("email")),
        normalize_username(user.get("displayName")),
    }
    return {value for value in values if value}


def prediction_belongs_to_user(prediction, user):
    identifiers = user_identity_values(user)
    prediction_values = {
        str(prediction.get("userId") or "").strip(),
        normalize_username(prediction.get("username")),
        normalize_email(prediction.get("userEmail")),
        normalize_username(prediction.get("displayName")),
    }
    return bool(identifiers.intersection(value for value in prediction_values if value))


def ensure_unique_username_for_user(user):
    clean_username = normalize_username(user.get("username") or user.get("email"))
    if not clean_username:
        raise ValueError("Username is required.")

    owner = find_user_by_username(clean_username, include_private=True)
    if owner and owner.get("id") != user.get("id"):
        raise ValueError("That username is already in use.")


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


def find_user_by_username(username, include_private=True):
    clean_username = normalize_username(username)
    if not clean_username:
        return None
    if is_vercel_kv_configured():
        index = kv_command(["GET", username_key(clean_username)])
        user_id = (index or {}).get("result")
        if not user_id:
            user = find_user_by_email(clean_username, include_private=True)
            return user if include_private else public_user(user)
        return find_user_by_id(user_id, include_private=include_private)
    for user in read_local_users():
        if (user.get("username") or user.get("email")) == clean_username:
            return user if include_private else public_user(user)
    return None


def persist_user(user):
    ensure_unique_username_for_user(user)

    if is_vercel_kv_configured():
        kv_command(["SET", user_key(user["id"]), json.dumps(user, ensure_ascii=False)])
        kv_command(["SET", username_key(user.get("username") or user.get("email")), user["id"]])
        kv_command(["SET", email_key(user.get("email") or user.get("username")), user["id"]])
        kv_command(["SADD", USER_KEYS_SET, user_key(user["id"])])
        return user

    users = []
    for item in read_local_users():
        if item.get("id") == user.get("id"):
            continue
        if normalize_username(item.get("username") or item.get("email")) == normalize_username(user.get("username") or user.get("email")):
            raise ValueError("That username is already in use.")
        users.append(item)
    users.append(user)
    write_local_users(users)
    return user


def create_user(display_name, email="", password="", role="user", username=""):
    clean_username = normalize_username(username or email)
    clean_name = (str(display_name or "").strip() or clean_username)[:80]
    clean_role = "admin" if role == "admin" else "user"
    if not clean_username:
        return {"success": False, "error": "Enter a username."}
    password_error = validate_password(password)
    if password_error:
        return {"success": False, "error": password_error}
    if find_user_by_username(clean_username):
        return {"success": False, "error": "An account already exists for this username."}

    salt = secrets.token_hex(16)
    user = {
        "id": str(uuid.uuid4()),
        "displayName": clean_name,
        "username": clean_username,
        "email": clean_username,
        "passwordHash": hash_password(password, salt),
        "salt": salt,
        "role": clean_role,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    try:
        persist_user(user)
    except ValueError as error:
        return {"success": False, "error": str(error)}
    return {"success": True, "user": public_user(user)}


def authenticate_user(email="", password="", username=""):
    user = find_user_by_username(username or email, include_private=True)
    if not user:
        return {"success": False, "error": "Username or password is incorrect."}
    if hash_password(password, user.get("salt", "")) != user.get("passwordHash"):
        return {"success": False, "error": "Username or password is incorrect."}
    user["lastLoginAt"] = datetime.now(timezone.utc).isoformat()
    persist_user(user)
    return {"success": True, "user": public_user(user), "token": create_session(user)}


def admin_save_user(user_id="", display_name="", email="", role="user", password="", username=""):
    clean_id = str(user_id or "").strip()
    clean_name = str(display_name or "").strip()[:80]
    clean_username = normalize_username(username or email)
    clean_role = "admin" if role == "admin" else "user"
    if not clean_name:
        return {"success": False, "error": "Display name is required."}
    if not clean_username:
        return {"success": False, "error": "Username is required."}

    existing = find_user_by_id(clean_id, include_private=True) if clean_id else None
    username_owner = find_user_by_username(clean_username, include_private=True)
    if username_owner and username_owner.get("id") != clean_id:
        return {"success": False, "error": "That username is already in use."}

    if existing:
        old_email = existing.get("email", "")
        old_username = existing.get("username", "")
        existing.update({
            "displayName": clean_name,
            "username": clean_username,
            "email": clean_username,
            "role": clean_role,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
        if password:
            password_error = validate_password(password)
            if password_error:
                return {"success": False, "error": password_error}
            existing["salt"] = secrets.token_hex(16)
            existing["passwordHash"] = hash_password(password, existing["salt"])
        try:
            persist_user(existing)
        except ValueError as error:
            return {"success": False, "error": str(error)}
        if is_vercel_kv_configured() and old_email and old_email != clean_username:
            kv_command(["DEL", email_key(old_email)])
        if is_vercel_kv_configured() and old_username and old_username != clean_username:
            kv_command(["DEL", username_key(old_username)])
        return {"success": True, "user": public_user(existing)}

    return create_user(clean_name, password=password, role=clean_role, username=clean_username)


def delete_predictions_for_user(user):
    predictions = list_predictions()
    matching_predictions = [prediction for prediction in predictions if prediction_belongs_to_user(prediction, user)]

    if is_vercel_kv_configured():
        for prediction in matching_predictions:
            delete_prediction(
                prediction.get("matchId", ""),
                prediction.get("userId", ""),
                prediction.get("username") or prediction.get("userEmail") or prediction.get("displayName") or "",
            )
    else:
        remaining = [prediction for prediction in predictions if not prediction_belongs_to_user(prediction, user)]
        write_local_predictions(remaining)

    return len(matching_predictions)


def delete_user(user_id):
    user = find_user_by_id(user_id, include_private=True)
    if not user:
        return {"deleted": False, "storage": "none"}

    deleted_predictions = delete_predictions_for_user(user)
    deleted_sessions = delete_sessions_for_user(user_id)

    if is_vercel_kv_configured():
        key = user_key(user_id)
        kv_command(["DEL", key])
        kv_command(["SREM", USER_KEYS_SET, key])
        kv_command(["DEL", email_key(user.get("email", ""))])
        kv_command(["DEL", username_key(user.get("username") or user.get("email", ""))])
        return {"deleted": True, "deletedPredictions": deleted_predictions, "deletedSessions": deleted_sessions, "storage": "vercel-kv"}

    users = [item for item in read_local_users() if item.get("id") != user_id]
    write_local_users(users)
    return {"deleted": True, "deletedPredictions": deleted_predictions, "deletedSessions": deleted_sessions, "storage": "local-json"}


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
