import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

from serve_web_spa import SPARequestHandler


class SPARequestHandlerTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        (root / "index.html").write_text("app shell")
        (root / "assets").mkdir()
        (root / "assets" / "app.js").write_text("bundle")
        (root / ".well-known").mkdir()
        (root / ".well-known" / "security.txt").write_text("security contact")
        self.fallback = tempfile.TemporaryDirectory()
        fallback_root = Path(self.fallback.name)
        (fallback_root / "assets").mkdir()
        (fallback_root / "assets" / "prior.js").write_text("prior bundle")
        handler = partial(
            SPARequestHandler,
            directory=root,
            fallback_directory=fallback_root,
        )
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()
        self.fallback.cleanup()

    def request(self, path, accept="*/*"):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.server.server_port}{path}",
            headers={"Accept": accept},
        )
        return urllib.request.urlopen(request)

    def test_deep_link_returns_app_shell(self):
        with self.request("/profile/agnoster.net/post/3mqubzdvkdc2a") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers["Cache-Control"], "no-cache")
            self.assertEqual(response.read(), b"app shell")

    def test_home_app_shell_requires_revalidation(self):
        with self.request("/") as response:
            self.assertEqual(response.headers["Cache-Control"], "no-cache")

    def test_dotted_profile_handle_returns_app_shell_for_navigation(self):
        with self.request("/profile/agnoster.net", "text/html") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), b"app shell")

    def test_existing_asset_is_served(self):
        with self.request("/assets/app.js") as response:
            self.assertEqual(response.read(), b"bundle")

    def test_prior_release_asset_is_available_during_switch(self):
        with self.request("/assets/prior.js") as response:
            self.assertEqual(response.read(), b"prior bundle")

    def test_fallback_directory_is_snapshotted_before_asset_lookup(self):
        with tempfile.TemporaryDirectory() as link_directory:
            fallback_link = Path(link_directory) / "previous"
            fallback_link.symlink_to(self.fallback.name, target_is_directory=True)
            current_root = Path(self.directory.name)

            class SwitchingHandler(SPARequestHandler):
                def _use_fallback_asset(handler_self):
                    result = super()._use_fallback_asset()
                    if result:
                        fallback_link.unlink()
                        fallback_link.symlink_to(current_root, target_is_directory=True)
                    return result

            handler = partial(
                SwitchingHandler,
                directory=current_root,
                fallback_directory=fallback_link,
            )
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{server.server_port}/assets/prior.js"
                ) as response:
                    self.assertEqual(response.read(), b"prior bundle")
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

    def test_security_policy_is_served_as_a_static_file(self):
        with self.request("/.well-known/security.txt", "text/plain") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), b"security contact")

    def test_missing_asset_remains_404(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request("/assets/missing.js")
        self.assertEqual(error.exception.code, 404)

    def test_missing_static_bundle_remains_404(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request("/static/js/missing.js", "text/html")
        self.assertEqual(error.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
