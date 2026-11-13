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
import uuid

TARGET = Path("/etc/nginx/sites-enabled/app")
HOST = "app.fereyappfuturewinterworkbookgrace.store"
PUBLIC_HOST = "mission-health-bug-busters.vercel.app"
PREFIX = "/mission-health-api/"
BACKUPS = Path("/var/backups/mission-health")
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


def candidate(source):
    if PREFIX.rstrip("/") in source:
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
        if any(HOST in value.split() for value in names) and re.search(r"listen\s+(?:\[::\]:)?443\s+ssl\b", block):
            matches.append(end - 1)
    if len(matches) != 1:
        raise ValueError("Expected exactly one existing app HTTPS server")
    index = matches[0]
    return source[:index] + ROUTE + source[index:]


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


def apply_locked(original, proposed, backup_dir, resolved_target):
    if TARGET.resolve(strict=True) != resolved_target or resolved_target.read_bytes() != original:
        raise ValueError("Nginx configuration changed during deployment preparation")
    metadata = resolved_target.stat()
    backup = backup_dir / ("nginx-app-backend-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-" + uuid.uuid4().hex)
    shutil.copy2(resolved_target, backup)
    backup.chmod(0o600)
    try:
        if TARGET.resolve(strict=True) != resolved_target or resolved_target.read_bytes() != original:
            raise ValueError("Nginx configuration changed before replacement")
        replace_file(resolved_target, proposed, metadata)
        subprocess.run(["/usr/sbin/nginx", "-t"], check=True)
        subprocess.run(["/bin/systemctl", "reload", "nginx"], check=True)
    except BaseException as error:
        if TARGET.resolve(strict=True) != resolved_target or resolved_target.read_bytes() != proposed:
            raise RuntimeError("Concurrent nginx edit preserved; inspect the saved backup before manual recovery") from error
        replace_file(resolved_target, original, metadata)
        subprocess.run(["/usr/sbin/nginx", "-t"], check=True)
        subprocess.run(["/bin/systemctl", "reload", "nginx"], check=True)
        raise
    return backup


def apply_change(original, proposed):
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    BACKUPS.chmod(0o700)
    descriptor = os.open(BACKUPS / "activation.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "a", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        check_backend()
        return apply_locked(original, proposed, BACKUPS, TARGET.resolve(strict=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-sha")
    args = parser.parse_args()
    original = TARGET.read_bytes()
    before = hashlib.sha256(original).hexdigest()
    proposed = candidate(original.decode("utf-8")).encode("utf-8")
    print(json.dumps({"target": str(TARGET), "beforeSha256": before,
                      "afterSha256": hashlib.sha256(proposed).hexdigest(),
                      "backendUrl": "https://" + HOST + PREFIX.rstrip("/"),
                      "publicOrigin": "https://" + PUBLIC_HOST,
                      "change": "Add only the standalone API path; preserve existing applications and TLS",
                      "apply": args.apply}), flush=True)
    if not args.apply:
        return
    if os.geteuid() != 0:
        raise SystemExit("Administrative rights are required only for nginx activation")
    if args.expected_sha != before:
        raise SystemExit("Nginx configuration changed after review")
    check_backend()
    backup = apply_change(original, proposed)
    print(json.dumps({"status": "activated", "backup": str(backup),
                      "afterSha256": hashlib.sha256(proposed).hexdigest()}), flush=True)


if __name__ == "__main__":
    main()
