"""Download local models for text memory and the assistant."""

from pathlib import Path

from huggingface_hub import snapshot_download

ROOT = Path(__file__).resolve().parents[1]

for repository, directory in (
    ("google/embeddinggemma-2", "embeddinggemma-2"),
    ("mlx-community/Qwen3-1.7B-4bit", "journal-assistant"),
):
    snapshot_download(repository, local_dir=ROOT / "local/models" / directory)
