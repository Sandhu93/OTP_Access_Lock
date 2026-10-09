"""Small local-only HTTPS edge proxy for the physical demo.

The production deployment must use a maintained reverse proxy/load balancer. This process exists
only so the local stack can reuse the already-built Python image when Docker Hub is unavailable.
It terminates TLS and forwards HTTP to private Docker services; it never makes authorization or
actuation decisions.
"""

import http.client
import os
import ssl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 443
CERT_FILE = "/edge-certs/server.crt"
KEY_FILE = "/edge-certs/server.key"


def upstream_for(path: str) -> tuple[str, int]:
    if path == "/api" or path.startswith("/api/"):
        return "api", 8000
    if (
        path.startswith("/realms/")
        or path.startswith("/resources/")
        or path.startswith("/admin/")
        or path.startswith("/js/")
        or path == "/robots.txt"
    ):
        return "keycloak", 8080
    return "dashboard", 3000


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):  # noqa: N802
        self.forward()

    def do_HEAD(self):  # noqa: N802
        self.forward()

    def do_POST(self):  # noqa: N802
        self.forward()

    def do_PUT(self):  # noqa: N802
        self.forward()

    def do_PATCH(self):  # noqa: N802
        self.forward()

    def do_DELETE(self):  # noqa: N802
        self.forward()

    def forward(self):
        host, port = upstream_for(self.path.split("?", 1)[0])
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else None
        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in {"host", "connection", "keep-alive", "proxy-connection", "transfer-encoding"}
        }
        headers["Host"] = self.headers.get("Host", os.environ.get("DEMO_PUBLIC_HOST", "localhost"))
        headers["X-Forwarded-Proto"] = "https"
        headers["X-Forwarded-Host"] = headers["Host"]
        headers["X-Forwarded-For"] = self.client_address[0]
        connection = http.client.HTTPConnection(host, port, timeout=30)
        try:
            connection.request(self.command, self.path, body=body, headers=headers)
            response = connection.getresponse()
            payload = response.read()
            self.send_response(response.status, response.reason)
            for key, value in response.getheaders():
                if key.lower() not in {"connection", "keep-alive", "transfer-encoding", "content-length"}:
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Connection", "close")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
        except Exception as error:  # fail closed for the client; do not expose internals
            self.send_error(502, "Upstream unavailable")
            print(f"edge upstream error: {type(error).__name__}", flush=True)
        finally:
            connection.close()

    def log_message(self, format, *args):
        print(f"edge {self.client_address[0]} {format % args}", flush=True)


def main():
    if not (os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE)):
        raise SystemExit("local HTTPS certificate is missing; run scripts/prepare-local-https.ps1")
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), ProxyHandler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(CERT_FILE, KEY_FILE)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    print("local HTTPS edge listening on 0.0.0.0:443", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
