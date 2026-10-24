"""Fail-closed infrastructure gate; NOT functional browser acceptance.

No environment file or managed session is loaded. Only literal loopback
services may be probed. Missing independent isolation evidence stops execution.
"""
import json
import os
import socket
import sys
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen, ProxyHandler, build_opener


def loopback_url(value):
    url = urlparse(value)
    if (url.scheme != "http" or url.hostname not in ("127.0.0.1", "localhost")
            or url.username or url.password or url.query or url.fragment
            or url.path not in ("", "/") or not url.port or url.port == 8080):
        raise ValueError("Only a dedicated literal loopback origin is allowed; shared preview port 8080 is forbidden")
    return value.rstrip("/")


def check(config):
    if config.get("schema") != "mitochondria.isolated-browser-preflight.v1":
        raise ValueError("Missing isolation configuration")
    app = loopback_url(config.get("appOrigin", ""))
    auth = loopback_url(config.get("authOrigin", ""))
    data = loopback_url(config.get("dataOrigin", ""))
    if not config.get("socketDir", "").startswith("/tmp/") or config.get("database") != "medical_v3_it":
        raise ValueError("Disposable database scope required")
    if not Path(config["socketDir"]).is_dir():
        raise ValueError("Disposable socket directory unavailable")
    # A config assertion alone never authorizes credentials, migrations or AI.
    # This gate is deliberately limited to infrastructure reachability.
    for origin in (app, auth, data):
        parsed = urlparse(origin)
        with socket.create_connection((parsed.hostname, parsed.port), timeout=2):
            pass
    opener = build_opener(ProxyHandler({}))
    for url in (auth + "/health", data + "/"):
        with opener.open(Request(url), timeout=3) as response:
            if response.status != 200:
                raise ValueError("Local auth/data health unavailable")
    raise ValueError("Infrastructure reachable but authenticated isolation identity, effective app configuration, bounded OpenAI budget and full acceptance runner still need independent validation; browser/AI execution remains blocked")


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Supply a local isolation configuration; no shared settings are inferred")
        path = Path(sys.argv[1]).resolve()
        if not str(path).startswith("/tmp/"):
            raise ValueError("Use a temporary isolated configuration, never project secrets")
        config = json.loads(path.read_text())
        check(config)
    except (ValueError, OSError, KeyError, TypeError):
        print("BLOCKED: safe isolated real-auth app/backend and acceptance prerequisites are not proven. No browser, provider call or database mutation was performed.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())