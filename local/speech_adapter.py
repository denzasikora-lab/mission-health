"""Speech recognition stub for an isolated local environment."""

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def transcribe_audio(payload, content_type):
    """Pass the audio track to a connected local model.

    Parameters
    ----------
    payload : bytes
        Body multipart-request with fields file, model and response_format.
    content_type : str
        Content type with boundary multipart.

    Returns
    -------
    str
        Recognized text after connecting a local model.
    """
    raise NotImplementedError("local_model_not_connected")


class SpeechHandler(BaseHTTPRequestHandler):
    """Handle local requests only without external network calls."""

    def reply(self, status, value):
        """Return JSON without caching."""
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        """Report, that the adapter has started, but the local model is not yet connected."""
        self.reply(200 if self.path == "/health" else 404,
                   {"adapter": "local", "modelConnected": False} if self.path == "/health" else {"error": "not_found"})

    def do_POST(self):
        """Accept the transcription contract and explicitly report the unconfigured stub."""
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
        """Log only the route and status code, without audio or request contents."""
        print(format % args, flush=True)


if __name__ == "__main__":
    print("Local adapter: http://127.0.0.1:8092. No model connected yet.", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8092), SpeechHandler).serve_forever()
