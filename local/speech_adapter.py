"""Заглушка распознавания речи для локального изолированного контура."""

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def transcribe_audio(payload, content_type):
    """Передает звуковую дорожку подключаемой локальной модели.

    Parameters
    ----------
    payload : bytes
        Тело multipart-запроса с полями file, model и response_format.
    content_type : str
        Тип содержимого с границей multipart.

    Returns
    -------
    str
        Распознанный текст после подключения локальной модели.
    """
    raise NotImplementedError("local_model_not_connected")


class SpeechHandler(BaseHTTPRequestHandler):
    """Обрабатывает только локальные запросы без внешних сетевых обращений."""

    def reply(self, status, value):
        """Возвращает JSON без кеширования."""
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        """Сообщает, что адаптер запущен, а локальная модель еще не подключена."""
        self.reply(200 if self.path == "/health" else 404,
                   {"adapter": "local", "modelConnected": False} if self.path == "/health" else {"error": "not_found"})

    def do_POST(self):
        """Принимает контракт транскрибации и явно сообщает о незаполненной заглушке."""
        if self.path != "/v1/audio/transcriptions":
            self.reply(404, {"error": "not_found"})
            return
        key = os.environ.get("LOCAL_SPEECH_KEY", "")
        if key and not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + key):
            self.reply(401, {"error": "unauthorized"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length < 44 or length > 8 * 1024 * 1024 + 65536:
            self.reply(413, {"error": "invalid_size"})
            return
        payload = self.rfile.read(length)
        try:
            value = transcribe_audio(payload, self.headers.get("Content-Type", ""))
        except NotImplementedError:
            self.reply(503, {"error": "local_model_not_connected"})
            return
        self.reply(200, {"text": value})

    def log_message(self, format, *args):
        """Выводит только адрес маршрута и код, без звука и содержимого запроса."""
        print(format % args, flush=True)


if __name__ == "__main__":
    print("Локальный адаптер: http://127.0.0.1:8092. Модель пока не подключена.", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8092), SpeechHandler).serve_forever()
