import json
import os
import time

from .config import is_vercel_kv_configured
from .http_client import request_json


_MEMORY_CACHE = {}


def _now():
    return int(time.time())


def memory_get(key):
    item = _MEMORY_CACHE.get(key)
    if not item:
        return None
    if item["expires_at"] <= _now():
        _MEMORY_CACHE.pop(key, None)
        return None
    return item["value"]


def memory_set(key, value, ttl_seconds):
    _MEMORY_CACHE[key] = {"value": value, "expires_at": _now() + ttl_seconds}


def kv_command(command):
    if not is_vercel_kv_configured():
        return None
    url = os.environ["KV_REST_API_URL"].rstrip("/")
    token = os.environ["KV_REST_API_TOKEN"]
    return request_json(
        url,
        headers={"Authorization": f"Bearer {token}"},
        method="POST",
        body=command,
        timeout=8,
    )


def kv_get_json(key):
    response = kv_command(["GET", key])
    if not response or response.get("result") in (None, ""):
        return None
    value = response["result"]
    if isinstance(value, str):
        return json.loads(value)
    return value


def kv_set_json(key, value, ttl_seconds=None):
    payload = json.dumps(value, ensure_ascii=False)
    command = ["SET", key, payload]
    if ttl_seconds:
        command.extend(["EX", int(ttl_seconds)])
    kv_command(command)


def get_cached_json(key):
    value = memory_get(key)
    if value is not None:
        return value
    try:
        value = kv_get_json(key)
    except Exception:
        value = None
    if value is not None:
        ttl = int(value.get("_cacheTtl", 60)) if isinstance(value, dict) else 60
        memory_set(key, value, ttl)
    return value


def set_cached_json(key, value, ttl_seconds):
    cache_value = value.copy() if isinstance(value, dict) else value
    if isinstance(cache_value, dict):
        cache_value["_cachedAt"] = _now()
        cache_value["_cacheTtl"] = ttl_seconds
    memory_set(key, cache_value, ttl_seconds)
    try:
        kv_set_json(key, cache_value, ttl_seconds)
    except Exception:
        pass
