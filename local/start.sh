#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"
docker_binary="$(command -v docker || true)"
if [[ -z "$docker_binary" ]]; then
  docker_binary="/Applications/Docker.app/Contents/Resources/bin/docker"
fi
"$docker_binary" info >/dev/null
mkdir -p local/storage/qdrant local/runtime
if "$docker_binary" inspect mission-health-qdrant >/dev/null 2>&1; then
  "$docker_binary" start mission-health-qdrant >/dev/null
else
  "$docker_binary" run -d --name mission-health-qdrant \
    -p 127.0.0.1:6333:6333 \
    -v "$project_root/local/storage/qdrant:/qdrant/storage" \
    qdrant/qdrant@sha256:b7b0444c4c351c970b98e90a6f89c2ee4287c65b44e52b4cb503fa5b2aa927ad
fi
.venv/bin/python - <<'PY'
from pathlib import Path
import secrets
key_file = Path('local/runtime/memory-key')
if not key_file.exists():
    key_file.write_text(secrets.token_urlsafe(32))
key_file.chmod(0o600)
settings = Path('.dev.vars')
existing = [line for line in settings.read_text().splitlines() if not line.startswith('MEMORY_API_KEY=')] if settings.exists() else []
settings.write_text('\n'.join(existing) + '\nMEMORY_API_KEY=' + key_file.read_text().strip() + '\n')
settings.chmod(0o600)
PY
npm run build
WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler d1 migrations apply DB --local --config wrangler.jsonc --persist-to .wrangler/state
MEMORY_MODE=local .venv/bin/python local/service.py &
memory_pid=$!
trap 'kill "$memory_pid" 2>/dev/null || true' EXIT INT TERM
.venv/bin/python - <<'PY'
import time
import urllib.request
from pathlib import Path
key = Path('local/runtime/memory-key').read_text().strip()
for attempt in range(90):
    try:
        request = urllib.request.Request('http://127.0.0.1:8091/health', headers={'Authorization': 'Bearer ' + key})
        urllib.request.urlopen(request, timeout=2).close()
        break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit('Local memory failed to start. Check the service output.')
PY
WRANGLER_SEND_METRICS=false npm run dev
