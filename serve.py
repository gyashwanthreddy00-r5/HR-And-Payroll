"""Local dev server for the payroll app: python serve.py  ->  http://localhost:3000"""
import http.server, os, socketserver

PORT = int(os.environ.get("PORT", 3000))
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
                      ".html": "text/html", ".svg": "image/svg+xml", ".json": "application/json"}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Payroll app running at http://localhost:{PORT}")
    httpd.serve_forever()
