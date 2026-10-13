"""Command line entry point: ``kuru serve`` and ``kuru migrate``."""

from __future__ import annotations

import argparse


def main(argv: list[str] | None = None) -> None:
    """Run the Kuru CLI."""
    parser = argparse.ArgumentParser(prog="kuru", description="Kuru backend")
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="Run the API server")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--reload", action="store_true")

    sub.add_parser("migrate", help="Apply database migrations")

    args = parser.parse_args(argv)
    if args.command == "serve":
        import uvicorn

        uvicorn.run("kuru.main:app", host=args.host, port=args.port, reload=args.reload)
    elif args.command == "migrate":
        from kuru.db.migrate import upgrade

        upgrade()
