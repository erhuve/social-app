#!/usr/bin/env python3

import argparse
import http.server
import os
from functools import partial
from pathlib import Path
from urllib.parse import unquote, urlsplit


class SPARequestHandler(http.server.SimpleHTTPRequestHandler):
    _serving_app_shell = False

    def _use_app_shell(self) -> bool:
        request_path = unquote(urlsplit(self.path).path)
        requested_file = Path(self.translate_path(request_path))
        accepts_html = "text/html" in self.headers.get("Accept", "")
        return (
            not requested_file.exists()
            and not request_path.startswith(("/assets/", "/static/"))
            and (accepts_html or Path(request_path).suffix == "")
        )

    def send_head(self):
        original_path = self.path
        request_path = urlsplit(self.path).path
        use_app_shell = self._use_app_shell()
        self._serving_app_shell = use_app_shell or request_path in ("/", "/index.html")
        if use_app_shell:
            self.path = "/index.html"
        try:
            return super().send_head()
        finally:
            self.path = original_path
            self._serving_app_shell = False

    def end_headers(self):
        if self._serving_app_shell:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", default="web-build")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    args = parser.parse_args()

    handler = partial(SPARequestHandler, directory=args.directory)
    http.server.ThreadingHTTPServer(("0.0.0.0", args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
