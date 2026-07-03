import json
import urllib.parse
import urllib.request
from urllib.error import HTTPError, URLError


class ProviderError(RuntimeError):
    pass


def request_json(url, headers=None, query=None, method="GET", body=None, timeout=12):
    target_url = url
    if query:
        target_url = f"{url}?{urllib.parse.urlencode(query)}"

    data = None
    request_headers = {"Accept": "application/json", **(headers or {})}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    request = urllib.request.Request(target_url, data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw_body = response.read().decode("utf-8")
            return json.loads(raw_body) if raw_body else None
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise ProviderError(f"HTTP {error.code}: {details[:500]}") from error
    except URLError as error:
        raise ProviderError(f"Connection error: {error.reason}") from error
    except json.JSONDecodeError as error:
        raise ProviderError("Provider returned invalid JSON") from error
