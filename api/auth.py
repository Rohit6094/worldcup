import json
import urllib.parse
from http.server import BaseHTTPRequestHandler

from api.lib.responses import json_response, parse_json_body
from api.lib.storage import (
    admin_save_user,
    authenticate_user,
    create_user,
    delete_user,
    find_user_by_session_token,
    list_users,
)


ADMIN_INVITE_CODE = "WC26-ADMIN-DEMO"


def get_auth_payload():
    return {"success": True, "users": list_users(include_private=False)}


def bearer_token_from_headers(headers):
    header_value = str(headers.get("Authorization") or "").strip()
    if header_value.lower().startswith("bearer "):
        return header_value.split(" ", 1)[1].strip()
    return ""


def authenticated_user_from_headers(headers):
    token = bearer_token_from_headers(headers)
    return find_user_by_session_token(token, include_private=True) if token else None


def require_admin_user(requester):
    if not requester or requester.get("role") != "admin":
        return {"success": False, "error": "Admin access is required."}
    return None


def handle_auth_post(payload, requester=None):
    action = str(payload.get("action") or "").strip()

    if action == "signup":
        role = "admin" if str(payload.get("adminCode") or "").strip() == ADMIN_INVITE_CODE else "user"
        return create_user(
            payload.get("displayName", ""),
            payload.get("email", ""),
            payload.get("password", ""),
            role,
            username=payload.get("username", ""),
        )

    if action == "login":
        return authenticate_user(payload.get("email", ""), payload.get("password", ""), username=payload.get("username", ""))

    if action == "adminSaveUser":
        admin_error = require_admin_user(requester)
        if admin_error:
            return admin_error
        return admin_save_user(
            user_id=payload.get("id", ""),
            display_name=payload.get("displayName", ""),
            email=payload.get("email", ""),
            role=payload.get("role", "user"),
            password=payload.get("password", ""),
            username=payload.get("username", ""),
        )

    return {"success": False, "error": "Unsupported auth action."}


def handle_auth_delete(payload, requester=None):
    admin_error = require_admin_user(requester)
    if admin_error:
        return admin_error
    user_id = str(payload.get("id") or payload.get("userId") or "").strip()
    if not user_id:
        return {"success": False, "error": "User id is required."}
    return {"success": True, **delete_user(user_id)}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, 200, {"ok": True}, methods="GET, POST, DELETE, OPTIONS")

    def do_GET(self):
        json_response(self, 200, get_auth_payload(), cache_control="no-store", methods="GET, POST, DELETE, OPTIONS")

    def do_POST(self):
        try:
            payload = parse_json_body(self)
            result = handle_auth_post(payload, authenticated_user_from_headers(self.headers))
            json_response(
                self,
                200 if result.get("success") else 400,
                result,
                cache_control="no-store",
                methods="GET, POST, DELETE, OPTIONS",
            )
        except Exception as error:
            json_response(
                self,
                500,
                {"success": False, "error": str(error)},
                cache_control="no-store",
                methods="GET, POST, DELETE, OPTIONS",
            )

    def do_DELETE(self):
        try:
            payload = parse_json_body(self)
            result = handle_auth_delete(payload, authenticated_user_from_headers(self.headers))
            json_response(
                self,
                200 if result.get("success") else 400,
                result,
                cache_control="no-store",
                methods="GET, POST, DELETE, OPTIONS",
            )
        except Exception as error:
            json_response(
                self,
                500,
                {"success": False, "error": str(error)},
                cache_control="no-store",
                methods="GET, POST, DELETE, OPTIONS",
            )
