import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tarfile
import time
import urllib.error
import urllib.request

VERSION = "1.20.1"
URL = "https://github.com/qdrant/qdrant/releases/download/v1.20.1/qdrant-x86_64-unknown-linux-musl.tar.gz"
SHA256 = "52ea6723c10f8bd7be63950f4210bd52e93a8f45e8e81347f5ec94aa918fe14f"
SIZE = 35546333
UNIT = "mission-health-qdrant.service"


def systemctl(*args, check=True):
    return subprocess.run(["systemctl", "--user", *args], check=check, text=True, capture_output=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    root = Path.home() / "mission-health"
    unit = Path.home() / ".config/systemd/user" / UNIT
    target = root / "bin/qdrant"
    if os.geteuid() == 0:
        raise SystemExit("Run as the deployment user, without sudo")
    if unit.exists() or target.exists():
        raise SystemExit("Existing deployment found; review it before replacing files")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 6333))
    print(json.dumps({"version": VERSION, "sha256": SHA256, "root": str(root), "bind": "127.0.0.1:6333", "memoryMax": "1G", "apply": args.apply}), flush=True)
    if not args.apply:
        return
    for directory in (root / "bin", root / "downloads", root / "runtime", root / "qdrant/storage", root / "qdrant/snapshots", unit.parent):
        directory.mkdir(parents=True, exist_ok=True)
    (root / "runtime").chmod(0o700)
    archive = root / "downloads" / ("qdrant-" + VERSION + ".tar.gz")
    if not archive.exists():
        temporary = archive.with_suffix(".part")
        with urllib.request.urlopen(URL, timeout=90) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        temporary.replace(archive)
    if archive.stat().st_size != SIZE or hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise SystemExit("Qdrant archive size or SHA256 mismatch")
    with tarfile.open(archive) as package:
        members = [member for member in package.getmembers() if member.isfile() and Path(member.name).name == "qdrant"]
        if len(members) != 1:
            raise SystemExit("Unexpected Qdrant archive contents")
        with package.extractfile(members[0]) as source, target.open("wb") as output:
            shutil.copyfileobj(source, output)
    target.chmod(0o750)
    key_path = root / "runtime/qdrant-key"
    if not key_path.exists():
        key_path.write_text(secrets.token_urlsafe(48), encoding="utf-8")
    key_path.chmod(0o600)
    config = root / "runtime/qdrant.yaml"
    config.write_text(json.dumps({"log_level": "WARN", "telemetry_disabled": True,
        "storage": {"storage_path": str(root / "qdrant/storage"), "snapshots_path": str(root / "qdrant/snapshots"),
                    "on_disk_payload": True, "performance": {"max_search_threads": 1}},
        "service": {"host": "127.0.0.1", "http_port": 6333, "grpc_port": None, "enable_cors": False,
                    "api_key": key_path.read_text(encoding="utf-8").strip()}}, indent=2), encoding="utf-8")
    config.chmod(0o600)
    unit.write_text(f"""[Unit]
Description=Mission Health private vector storage
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
WorkingDirectory={root / 'qdrant'}
ExecStart={target} --config-path {config}
Restart=on-failure
RestartSec=5
MemoryHigh=768M
MemoryMax=1G
CPUQuota=100%
Nice=10
TasksMax=128
LimitNOFILE=65536
NoNewPrivileges=true
UMask=0077

[Install]
WantedBy=default.target
""", encoding="utf-8")
    unit.chmod(0o644)
    try:
        systemctl("daemon-reload")
        systemctl("enable", "--now", UNIT)
        ready = False
        for _ in range(30):
            try:
                request = urllib.request.Request("http://127.0.0.1:6333/collections", headers={"api-key": key_path.read_text(encoding="utf-8").strip()})
                with urllib.request.urlopen(request, timeout=2) as response:
                    ready = response.status == 200
                if ready:
                    break
            except (OSError, urllib.error.URLError):
                time.sleep(1)
        if not ready:
            raise RuntimeError("Qdrant did not become ready")
    except Exception:
        systemctl("disable", "--now", UNIT, check=False)
        raise
    print(json.dumps({"status": "ready", "version": VERSION, "unit": UNIT, "bind": "127.0.0.1:6333"}), flush=True)


if __name__ == "__main__":
    main()
