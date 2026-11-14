import asyncio
import json
import struct
import sys
import tempfile
import types
import unittest
import uuid
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from qdrant_client import models

from local import export_text_model as exporter
from local import service

KEY = "test-memory-key-" + "a" * 32


class Vector(list):
    def tolist(self):
        return list(self)


class Embedder:
    def __init__(self, *args, **kwargs):
        self.calls = []

    def get_sentence_embedding_dimension(self):
        return 768

    def encode(self, text, **kwargs):
        self.calls.append((text, kwargs))
        vector = Vector([1.0] + [0.0] * 767)
        return vector if isinstance(text, str) else [vector for _ in text]


class MemoryQdrant:
    def __init__(self, size=768):
        self.points = {}
        self.size = size
        self.closed = False
        self.indexes = []

    def collection_exists(self, collection):
        return True

    def get_collection(self, collection):
        vectors = models.VectorParams(size=self.size, distance=models.Distance.COSINE)
        return types.SimpleNamespace(config=types.SimpleNamespace(params=types.SimpleNamespace(vectors=vectors)))

    def create_payload_index(self, *args, **kwargs):
        self.indexes.append(args[1])

    def upsert(self, collection, points, wait):
        self.points.update({point.id: point for point in points})

    def delete(self, collection, points_selector, wait):
        def selected(point):
            for condition in points_selector.filter.must:
                match = condition.match
                if hasattr(match, "value") and point.payload.get(condition.key) != match.value:
                    return False
                if hasattr(match, "any") and point.payload.get(condition.key) not in match.any:
                    return False
            return True
        self.points = {key: point for key, point in self.points.items() if not selected(point)}

    def query_points(self, collection, query, query_filter, **kwargs):
        self.last_filter = query_filter
        required = {condition.key: condition.match.value for condition in query_filter.must}
        points = [types.SimpleNamespace(payload=point.payload, score=0.9) for point in self.points.values()
                  if all(point.payload.get(key) == value for key, value in required.items())]
        return types.SimpleNamespace(points=points)

    def close(self):
        self.closed = True


def fixture_model(directory):
    source = directory / "source"
    source.mkdir()
    metadata = source / ".cache/huggingface/download"
    metadata.mkdir(parents=True)
    for name in ("config.json", "model.safetensors"):
        (metadata / (name + ".metadata")).write_text(exporter.MODEL_REVISION + "\netag\n", encoding="utf-8")
    config = {"model_type": "embedding_gemma2", "text_config": {"embedding_dim": 768},
              "vision_config": {"enabled": True}, "audio_config": {"enabled": True}}
    (source / "config.json").write_text(json.dumps(config), encoding="utf-8")
    (source / "tokenizer.json").write_text("{}", encoding="utf-8")
    header = {"__metadata__": {"format": "pt"},
              "audio_tower.weight": {"dtype": "BF16", "shape": [2], "data_offsets": [0, 4]},
              "language_model.weight": {"dtype": "BF16", "shape": [2], "data_offsets": [4, 8]},
              "vision_tower.weight": {"dtype": "BF16", "shape": [2], "data_offsets": [8, 12]}}
    encoded = json.dumps(header).encode("utf-8")
    encoded += b" " * ((-len(encoded)) % 8)
    (source / "model.safetensors").write_bytes(struct.pack("<Q", len(encoded)) + encoded + b"AAAA" + b"TEXT" + b"VVVV")
    return source


class SettingsTests(unittest.TestCase):
    def test_hosted_requires_a_key_without_generating_a_local_secret(self):
        with patch.object(service, "local_key", side_effect=AssertionError("unexpected local key")):
            with self.assertRaisesRegex(ValueError, "MEMORY_API_KEY"):
                service.Settings.from_env({})

    def test_local_mode_and_assistant_require_explicit_opt_in(self):
        settings = service.Settings.from_env({"MEMORY_API_KEY": KEY})
        self.assertEqual(settings.mode, "hosted")
        self.assertFalse(settings.assistant)
        self.assertEqual((settings.threads, settings.batch_size), (2, 1))
        with self.assertRaisesRegex(ValueError, "only in"):
            service.Settings.from_env({"MEMORY_API_KEY": KEY, "MEMORY_ENABLE_LOCAL_ASSISTANT": "1"})
        with patch.object(service, "local_key", return_value=KEY):
            local = service.Settings.from_env({"MEMORY_MODE": "local", "MEMORY_ENABLE_LOCAL_ASSISTANT": "1"})
        self.assertTrue(local.assistant)

    def test_resource_limits_and_mode_are_validated(self):
        for key, value in (("MEMORY_MODE", "production"), ("MEMORY_CPU_THREADS", "0"),
                           ("MEMORY_BATCH_SIZE", "5"), ("MEMORY_MAX_TOKENS", "99999")):
            with self.subTest(key=key), self.assertRaises(ValueError):
                service.Settings.from_env({"MEMORY_API_KEY": KEY, key: value})


class ApiTests(unittest.TestCase):
    def setUp(self):
        service.runtime.clear()
        self.qdrant = MemoryQdrant()
        self.embedder = Embedder()
        service.runtime.update(settings=service.Settings.from_env({"MEMORY_API_KEY": KEY}),
                               qdrant=self.qdrant, embedder=self.embedder)
        self.client = TestClient(service.app)
        self.headers = {"Authorization": "Bearer " + KEY}

    def tearDown(self):
        self.client.close()
        service.runtime.clear()

    def test_all_routes_require_the_service_bearer_and_local_generation_is_off(self):
        self.assertEqual(self.client.get("/health").status_code, 401)
        self.assertEqual(self.client.get("/health", headers={"Authorization": "Bearer wrong"}).status_code, 401)
        result = self.client.get("/health", headers=self.headers).json()
        self.assertFalse(result["generation"])
        self.assertEqual(result["embeddingRevision"], exporter.MODEL_REVISION)
        self.assertEqual(result["dimensions"], 768)
        response = self.client.post("/answer", headers=self.headers,
                                    json={"ownerId": "owner-a", "astronautId": "personal", "query": "Recall my note", "language": "en"})
        self.assertEqual(response.status_code, 503)

    def test_same_entry_uuid_cannot_overwrite_another_owner_or_profile(self):
        entry_id = str(uuid.uuid4())
        for owner, astronaut in (("owner-a", "personal"), ("owner-b", "personal"), ("owner-a", "jessica-meir")):
            response = self.client.post("/upsert", headers=self.headers, json={
                "id": entry_id, "ownerId": owner, "astronautId": astronaut, "text": "Scoped journal note",
                "language": "en", "createdAt": "2026-11-13T10:00:00Z"})
            self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.qdrant.points), 3)
        self.assertTrue(all(len(point.vector) == 768 for point in self.qdrant.points.values()))
        self.assertTrue(all(kwargs["batch_size"] == 1 for _, kwargs in self.embedder.calls))

    def test_search_always_filters_owner_and_profile(self):
        for owner, astronaut, text in (("owner-a", "personal", "Alpha"), ("owner-b", "personal", "Beta"),
                                       ("owner-a", "jessica-meir", "Gamma")):
            self.client.post("/upsert", headers=self.headers, json={
                "id": str(uuid.uuid4()), "ownerId": owner, "astronautId": astronaut, "text": text,
                "language": "en", "createdAt": "2026-11-13T10:00:00Z"})
        result = self.client.post("/search", headers=self.headers,
                                  json={"ownerId": "owner-a", "astronautId": "personal", "query": "Alpha"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(result.json()["matches"]), 1)
        required = {condition.key: condition.match.value for condition in self.qdrant.last_filter.must}
        self.assertEqual(required, {"owner_id": "owner-a", "astronaut_id": "personal"})
        invalid = self.client.post("/search", headers=self.headers,
                                   json={"ownerId": "owner-a", "astronautId": "unknown", "query": "Alpha"})
        self.assertEqual(invalid.status_code, 422)

    def test_chat_deletion_preserves_diary_and_other_owners_without_loading_the_encoder(self):
        entry_id = str(uuid.uuid4())
        chat_owner = "nasagpt:" + "a" * 64
        owners = (chat_owner, "nasagpt:" + "b" * 64, "diary-owner")
        for owner in owners:
            self.client.post("/upsert", headers=self.headers, json={
                "id": entry_id, "ownerId": owner, "astronautId": "personal", "text": "Synthetic saved note",
                "language": "en", "createdAt": "2026-11-14T10:00:00Z"})
        calls = len(self.embedder.calls)
        payload = {"ownerId": chat_owner, "astronautId": "personal", "ids": [entry_id]}
        self.assertEqual(self.client.post("/forget-chat", json=payload).status_code, 401)
        self.assertEqual(self.client.post("/forget-chat", headers=self.headers, json=payload).json(), {"removed": True})
        self.assertEqual({point.payload["owner_id"] for point in self.qdrant.points.values()}, set(owners[1:]))
        self.assertEqual(len(self.embedder.calls), calls)
        self.assertEqual(self.client.post("/forget-chat", headers=self.headers, json={**payload, "ownerId": "diary-owner"}).status_code, 422)
        self.assertEqual(self.client.post("/forget-chat", headers=self.headers, json={**payload, "astronautId": "jessica-meir"}).status_code, 422)

    def test_urdu_text_is_indexed_without_being_translated_or_enabling_generation(self):
        text = "یہ ایک محفوظ مشاہدہ ہے۔"
        response = self.client.post("/upsert", headers=self.headers, json={
            "id": str(uuid.uuid4()), "ownerId": "nasagpt:owner-a", "astronautId": "personal",
            "text": text, "language": "ur", "createdAt": "2026-11-13T10:00:00Z"})
        self.assertEqual(response.status_code, 200)
        point = next(iter(self.qdrant.points.values()))
        self.assertEqual(point.payload["text"], text)
        self.assertEqual(point.payload["language"], "ur")
        self.assertIn(text, self.embedder.calls[0][0][0])
        self.assertEqual(self.client.post("/answer", headers=self.headers, json={
            "ownerId": "nasagpt:owner-a", "astronautId": "personal", "query": text,
            "language": "ur"}).status_code, 503)


class ExportTests(unittest.TestCase):
    def test_export_preserves_text_tensors_and_removes_other_encoders(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / "export"
            result = exporter.export_text_model(fixture_model(root), destination)
            service.verify_model(destination)
            self.assertEqual(result["tensorCount"], 1)
            config = json.loads((destination / "config.json").read_text(encoding="utf-8"))
            self.assertIsNone(config["audio_config"])
            self.assertIsNone(config["vision_config"])
            with (destination / "model.safetensors").open("rb") as handle:
                header = json.loads(handle.read(struct.unpack("<Q", handle.read(8))[0]))
                self.assertEqual(set(header), {"__metadata__", "language_model.weight"})
                self.assertEqual(handle.read(), b"TEXT")
            with self.assertRaisesRegex(ValueError, "already exists"):
                exporter.export_text_model(root / "source", destination)

    def test_wrong_revision_and_failed_export_leave_no_partial_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = fixture_model(root)
            (source / "tokenizer.json").unlink()
            with self.assertRaisesRegex(ValueError, "missing"):
                exporter.export_text_model(source, root / "export")
            self.assertFalse((root / "export").exists())
            self.assertEqual(list(root.glob(".*partial*")), [])
            metadata = source / ".cache/huggingface/download/config.json.metadata"
            metadata.write_text("wrong-revision\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "revision"):
                exporter.export_text_model(source, root / "export")

    def test_hosted_startup_rejects_tampered_model_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / "export"
            exporter.export_text_model(fixture_model(root), destination)
            (destination / "model.safetensors").write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "SHA256"):
                service.verify_model(destination)


class LifespanTests(unittest.TestCase):
    def tearDown(self):
        service.runtime.clear()

    def test_hosted_service_loads_only_cpu_text_and_closes_qdrant(self):
        settings = service.Settings.from_env({"MEMORY_API_KEY": KEY, "QDRANT_API_KEY": "internal-test-key"})
        qdrant = MemoryQdrant()
        factory = Mock(side_effect=Embedder)
        torch = types.SimpleNamespace(float32="float32", set_num_threads=Mock())
        sentence_transformers = types.SimpleNamespace(SentenceTransformer=factory)

        async def run():
            async with service.lifespan(service.app):
                self.assertNotIn("llm", service.runtime)
                self.assertEqual(service.runtime["embedder"].max_seq_length, 1024)

        with patch.object(service.Settings, "from_env", return_value=settings), patch.object(service, "verify_model"), \
             patch.object(service, "QdrantClient", return_value=qdrant) as client, \
             patch.dict(sys.modules, {"torch": torch, "sentence_transformers": sentence_transformers, "mlx_lm": None}):
            asyncio.run(run())
        client.assert_called_once_with(url=settings.qdrant_url, api_key="internal-test-key", timeout=15)
        self.assertEqual(factory.call_args.kwargs["config_kwargs"], {"vision_config": None, "audio_config": None})
        self.assertEqual(factory.call_args.kwargs["model_kwargs"], {"torch_dtype": "float32"})
        self.assertTrue(qdrant.closed)
        self.assertFalse(service.runtime)

    def test_existing_collection_with_wrong_dimensions_fails_closed(self):
        settings = service.Settings.from_env({"MEMORY_API_KEY": KEY})
        qdrant = MemoryQdrant(size=256)
        factory = Mock(side_effect=Embedder)

        async def run():
            async with service.lifespan(service.app):
                self.fail("Mismatched collection became ready")

        with patch.object(service.Settings, "from_env", return_value=settings), patch.object(service, "verify_model"), \
             patch.object(service, "QdrantClient", return_value=qdrant), \
             patch.dict(sys.modules, {"torch": types.SimpleNamespace(), "sentence_transformers": types.SimpleNamespace(SentenceTransformer=factory)}):
            with self.assertRaisesRegex(ValueError, "768-dimensional"):
                asyncio.run(run())
        factory.assert_not_called()
        self.assertTrue(qdrant.closed)


if __name__ == "__main__":
    unittest.main(verbosity=2)
