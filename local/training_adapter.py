"""Выполнять локальные задания LoRA без внешней передачи записей."""

import hashlib
import hmac
import importlib.util
import json
import os
import re
import subprocess
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "local/models/journal-assistant"
JOBS = ROOT / "local/runtime/training"
LOCK = threading.RLock()
PROCESSES = {}
STATES = {}
KEY = os.environ.get("TRAINING_KEY", "")
STEPS = 200
ENGINE = os.environ.get("TRAINING_ENGINE", "mlx")
MINIMUM = 1 if ENGINE == "peft" else 20


def save_state(folder, state):
    """Атомарно сохранить состояние задания в закрытом каталоге."""
    target = folder / "state.json"
    temporary = folder / "state.tmp"
    temporary.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    temporary.replace(target)


def ready():
    """Проверить локальную модель и библиотеки без загрузки весов."""
    packages = ("torch", "peft", "transformers") if ENGINE == "peft" else ("mlx_lm",)
    return (MODEL / "config.json").exists() and all(importlib.util.find_spec(name) is not None for name in packages)


def training_command(folder):
    """Сформировать команду обучения без исполнения пользовательского текста.

    Parameters
    ----------
    folder : Path
        Закрытый каталог задания с подготовленными данными.

    Returns
    -------
    list[str]
        Аргументы процесса с локальными путями.
    """
    if ENGINE == "peft":
        return [sys.executable, "-u", str(ROOT / "local/train_peft.py"),
                "--model", str(MODEL), "--job", str(folder)]
    return [sys.executable, "-u", "-m", "mlx_lm.lora", "--model", str(MODEL),
            "--data", str(folder / "data"), "--train", "--fine-tune-type", "lora",
            "--adapter-path", str(folder / "adapter"), "--iters", str(STEPS),
            "--batch-size", "1", "--num-layers", "8", "--learning-rate", "0.00001",
            "--steps-per-report", "1", "--steps-per-eval", "20", "--val-batches", "1",
            "--save-every", "20", "--max-seq-length", "512", "--mask-prompt"]


def execute(folder, state):
    """Обучить адаптер и сохранить фактический прогресс процесса."""
    environment = dict(os.environ, HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1",
                       WANDB_MODE="disabled", HF_HUB_DISABLE_TELEMETRY="1",
                       PYTHONIOENCODING="utf-8")
    try:
        with LOCK:
            if state["status"] == "cancelled":
                return
            process = subprocess.Popen(training_command(folder), stdout=subprocess.PIPE,
                                       stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                                       errors="replace", env=environment, cwd=ROOT)
            PROCESSES[state["id"]] = process
            state["status"] = "running"
            save_state(folder, state)
        with (folder / "training.log").open("w", encoding="utf-8") as log:
            for line in process.stdout:
                log.write(line)
                log.flush()
                match = re.search(r"Iter\s+(\d+):.*?Train loss\s+([0-9.]+)", line)
                if match:
                    with LOCK:
                        state.update(step=min(STEPS, int(match[1])), loss=float(match[2]))
                        save_state(folder, state)
        code = process.wait()
        with LOCK:
            if state["status"] != "cancelled":
                complete = code == 0 and (folder / ("adapter/adapter_model.safetensors" if ENGINE == "peft" else "adapter/adapters.safetensors")).exists()
                state.update(status="completed" if complete else "failed", adapterReady=complete)
                if complete:
                    state["step"] = STEPS
                save_state(folder, state)
    except Exception:
        with LOCK:
            state.update(status="failed", adapterReady=False)
            save_state(folder, state)
    finally:
        with LOCK:
            PROCESSES.pop(state["id"], None)
            STATES.pop(state["id"], None)


class TrainingHandler(BaseHTTPRequestHandler):
    """Принимать задания без автоматического подключения готовых адаптеров."""

    def reply(self, status, body):
        """Вернуть состояние без текста записей и внутренних путей."""
        value = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(value)))
        self.end_headers()
        self.wfile.write(value)

    def authorized(self):
        """Проверить секретный ключ обработчика."""
        if not KEY or not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + KEY):
            self.reply(401, {"error": "unauthorized"})
            return False
        return True

    def do_GET(self):
        """Показать готовность или сохраненное состояние задания."""
        if not self.authorized():
            return
        if self.path == "/health":
            self.reply(200, {"ready": ready(), "steps": STEPS, "minimum": MINIMUM, "model": "SmolLM2-135M / PEFT" if ENGINE == "peft" else "Qwen3 / MLX"})
            return
        match = re.fullmatch(r"/jobs/([a-f0-9-]{36})", self.path)
        if not match:
            self.reply(404, {"error": "not_found"})
            return
        path = JOBS / match[1] / "state.json"
        if not path.exists():
            self.reply(404, {"error": "not_found"})
            return
        state = json.loads(path.read_text(encoding="utf-8"))
        if state["status"] in {"queued", "running"} and state["id"] not in PROCESSES:
            state["status"] = "interrupted"
            save_state(path.parent, state)
        self.reply(200, {key: value for key, value in state.items() if key != "owner"})

    def do_POST(self):
        """Создать задание по запросу или остановить существующий процесс."""
        if not self.authorized():
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length < 2 or length > 3500000:
            self.reply(413, {"error": "invalid_size"})
            return
        try:
            body = json.loads(self.rfile.read(length))
            owner = hashlib.sha256(body["ownerId"].encode("utf-8")).hexdigest()
        except (ValueError, KeyError, TypeError):
            self.reply(400, {"error": "invalid_input"})
            return
        with LOCK:
            cancel = re.fullmatch(r"/jobs/([a-f0-9-]{36})/cancel", self.path)
            if cancel:
                folder = JOBS / cancel[1]
                if not (folder / "state.json").exists():
                    self.reply(404, {"error": "not_found"})
                    return
                state = STATES.get(cancel[1]) or json.loads((folder / "state.json").read_text(encoding="utf-8"))
                if state["owner"] != owner:
                    self.reply(404, {"error": "not_found"})
                    return
                if state["status"] in {"queued", "running"}:
                    state["status"] = "cancelled"
                    process = PROCESSES.get(state["id"])
                    if process:
                        process.terminate()
                    save_state(folder, state)
                self.reply(200, {key: value for key, value in state.items() if key != "owner"})
                return
            entries = body.get("entries")
            try:
                identifier = str(uuid.UUID(body["id"]))
            except (KeyError, ValueError, TypeError):
                self.reply(400, {"error": "invalid_input"})
                return
            if self.path != "/jobs" or not isinstance(entries, list) or not MINIMUM <= len(entries) <= 500 or any(not isinstance(x, str) or not 80 <= len(x) <= 6000 for x in entries):
                self.reply(400, {"error": "invalid_input"})
                return
            folder = JOBS / identifier
            if (folder / "state.json").exists():
                state = json.loads((folder / "state.json").read_text(encoding="utf-8"))
                self.reply(200 if state["owner"] == owner else 409,
                           {"id": identifier} if state["owner"] == owner else {"error": "id_conflict"})
                return
            if not ready() or PROCESSES:
                self.reply(503, {"error": "trainer_not_ready"})
                return
            (folder / "data").mkdir(parents=True, mode=0o700)
            samples = []
            for index, entry in enumerate(entries):
                earlier = "\n".join(text[-200:] for text in entries[max(0, index - 2):index])
                prompt = "Earlier astronaut observations:\n" + (earlier or "Initial observation; no prior record.") + "\nModel the next recorded observation. This is longitudinal behavior research, not a medical prediction."
                samples.append({"messages": [{"role": "user", "content": prompt},
                                              {"role": "assistant", "content": entry}]})
            split = max(1, len(samples) // 10) if len(samples) >= 10 else 0
            for name, rows in (("train", samples[split:]), ("valid", samples[:split])):
                (folder / "data" / (name + ".jsonl")).write_text(
                    "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n", encoding="utf-8")
            prior = []
            if ENGINE == "peft":
                for saved in JOBS.glob("*/state.json"):
                    try:
                        old = json.loads(saved.read_text(encoding="utf-8"))
                        if old.get("owner") == owner and old.get("adapterReady") and old.get("status") == "completed":
                            prior.append((saved.stat().st_mtime, old["id"]))
                    except (OSError, ValueError):
                        continue
            state = {"id": identifier, "owner": owner, "parentId": max(prior)[1] if prior else None, "objective": "observations-next-v1", "status": "queued", "step": 0,
                     "total": STEPS, "loss": None, "adapterReady": False, "validation": "not evaluated" if ENGINE == "peft" else "held-out"}
            save_state(folder, state)
            PROCESSES[identifier] = None
            STATES[identifier] = state
            threading.Thread(target=execute, args=(folder, state), daemon=True).start()
            self.reply(202, {"id": identifier, "status": "queued"})

    def log_message(self, format, *args):
        """Не записывать запросы с личными данными в общий журнал."""
        pass


if __name__ == "__main__":
    os.umask(0o077)
    if not KEY:
        raise SystemExit("Set TRAINING_KEY for the private local handler.")
    JOBS.mkdir(parents=True, exist_ok=True, mode=0o700)
    print("Local handler LoRA: http://127.0.0.1:8093", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8093), TrainingHandler).serve_forever()
