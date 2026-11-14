import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import urllib.request
import urllib.error
import uuid

TARGET = Path("/etc/nginx/sites-enabled/app")
HOST = "app.fereyappfuturewinterworkbookgrace.store"
TARGET_T213 = Path("/etc/nginx/sites-enabled/users")
HOST_T213 = "users.fereyuserstopstrongcloudwinter.shop"
PUBLIC_HOST = "mission-health-bug-busters.vercel.app"
PREFIX = "/mission-health-api/"
BACKUPS = Path("/var/backups/mission-health")
MEMORY_PREFIX = "/mission-health-memory/"
MEMORY_RUNTIME_T213 = Path("/home/t213/mission-health/backend/runtime.env")
MEMORY_ROUTE = """
    location ^~ /mission-health-memory/ {
        if ($http_origin != "") { return 403; }
        client_max_body_size 2m;
        proxy_pass http://127.0.0.1:18091/;
        proxy_http_version 1.1;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header Connection "";
        proxy_connect_timeout 5s;
        proxy_read_timeout 90s;
        proxy_send_timeout 90s;
        proxy_buffering off;
        proxy_cache off;
        proxy_next_upstream off;
        add_header Cache-Control "private, no-store" always;
    }
"""
ROUTE = """
    location ^~ /mission-health-api/ {
        client_max_body_size 20m;
        proxy_pass http://127.0.0.1:8092/;
        proxy_http_version 1.1;
        proxy_set_header Host mission-health-bug-busters.vercel.app;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Connection "";
        proxy_connect_timeout 5s;
        proxy_read_timeout 150s;
        proxy_send_timeout 150s;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_cache off;
        proxy_next_upstream off;
        proxy_hide_header Cache-Control;
        proxy_hide_header CDN-Cache-Control;
        add_header Cache-Control "private, no-store" always;
        add_header CDN-Cache-Control "no-store" always;
    }
"""


def deployment_target(server="t4"):
    if server == "t4":
        return TARGET, HOST
    if server == "t213":
        return TARGET_T213, HOST_T213
    raise ValueError("Unsupported backend server")


def candidate(source, server="t4", with_memory=False):
    _, host = deployment_target(server)
    if with_memory and server != "t213":
        raise ValueError("The private memory tunnel route is supported only on t213")
    if with_memory and MEMORY_PREFIX.rstrip("/") in source:
        raise ValueError("The private memory route already exists; review instead of replacing it")
    existing_api = PREFIX.rstrip("/") in source
    if existing_api and (not with_memory or ROUTE not in source):
        raise ValueError("The backend route already exists; review instead of replacing it")
    masked = re.sub(r"#[^\n]*", lambda match: " " * len(match[0]), source)
    matches = []
    for match in re.finditer(r"(?m)^\s*server\s*\{", masked):
        start = masked.index("{", match.start(), match.end())
        depth = 1
        end = start + 1
        while end < len(masked) and depth:
            depth += (masked[end] == "{") - (masked[end] == "}")
            end += 1
        if depth:
            raise ValueError("Unbalanced nginx configuration")
        block = masked[start:end]
        names = re.findall(r"server_name\s+([^;]+);", block)
        if any(host in value.split() for value in names) and re.search(r"listen\s+(?:\[::\]:)?443\s+ssl\b", block):
            matches.append(end - 1)
    if len(matches) != 1:
        raise ValueError("Expected exactly one existing app HTTPS server")
    index = matches[0]
    routes = ("" if existing_api else ROUTE) + (MEMORY_ROUTE if with_memory else "")
    return source[:index] + routes + source[index:]


def replace_file(path, content, metadata):
    descriptor, temporary = tempfile.mkstemp(prefix=".mission-health-backend-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
            os.fchmod(handle.fileno(), metadata.st_mode & 0o777)
            os.fchown(handle.fileno(), metadata.st_uid, metadata.st_gid)
        os.replace(temporary, path)
    finally:
        if os.path.lexists(temporary):
            os.unlink(temporary)


def check_backend():
    request = urllib.request.Request("http://127.0.0.1:8092/_health", headers={"Host": PUBLIC_HOST})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=10) as response:
        if response.status != 200 or json.load(response).get("ready") is not True:
            raise RuntimeError("The standalone API must be ready before HTTPS activation")


def check_memory():
    if MEMORY_RUNTIME_T213.is_symlink() or MEMORY_RUNTIME_T213.stat().st_mode & 0o077:
        raise ValueError("The private runtime settings must remain restricted")
    settings = {}
    for line in MEMORY_RUNTIME_T213.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or key in settings:
            raise ValueError("Invalid private runtime settings")
        settings[key] = json.loads(value) if value.startswith('"') else value
    key = settings.get("MEMORY_API_KEY", "")
    if settings.get("MEMORY_URL") != "http://127.0.0.1:18091" or len(key) < 32:
        raise ValueError("The verified private memory tunnel configuration is required")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    url = "http://127.0.0.1:18091/health"
    try:
        with opener.open(url, timeout=10):
            raise RuntimeError("Memory must reject requests without a credential")
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise RuntimeError("Unexpected unauthenticated memory response") from error
    request = urllib.request.Request(url, headers={"Authorization": "Bearer " + key})
    with opener.open(request, timeout=15) as response:
        health = json.load(response)
        if response.status != 200 or health.get("semantic") is not True or health.get("dimensions") != 768:
            raise RuntimeError("The authenticated embedder and Qdrant must be ready")


def apply_locked(original, proposed, backup_dir, resolved_target, server="t4"):
    target, _ = deployment_target(server)
    if target.resolve(strict=True) != resolved_target or resolved_target.read_bytes() != original:
        raise ValueError("Nginx configuration changed during deployment preparation")
    metadata = resolved_target.stat()
    backup_name = "nginx-app-backend-" if server == "t4" else "nginx-users-backend-"
    backup = backup_dir / (backup_name + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-" + uuid.uuid4().hex)
    shutil.copy2(resolved_target, backup)
    backup.chmod(0o600)
    try:
        if target.resolve(strict=True) != resolved_target or resolved_target.read_bytes() != original:
            raise ValueError("Nginx configuration changed before replacement")
        replace_file(resolved_target, proposed, metadata)
        subprocess.run(["/usr/sbin/nginx", "-t"], check=True)
        subprocess.run(["/bin/systemctl", "reload", "nginx"], check=True)
    except BaseException as error:
        if target.resolve(strict=True) != resolved_target or resolved_target.read_bytes() != proposed:
            raise RuntimeError("Concurrent nginx edit preserved; inspect the saved backup before manual recovery") from error
        replace_file(resolved_target, original, metadata)
        subprocess.run(["/usr/sbin/nginx", "-t"], check=True)
        subprocess.run(["/bin/systemctl", "reload", "nginx"], check=True)
        raise
    return backup


def apply_change(original, proposed, server="t4", with_memory=False):
    target, _ = deployment_target(server)
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    BACKUPS.chmod(0o700)
    descriptor = os.open(BACKUPS / "activation.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "a", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        check_backend()
        if with_memory:
            check_memory()
        return apply_locked(original, proposed, BACKUPS, target.resolve(strict=True), server)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-sha")
    parser.add_argument("--server", choices=("t4", "t213"), default="t4")
    parser.add_argument("--with-memory", action="store_true")
    args = parser.parse_args()
    target, host = deployment_target(args.server)
    original = target.read_bytes()
    before = hashlib.sha256(original).hexdigest()
    proposed = candidate(original.decode("utf-8"), args.server, args.with_memory).encode("utf-8")
    print(json.dumps({"server": args.server, "target": str(target), "beforeSha256": before,
                      "afterSha256": hashlib.sha256(proposed).hexdigest(),
                      "backendUrl": "https://" + host + PREFIX.rstrip("/"),
                      "publicOrigin": "https://" + PUBLIC_HOST,
                      "memoryUrl": "https://" + host + MEMORY_PREFIX.rstrip("/") if args.with_memory else None,
                      "change": "Add standalone API and authenticated private memory paths; preserve existing applications and TLS" if args.with_memory else "Add only the standalone API path; preserve existing applications and TLS",
                      "apply": args.apply}), flush=True)
    if not args.apply:
        return
    if os.geteuid() != 0:
        raise SystemExit("Administrative rights are required only for nginx activation")
    if args.expected_sha != before:
        raise SystemExit("Nginx configuration changed after review")
    check_backend()
    backup = apply_change(original, proposed, args.server, args.with_memory)
    print(json.dumps({"status": "activated", "server": args.server, "backup": str(backup),
                      "afterSha256": hashlib.sha256(proposed).hexdigest()}), flush=True)


if __name__ == "__main__":
    main()
