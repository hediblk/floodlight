# Understat league xG archive

Team xG for every completed match in the five domestic leagues, from [Understat](https://understat.com/)'s `getLeagueData`, saved so forecasts, calibration and backtests no longer need Understat for past seasons. One gzip CSV per league and season start year: `<league>/<season>.csv.gz`, with Understat's league names (`EPL`, `La_liga`, `Bundesliga`, `Serie_A`, `Ligue_1`).

Columns: `understat_id`, `utcDate` (provider kickoff, UTC), `homeTeam`, `awayTeam` (Understat names), `homeGoals`, `awayGoals`, `home_xg`, `away_xg`. Values are Understat's, parsed as numbers. Output is deterministic gzip.

`standing_prediction.xg.fetch_understat_matches` reads only these files and never calls Understat, which has been offline since 2 November 2026; ESPN fills later games (see the [README](../../README.md#data-quirks)).

Archived on 3 November 2026 from saved responses: 2014/15–2025/26 complete, and 2026/27 through 12 October 2026 (the latest saved response). If Understat comes back, fetch the season into the cache and rewrite its file:

```bash
PYTHONDONTWRITEBYTECODE=1 python scripts/archive_understat_xg.py --seasons 2026 --cache .cache/understat
```

The script reads saved responses only (`max_age=None`), so fetch `https://understat.com/getLeagueData/<league>/<season>` into `.cache/understat` first.
