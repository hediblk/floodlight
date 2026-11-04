import argparse
import gzip
import io
from pathlib import Path

from standing_prediction.utils import cached_get
from standing_prediction.xg import COMPETITION_TO_UNDERSTAT_LEAGUE, UNDERSTAT_ARCHIVE, UNDERSTAT_BASE, understat_frame, understat_rows


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description="Archive Understat league xG from cached getLeagueData responses, without network access.")
    parser.add_argument("--seasons", nargs="+", type=int, required=True)
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache/understat")
    parser.add_argument("--out", type=Path, default=UNDERSTAT_ARCHIVE)
    args = parser.parse_args()
    for league in COMPETITION_TO_UNDERSTAT_LEAGUE.values():
        for season in args.seasons:
            # max_age=None reads the cached response whatever its age; a missing entry would need the network.
            content = cached_get(f"{UNDERSTAT_BASE}/getLeagueData/{league}/{season}", cache_dir=args.cache, max_age=None,
                                 timeout=1)
            frame = understat_frame(understat_rows(content))
            text = io.StringIO()
            frame.assign(utcDate=frame["utcDate"].dt.strftime("%Y-%m-%d %H:%M:%S")).to_csv(text, index=False, lineterminator="\n")
            path = args.out / league / f"{season}.csv.gz"
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0, filename="") as handle:
                handle.write(text.getvalue().encode())
            print(f"{league} {season}: {len(frame)} matches, results through {frame['utcDate'].max().date()}")


if __name__ == "__main__":
    main()
