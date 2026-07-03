import json
import urllib.parse
from http.server import BaseHTTPRequestHandler

from api.lib.responses import json_response, parse_json_body
from api.lib.storage import (
    admin_save_user,
    authenticate_user,
    create_user,
    delete_user,
    list_users,
)


ADMIN_INVITE_CODE = "WC26-ADMIN-DEMO"


def get_auth_payload():
    return {"success": True, "users": list_users(include_private=False)}


def handle_auth_post(payload):
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
        return admin_save_user(
            user_id=payload.get("id", ""),
            display_name=payload.get("displayName", ""),
            email=payload.get("email", ""),
            role=payload.get("role", "user"),
            password=payload.get("password", ""),
            username=payload.get("username", ""),
        )

    return {"success": False, "error": "Unsupported auth action."}


def handle_auth_delete(payload):
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
            result = handle_auth_post(payload)
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
            result = handle_auth_delete(payload)
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
