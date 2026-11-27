import argparse
import json
from pathlib import Path
import time


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    try:
        temporary.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description="Fetch finished match detail once, without changing forecasts.")
    parser.add_argument("--src", type=Path, default=Path("out/site"))
    parser.add_argument("--data", type=Path, default=Path("site/data"))
    parser.add_argument("--espn-cache", type=Path, default=Path(".cache/espn/matches"))
    parser.add_argument("--uefa-cache", type=Path, default=Path(".cache/uefa"))
    parser.add_argument("--provider", choices=("all", "espn", "uefa"), default="all")
    args = parser.parse_args()
    if args.provider in ("all", "espn"):
        from fetch_espn_events import fetch_espn_events
        fetch_espn_events(args.src, args.data, args.espn_cache)

    if args.provider in ("all", "uefa"):
        from fetch_uefa_events import fetch_uefa_events
        if args.provider == "all":
            time.sleep(1)
        fetch_uefa_events(args.src, args.data, args.uefa_cache)


if __name__ == "__main__":
    main()
