import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("activation", Path(__file__).resolve().parents[1] / "deploy/t4/activate_https.py")
activation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(activation)
CONFIG = """server {
 server_name app.fereyappfuturewinterworkbookgrace.store;
 location / { proxy_pass http://localhost:60000; }
 listen 443 ssl;
 ssl_certificate /existing/fullchain.pem;
 ssl_certificate_key /existing/privkey.pem;
}
server {
 listen 80;
 server_name app.fereyappfuturewinterworkbookgrace.store;
 return 301 https://$host$request_uri;
}
"""


class ActivationTests(unittest.TestCase):
    def test_route_preserves_existing_app_tls_and_http(self):
        result = activation.candidate(CONFIG)
        self.assertEqual(result.count("location ^~ /mission-health-memory/"), 1)
        self.assertEqual(result.replace(activation.ROUTE, ""), CONFIG)
        self.assertIn("proxy_pass http://127.0.0.1:8091/;", result)
        self.assertIn("proxy_set_header Authorization $http_authorization;", result)
        self.assertLess(result.index("location ^~"), result.index("listen 80;"))

    def test_ambiguous_or_existing_routes_are_rejected(self):
        for source in (CONFIG + CONFIG, CONFIG.replace("443 ssl", "444 ssl"), activation.candidate(CONFIG)):
            with self.subTest(source=source[:30]), self.assertRaises(ValueError):
                activation.candidate(source)

    def check_rollback(self, failure):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "app"
            target.write_text(CONFIG, encoding="utf-8")
            backup = Path(directory) / "backups"
            original = target.read_bytes()
            error = subprocess.CalledProcessError(1, "nginx")
            effects = [error, None, None] if failure == "validation" else [None, error, None, None]
            with patch.object(activation, "TARGET", target), patch.object(activation, "BACKUPS", backup), patch.object(activation.subprocess, "run", side_effect=effects):
                with self.assertRaises(subprocess.CalledProcessError):
                    activation.apply_change(original, activation.candidate(CONFIG).encode("utf-8"))
            self.assertEqual(target.read_bytes(), original)
            self.assertEqual(next(backup.glob('nginx-app-*')).read_bytes(), original)

    def test_nginx_validation_failure_restores_original(self):
        self.check_rollback("validation")

    def test_nginx_reload_failure_restores_original(self):
        self.check_rollback("reload")

    def test_concurrent_edit_is_never_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "app"
            edited = CONFIG + "\n# concurrent edit\n"
            target.write_text(edited, encoding="utf-8")
            with patch.object(activation, "TARGET", target), patch.object(activation, "BACKUPS", Path(directory) / "backups"), patch.object(activation.subprocess, "run") as run:
                with self.assertRaises(ValueError):
                    activation.apply_change(CONFIG.encode("utf-8"), activation.candidate(CONFIG).encode("utf-8"))
            self.assertEqual(target.read_text(encoding="utf-8"), edited)
            run.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
