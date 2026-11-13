import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request

UNIT = "mission-health-memory.service"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    root = Path.home() / "mission-health"
    unit = Path.home() / ".config/systemd/user" / UNIT
    if os.geteuid() == 0:
        raise SystemExit("Run as the deployment user, without sudo")
    if unit.exists():
        raise SystemExit("Existing memory service found; review before replacing it")
    sys.path.insert(0, str(root / "local"))
    from service import verify_model
    verify_model(root / "models/embeddinggemma-2-text")
    print(json.dumps({"modelVerified": True, "unit": str(unit), "bind": "127.0.0.1:8091", "memoryMax": "3G", "threads": 2, "apply": args.apply}), flush=True)
    if not args.apply:
        return
    runtime = root / "runtime"
    runtime.mkdir(mode=0o700, exist_ok=True)
    runtime.chmod(0o700)
    key_path = runtime / "memory-key"
    if not key_path.exists():
        key_path.write_text(secrets.token_urlsafe(48), encoding="utf-8")
    key_path.chmod(0o600)
    key = key_path.read_text(encoding="utf-8").strip()
    environment = {
        "MEMORY_MODE": "hosted", "MEMORY_API_KEY": key,
        "MEMORY_MODEL_DIR": str(root / "models/embeddinggemma-2-text"),
        "QDRANT_URL": "http://127.0.0.1:6333",
        "QDRANT_API_KEY": (runtime / "qdrant-key").read_text(encoding="utf-8").strip(),
    }
    env_file = runtime / "memory.env"
    env_file.write_text("".join(name + "=" + value + "\n" for name, value in environment.items()), encoding="utf-8")
    env_file.chmod(0o600)
    template = (root / "local/mission-health-memory.service").read_text(encoding="utf-8")
    template = template.replace("%h/.local/share/mission-health", "%h/mission-health").replace("%h/.config/mission-health/memory.env", "%h/mission-health/runtime/memory.env")
    for setting in ("PrivateTmp=true\n", "ProtectSystem=strict\n", "ProtectHome=read-only\n"):
        template = template.replace(setting, "")
    template = template.replace("[Service]\n", "[Service]\nNice=10\n")
    unit.write_text(template, encoding="utf-8")
    unit.chmod(0o644)
    try:
        subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
        subprocess.run(["systemctl", "--user", "enable", "--now", UNIT], check=True)
        ready = False
        for _ in range(180):
            try:
                request = urllib.request.Request("http://127.0.0.1:8091/health", headers={"Authorization": "Bearer " + key})
                with urllib.request.urlopen(request, timeout=3) as response:
                    health = json.load(response)
                ready = health.get("semantic") is True and health.get("generation") is False
                if ready:
                    break
            except (OSError, urllib.error.URLError):
                time.sleep(1)
        if not ready:
            raise RuntimeError("Memory service did not become ready")
    except Exception:
        subprocess.run(["systemctl", "--user", "disable", "--now", UNIT], check=False)
        raise
    print(json.dumps({"status": "ready", "health": health, "unit": UNIT}), flush=True)


if __name__ == "__main__":
    main()
