import argparse
import fcntl
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import urllib.request

TARGET = Path("/etc/nginx/sites-enabled/app")
ROOT = Path("/home/t4/mission-health")
HOST = "app.fereyappfuturewinterworkbookgrace.store"
PREFIX = "/mission-health-memory/"
BACKUPS = Path("/var/backups/mission-health")
ROUTE = """
    location ^~ /mission-health-memory/ {
        client_max_body_size 64k;
        proxy_pass http://127.0.0.1:8091/;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 5s;
        proxy_read_timeout 90s;
        proxy_buffering off;
    }
"""


def candidate(source):
    if PREFIX.rstrip("/") in source:
        raise ValueError("Memory route already exists; review instead of replacing it")
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


def replace_file(path, value, metadata):
    descriptor, name = tempfile.mkstemp(prefix=".mission-health-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(value)
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), metadata.st_mode & 0o777)
            os.fchown(output.fileno(), metadata.st_uid, metadata.st_gid)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def check_memory():
    key = (ROOT / "runtime/memory-key").read_text(encoding="utf-8").strip()
    request = urllib.request.Request("http://127.0.0.1:8091/health", headers={"Authorization": "Bearer " + key})
    with urllib.request.urlopen(request, timeout=15) as response:
        health = json.load(response)
    if health.get("semantic") is not True or health.get("generation") is not False:
        raise RuntimeError("Expected a ready text-only memory service")


def apply_change(original, proposed):
    backup_dir = BACKUPS
    backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (backup_dir / "activation.lock").open("a", encoding="utf-8") as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        return apply_locked(original, proposed, backup_dir)


def apply_locked(original, proposed, backup_dir):
    if TARGET.read_bytes() != original:
        raise ValueError("Nginx configuration changed during deployment preparation")
    metadata = TARGET.stat()
    backup = backup_dir / ("nginx-app-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    if backup.exists():
        raise RuntimeError("Backup already exists")
    shutil.copy2(TARGET, backup)
    try:
        if TARGET.read_bytes() != original:
            raise ValueError("Nginx configuration changed before replacement")
        replace_file(TARGET, proposed, metadata)
        subprocess.run(["/usr/sbin/nginx", "-t"], check=True)
        subprocess.run(["/bin/systemctl", "reload", "nginx"], check=True)
    except Exception:
        if TARGET.read_bytes() != proposed:
            raise RuntimeError("Concurrent nginx edit preserved; inspect the saved backup before manual recovery")
        replace_file(TARGET, original, metadata)
        subprocess.run(["/usr/sbin/nginx", "-t"], check=True)
        subprocess.run(["/bin/systemctl", "reload", "nginx"], check=True)
        raise
    return backup


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-sha")
    args = parser.parse_args()
    original = TARGET.read_bytes()
    digest = hashlib.sha256(original).hexdigest()
    proposed = candidate(original.decode("utf-8")).encode("utf-8")
    print(json.dumps({"target": str(TARGET), "beforeSha256": digest,
                      "memoryUrl": "https://" + HOST + PREFIX.rstrip("/"),
                      "change": "Add one localhost memory proxy location; preserve existing locations and TLS", "apply": args.apply}), flush=True)
    if not args.apply:
        return
    if os.geteuid() != 0:
        raise SystemExit("sudo is required only for the nginx activation")
    if args.expected_sha != digest:
        raise SystemExit("Nginx configuration changed after review")
    check_memory()
    backup = apply_change(original, proposed)
    print(json.dumps({"status": "activated", "backup": str(backup), "afterSha256": hashlib.sha256(proposed).hexdigest()}), flush=True)


if __name__ == "__main__":
    main()
