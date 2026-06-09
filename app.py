from __future__ import annotations

import argparse
import errno
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "docs"
FALLBACK_PORTS = (8765, 5500, 9000, 8080)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the archaeology quiz website locally.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to.")
    parser.add_argument("--port", default=8000, type=int, help="Port to bind to.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not WEB_DIR.exists():
        raise SystemExit("Missing docs directory. Run the cleaner/setup first.")

    handler = partial(SimpleHTTPRequestHandler, directory=str(WEB_DIR))
    ports_to_try = [args.port] + [port for port in FALLBACK_PORTS if port != args.port]
    server = None

    for port in ports_to_try:
        try:
            server = ThreadingHTTPServer((args.host, port), handler)
            args.port = port
            break
        except PermissionError:
            continue
        except OSError as exc:
            if exc.errno in {errno.EACCES, errno.EADDRINUSE}:
                continue
            raise

    if server is None:
        tried_ports = ", ".join(str(port) for port in ports_to_try)
        raise SystemExit(f"Unable to bind a local port. Tried: {tried_ports}")

    print(f"Quiz site running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
