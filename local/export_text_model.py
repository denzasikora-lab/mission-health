import argparse
import hashlib
import json
import shutil
import struct
import uuid
from pathlib import Path

MODEL_ID = "google/embeddinggemma-2"
MODEL_REVISION = "914f7f89142e33e77833254d9c9b90c3cef7303b"
DIMENSIONS = 768


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def export_text_model(source, destination):
    source, destination = Path(source).resolve(), Path(destination).absolute()
    if destination.exists():
        raise ValueError("The destination already exists; no files were changed")
    for name in ("config.json", "model.safetensors"):
        metadata = source / ".cache/huggingface/download" / (name + ".metadata")
        if metadata.read_text(encoding="utf-8").splitlines()[0] != MODEL_REVISION:
            raise ValueError("The source checkpoint is not the pinned model revision")
    config = json.loads((source / "config.json").read_text(encoding="utf-8"))
    if config.get("model_type") != "embedding_gemma2" or config.get("text_config", {}).get("embedding_dim") != DIMENSIONS:
        raise ValueError("The source must be the 768-dimensional EmbeddingGemma 2 checkpoint")
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = destination.parent / ("." + destination.name + ".partial-" + uuid.uuid4().hex)
    staging.mkdir()
    try:
        for item in source.iterdir():
            if item.is_file() and item.suffix in {".json", ".txt", ".jinja", ".model"}:
                shutil.copyfile(item, staging / item.name)
        for name in ("1_Pooling", "2_Normalize"):
            if (source / name).is_dir():
                shutil.copytree(source / name, staging / name)
        config["vision_config"] = None
        config["audio_config"] = None
        (staging / "config.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
        with (source / "model.safetensors").open("rb") as original:
            length_bytes = original.read(8)
            if len(length_bytes) != 8:
                raise ValueError("The source weights are incomplete")
            header_length = struct.unpack("<Q", length_bytes)[0]
            if not 0 < header_length < 10 * 1024 * 1024:
                raise ValueError("Invalid safetensors header")
            header = json.loads(original.read(header_length))
            selected = {name: value for name, value in header.items() if name.startswith("language_model.")}
            if not selected:
                raise ValueError("No text encoder tensors were found")
            exported = {"__metadata__": header.get("__metadata__", {"format": "pt"})}
            offset = 0
            for name, value in selected.items():
                start, end = value["data_offsets"]
                if start < 0 or end < start or 8 + header_length + end > (source / "model.safetensors").stat().st_size:
                    raise ValueError("Invalid text tensor offsets")
                exported[name] = {**value, "data_offsets": [offset, offset + end - start]}
                offset += end - start
            encoded = json.dumps(exported, separators=(",", ":")).encode("utf-8")
            encoded += b" " * ((-len(encoded)) % 8)
            with (staging / "model.safetensors").open("wb") as target:
                target.write(struct.pack("<Q", len(encoded)))
                target.write(encoded)
                for value in selected.values():
                    start, end = value["data_offsets"]
                    original.seek(8 + header_length + start)
                    remaining = end - start
                    while remaining:
                        block = original.read(min(remaining, 1024 * 1024))
                        if not block:
                            raise ValueError("The source weights were truncated")
                        target.write(block)
                        remaining -= len(block)
        files = {str(item.relative_to(staging)): sha256(item) for item in sorted(staging.rglob("*")) if item.is_file()}
        if not {"config.json", "model.safetensors", "tokenizer.json"}.issubset(files):
            raise ValueError("Required text model files are missing")
        manifest = {"model": MODEL_ID, "revision": MODEL_REVISION, "dimensions": DIMENSIONS,
                    "modalities": ["text"], "files": files}
        (staging / "text-model-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        if destination.exists():
            raise ValueError("The destination was created by another process")
        staging.rename(destination)
        return {"directory": str(destination), "weightBytes": (destination / "model.safetensors").stat().st_size,
                "tensorCount": len(selected), "revision": MODEL_REVISION}
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    arguments = parser.parse_args()
    print(json.dumps(export_text_model(arguments.source, arguments.destination)))
