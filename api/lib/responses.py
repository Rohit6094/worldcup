import json


def json_response(handler, status_code, payload, cache_control=None, methods="GET, OPTIONS"):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", methods)
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
    if cache_control:
        handler.send_header("Cache-Control", cache_control)
    handler.end_headers()
    handler.wfile.write(body)


def parse_json_body(handler, max_bytes=32_768):
    content_length = int(handler.headers.get("Content-Length", "0") or "0")
    if content_length <= 0:
        return {}
    if content_length > max_bytes:
        raise ValueError("Request body is too large")
    return json.loads(handler.rfile.read(content_length).decode("utf-8"))


def error_payload(message, code="request_failed", details=None):
    payload = {"success": False, "error": message, "code": code}
    if details is not None:
        payload["details"] = details
    return payload
