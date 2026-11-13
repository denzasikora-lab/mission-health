import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import secrets
import shutil
import socket
import sqlite3
import stat
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import uuid

UNIT = "mission-health-api.service"
PUBLIC_ORIGIN = "https://mission-health-bug-busters.vercel.app"
PUBLIC_HOST = "mission-health-bug-busters.vercel.app"
NODE_VERSION = "v24.14.0"
NODE_DIRECTORY = "node-v24.14.0-linux-x64"
NODE_SHA256 = "41cd79bb7877c81605a9e68ec4c91547774f46a40c67a17e34d7179ef11729df"
REQUIRED_FILES = {"server/standalone.mjs", "server/storage.mjs", "server/session.mjs", "dist/backend/worker.mjs"}


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def verify_archive(path, expected):
    if not re.fullmatch(r"[0-9a-f]{64}", expected) or digest(path) != expected:
        raise ValueError("Archive SHA256 verification failed")


def archive_members(path, node=False):
    with tarfile.open(path, "r:*") as package:
        members = package.getmembers()
    if not members or len(members) > 50000 or sum(item.size for item in members) > (1024 if node else 256) * 1024 * 1024:
        raise ValueError("Archive size or file count is outside the deployment limits")
    names = set()
    for member in members:
        name = PurePosixPath(member.name)
        if not name.parts and member.isdir():
            continue
        if name.is_absolute() or ".." in name.parts or "\\" in member.name or not name.parts:
            raise ValueError("Unsafe archive path")
        if str(name) in names:
            raise ValueError("Duplicate archive path")
        names.add(str(name))
        if node:
            if name.parts[0] != NODE_DIRECTORY or not (member.isfile() or member.isdir() or member.issym()):
                raise ValueError("Unexpected Node archive layout or entry type")
            if member.issym():
                target = PurePosixPath(member.linkname)
                if target.is_absolute() or "\\" in member.linkname:
                    raise ValueError("Unsafe Node archive link")
                parts = list(name.parent.parts)
                for part in target.parts:
                    if part == "..":
                        if len(parts) <= 1:
                            raise ValueError("Node archive link escapes its runtime directory")
                        parts.pop()
                    elif part != ".":
                        parts.append(part)
        elif not (member.isfile() or member.isdir()):
            raise ValueError("Backend archives cannot contain links or special files")
        if not node and any(part.startswith(".") or part in {"runtime.env", "session-secret", "release-manifest.json"} for part in name.parts):
            raise ValueError("Backend archive contains a private or reserved path")
    if node:
        if not any(str(PurePosixPath(member.name)) == NODE_DIRECTORY + "/bin/node" and member.isfile() for member in members):
            raise ValueError("The Node executable is missing")
    elif not REQUIRED_FILES.issubset(names) or not any(name.startswith("drizzle/") and name.endswith(".sql") for name in names):
        raise ValueError("The backend archive is missing its server, Worker, or SQL migrations")
    return members


def private_file(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("A required private file is absent or is a link: " + str(path))
    metadata = path.stat()
    if metadata.st_uid != os.getuid() or metadata.st_mode & 0o077:
        raise ValueError("A private file must belong to the deployment user and use mode 0600: " + str(path))
    return path.read_bytes()


def environment_values(path):
    raw = private_file(path)
    values = {}
    for line in raw.decode("utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", name):
            raise ValueError("runtime.env must use NAME=value lines")
        if name in values:
            raise ValueError("runtime.env contains a duplicate setting")
        if value.startswith('"'):
            value = json.loads(value)
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
        values[name] = value
    if values.get("PUBLIC_ORIGIN") != PUBLIC_ORIGIN:
        raise ValueError("runtime.env must contain the verified PUBLIC_ORIGIN")
    if "LOCAL_PREVIEW" in values:
        raise ValueError("LOCAL_PREVIEW is forbidden in the hosted backend")
    root = path.parent
    protected = {"SESSION_SECRET_FILE": str(root / "session-secret"), "DATA_DIR": str(root / "data"),
                 "MIGRATIONS_DIR": str(root / "current/drizzle"),
                 "WORKER_MODULE": str(root / "current/dist/backend/worker.mjs"),
                 "API_HOST": "127.0.0.1", "API_PORT": "8092", "NODE_ENV": "production"}
    if any(name in values and values[name] != expected for name, expected in protected.items()):
        raise ValueError("runtime.env conflicts with a protected backend path or listener setting")
    return raw


def atomic_file(path, content, mode=0o600):
    descriptor, temporary = tempfile.mkstemp(prefix=".mission-health-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
            os.fchmod(handle.fileno(), mode)
        os.replace(temporary, path)
    finally:
        if os.path.lexists(temporary):
            os.unlink(temporary)


def current_target(path, releases):
    if not os.path.lexists(path):
        return None
    if not path.is_symlink():
        raise ValueError("The current release must be a symbolic link")
    target = path.resolve(strict=True)
    if target.parent != releases.resolve() or not target.is_dir():
        raise ValueError("The current release points outside the releases directory")
    return os.readlink(path)


def swap_current(path, target):
    temporary = path.parent / (".current-" + uuid.uuid4().hex)
    try:
        temporary.symlink_to(target)
        os.replace(temporary, path)
    finally:
        if temporary.is_symlink():
            temporary.unlink()


def unit_content(root, node):
    return f"""[Unit]
Description=Mission Health standalone API
After=network-online.target mission-health-memory.service
Wants=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
WorkingDirectory={root / 'current'}
EnvironmentFile={root / 'runtime.env'}
Environment=NODE_ENV=production
Environment=SESSION_SECRET_FILE={root / 'session-secret'}
Environment=DATA_DIR={root / 'data'}
Environment=MIGRATIONS_DIR={root / 'current/drizzle'}
Environment=WORKER_MODULE={root / 'current/dist/backend/worker.mjs'}
Environment=API_HOST=127.0.0.1
Environment=API_PORT=8092
ExecStart={node} --max-old-space-size=256 {root / 'current/server/standalone.mjs'}
Restart=on-failure
RestartSec=5
TimeoutStartSec=90
TimeoutStopSec=45
MemoryHigh=512M
MemoryMax=768M
CPUQuota=100%
TasksMax=128
LimitNOFILE=8192
Nice=5
NoNewPrivileges=true
UMask=0077

[Install]
WantedBy=default.target
""".encode("utf-8")


def systemctl(*arguments, check=True):
    return subprocess.run(["systemctl", "--user", *arguments], check=check, text=True, capture_output=True)


def ready():
    request = urllib.request.Request("http://127.0.0.1:8092/_health", headers={"Host": PUBLIC_HOST})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=3) as response:
        return response.status == 200 and json.load(response).get("ready") is True


def wait_ready(seconds=90):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if systemctl("is-active", UNIT, check=False).stdout.strip() == "active" and ready():
                return
        except (OSError, ValueError):
            pass
        time.sleep(1)
    raise RuntimeError("The backend did not become ready")


def install_node(archive, directory):
    node = directory / "bin/node"
    with tarfile.open(archive, "r:*") as package:
        member = next(item for item in package.getmembers() if str(PurePosixPath(item.name)) == NODE_DIRECTORY + "/bin/node")
        source = package.extractfile(member)
        expected = hashlib.sha256()
        with source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                expected.update(block)
    if os.path.lexists(directory):
        if directory.is_symlink() or node.is_symlink() or not node.is_file() or digest(node) != expected.hexdigest():
            raise ValueError("The existing Node runtime does not match the verified archive")
    else:
        staging = Path(tempfile.mkdtemp(prefix=".node-stage-", dir=directory.parent))
        try:
            with tarfile.open(archive, "r:*") as package:
                package.extractall(staging, filter="data")
            if digest(staging / NODE_DIRECTORY / "bin/node") != expected.hexdigest():
                raise ValueError("Extracted Node executable checksum mismatch")
            (staging / NODE_DIRECTORY).rename(directory)
        finally:
            shutil.rmtree(staging, ignore_errors=True)
    result = subprocess.run([str(node), "--version"], check=True, text=True, capture_output=True, timeout=15)
    if result.stdout.strip() != NODE_VERSION:
        raise ValueError("The verified Node runtime has an unexpected version")
    return node


def extract_release(archive, release, artifact_sha):
    staging = Path(tempfile.mkdtemp(prefix=".release-stage-", dir=release.parent))
    try:
        with tarfile.open(archive, "r:*") as package:
            package.extractall(staging, filter="data")
        for path in staging.rglob("*"):
            path.chmod(0o700 if path.is_dir() else 0o600)
        manifest = {"releaseId": release.name, "artifactSha256": artifact_sha,
                    "createdAt": datetime.now(timezone.utc).isoformat()}
        (staging / "release-manifest.json").write_text(json.dumps(manifest) + "\n", encoding="utf-8")
        (staging / "release-manifest.json").chmod(0o600)
        staging.rename(release)
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def database_backup(root, release_id):
    database = root / "data/mission-health.sqlite"
    if not database.exists():
        return None
    if database.is_symlink() or not database.is_file():
        raise ValueError("The database must be a regular file inside the private data directory")
    backups = root / "backups"
    if backups.is_symlink():
        raise ValueError("The database backup directory cannot be a symbolic link")
    backups.mkdir(mode=0o700, exist_ok=True)
    backups.chmod(0o700)
    filename = "database-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-" + release_id + ".sqlite"
    target = backups / filename
    if shutil.disk_usage(backups).free < max(database.stat().st_size * 2, 64 * 1024 * 1024):
        raise RuntimeError("Insufficient disk space for a consistent database backup")
    descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    source_connection = target_connection = None
    try:
        source_connection = sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True, timeout=15)
        target_connection = sqlite3.connect(target, timeout=15)
        source_connection.backup(target_connection)
        if target_connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("The database backup failed its integrity check")
    finally:
        if target_connection is not None:
            target_connection.close()
        if source_connection is not None:
            source_connection.close()
    return target


def ensure_secret(path):
    if not os.path.lexists(path):
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(secrets.token_urlsafe(48) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
    value = private_file(path).decode("utf-8").strip()
    if len(value.encode("utf-8")) < 32:
        raise ValueError("The existing session secret is too short; it was not replaced")


def activate(root, unit_path, release, node, original_environment):
    current = root / "current"
    previous_target = current_target(current, root / "releases")
    previous_unit = unit_path.read_bytes() if unit_path.exists() else None
    previous_mode = stat.S_IMODE(unit_path.stat().st_mode) if unit_path.exists() else 0o644
    was_active = systemctl("is-active", UNIT, check=False).stdout.strip() == "active"
    previous_enabled = systemctl("is-enabled", UNIT, check=False).stdout.strip()
    was_enabled = previous_enabled in {"enabled", "enabled-runtime"}
    if environment_values(root / "runtime.env") != original_environment:
        raise ValueError("runtime.env changed during deployment preparation")
    proposed = unit_content(root, node)
    backup = None
    swapped = unit_written = False
    try:
        if was_active:
            systemctl("stop", UNIT)
        backup = database_backup(root, release.name)
        swap_current(current, release)
        swapped = True
        atomic_file(unit_path, proposed, 0o644)
        unit_written = True
        systemctl("daemon-reload")
        systemctl("reset-failed", UNIT, check=False)
        systemctl("enable", UNIT)
        systemctl("restart", UNIT)
        wait_ready()
    except BaseException as error:
        systemctl("stop", UNIT, check=False)
        if swapped and (not current.is_symlink() or current.resolve() != release.resolve()):
            raise RuntimeError("Concurrent release edit preserved; inspect the deployment and database backup") from error
        if unit_written and (not unit_path.exists() or unit_path.read_bytes() != proposed):
            raise RuntimeError("Concurrent API unit edit preserved; inspect the deployment and database backup") from error
        systemctl("disable", UNIT, check=False)
        if unit_written:
            if previous_unit is None:
                unit_path.unlink()
            else:
                atomic_file(unit_path, previous_unit, previous_mode)
        if swapped:
            if previous_target is None:
                current.unlink()
            else:
                swap_current(current, previous_target)
        systemctl("daemon-reload")
        if was_enabled:
            systemctl("enable", *(["--runtime"] if previous_enabled == "enabled-runtime" else []), UNIT)
        if was_active:
            systemctl("start", UNIT)
        print(json.dumps({"status": "rolled_back", "unit": UNIT,
                          "databaseBackup": str(backup) if backup else None,
                          "databaseRestored": False}), flush=True)
        raise
    return backup


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--node-archive", type=Path, required=True)
    parser.add_argument("--node-sha256", required=True)
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if os.geteuid() == 0:
        raise SystemExit("Run as the deployment user, without sudo")
    if platform.system() != "Linux" or platform.machine() not in {"x86_64", "amd64"}:
        raise SystemExit("The deployment target must be Linux x86_64")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,95}", args.release_id):
        raise SystemExit("Invalid immutable release ID")
    if args.node_sha256 != NODE_SHA256:
        raise SystemExit("Node archive SHA256 must match the pinned official runtime")
    verify_archive(args.artifact, args.sha256)
    verify_archive(args.node_archive, args.node_sha256)
    archive_members(args.artifact)
    archive_members(args.node_archive, node=True)
    root = Path.home() / "mission-health/backend"
    original_environment = environment_values(root / "runtime.env")
    unit_path = Path.home() / ".config/systemd/user" / UNIT
    if root.is_symlink() or any((root / name).is_symlink() for name in ("releases", "data", "runtimes", "backups")) or unit_path.is_symlink():
        raise SystemExit("Deployment directories and the API unit cannot be symbolic links")
    if unit_path.exists() and unit_path.stat().st_uid != os.getuid():
        raise SystemExit("The existing API unit must belong to the deployment user")
    releases = root / "releases"
    current_target(root / "current", releases)
    release = releases / args.release_id
    if os.path.lexists(release):
        raise SystemExit("The immutable release ID already exists; choose a new release ID")
    active = systemctl("is-active", UNIT, check=False).stdout.strip() == "active"
    fragment = systemctl("show", UNIT, "--property=FragmentPath", "--value", check=False).stdout.strip()
    if fragment and Path(fragment) != unit_path:
        raise SystemExit("An API unit is already loaded from another location; review it before deployment")
    with socket.socket() as probe:
        probe.settimeout(1)
        if probe.connect_ex(("127.0.0.1", 8092)) == 0 and not active:
            raise SystemExit("Port 8092 is already occupied by another process")
    print(json.dumps({"root": str(root), "releaseId": args.release_id, "artifactSha256": args.sha256,
                      "unit": UNIT, "bind": "127.0.0.1:8092", "publicOrigin": PUBLIC_ORIGIN,
                      "memoryMax": "768M", "apply": args.apply}), flush=True)
    if not args.apply:
        return
    previous_umask = os.umask(0o077)
    try:
        root.chmod(0o700)
        descriptor = os.open(root / ".install.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "a", encoding="utf-8") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if os.path.lexists(release):
                raise RuntimeError("The immutable release ID was created by another installer")
            for path in (releases, root / "data", root / "runtimes", unit_path.parent):
                path.mkdir(mode=0o700, parents=True, exist_ok=True)
            for path in (releases, root / "data", root / "runtimes"):
                path.chmod(0o700)
            ensure_secret(root / "session-secret")
            node = install_node(args.node_archive, root / "runtimes" / NODE_DIRECTORY)
            extract_release(args.artifact, release, args.sha256)
            backup = activate(root, unit_path, release, node, original_environment)
            print(json.dumps({"status": "ready", "releaseId": release.name, "unit": UNIT,
                              "databaseBackup": str(backup) if backup else None}), flush=True)
    finally:
        os.umask(previous_umask)


if __name__ == "__main__":
    main()
