"""Index the versioned public NASA corpus through the existing private memory service."""

import argparse
import json
from pathlib import Path
import shlex
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--bundle", type=Path, required=True)
    args = parser.parse_args()
    settings = {}
    for line in args.env_file.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() in {"MEMORY_URL", "MEMORY_API_KEY"}:
            tokens = shlex.split(value)
            settings[key.strip()] = tokens[0] if tokens else ""
    bundle = json.loads(args.bundle.read_text(encoding="utf-8"))
    if not bundle["scope"].startswith("nasa-research:") or not settings.get("MEMORY_API_KEY"):
        raise ValueError("A public NASA scope and private memory configuration are required")

    def request(path, value):
        data = json.dumps(value).encode("utf-8")
        req = urllib.request.Request(settings["MEMORY_URL"].rstrip("/") + path, data=data,
                                     headers={"Content-Type": "application/json", "Authorization": "Bearer " + settings["MEMORY_API_KEY"]})
        with urllib.request.urlopen(req, timeout=90) as response:
            return json.load(response)

    for entry in bundle["evidence"]:
        result = request("/upsert", {"id": entry["id"], "ownerId": bundle["scope"], "astronautId": "personal",
                                     "text": entry["title"] + "\n" + entry["text"] + "\nSource: " + entry["url"],
                                     "language": "en", "createdAt": "2026-11-15T00:00:00Z"})
        if result.get("indexed") is not True:
            raise ValueError("NASA indexing was not confirmed")
    result = request("/search", {"ownerId": bundle["scope"], "astronautId": "personal", "query": "sleep duration fatigue workload crew support"})
    known = {entry["id"] for entry in bundle["evidence"]}
    matches = [row for row in result.get("matches", []) if row.get("id") in known]
    if not matches:
        raise ValueError("NASA retrieval verification failed")
    print(json.dumps({"version": bundle["version"], "indexed": len(known), "verifiedMatches": len(matches)}))


if __name__ == "__main__":
    main()
