# Data provider review, 3 November 2026

Understat stopped responding on 2 November 2026. This review covers how to replace its xG and whether to consolidate our other data sources. It also covers which providers would let us add Portugal, Belgium, Turkey and Switzerland. Nothing here changes code, defaults or `calibrated_weights.json`.

## Summary

- **Understat is down and the site is degrading silently.** The 3 November refresh used stale Understat caches from 1 November for all five leagues, so last weekend's matches have no xG. The run still reported success.
- **The quickest fix is a source we already use.** ESPN's core API (`sports.core.api.espn.com`) carries team xG for every big-five match of 2026/27, so far 297 of 297. It needs no key. We already call it for Champions League xG. It agrees closely with Understat: correlation is 0.94 per team-game and 0.97 for season averages. ESPN reads about 0.18 xG per team-game lower.
- **ESPN has no xG history.** Domestic xG starts in August 2026. Earlier seasons must come from the complete Understat archive, 2014/15 to 1 November 2026, which is still in the local and CI HTTP caches. Commit that archive before the caches expire.
- **The two suggested APIs:**
  - **Bzzoiro (BSD)** is the only free source found with xG for Portugal, Belgium, Turkey, Switzerland, the Netherlands and Scotland. It is not reliable enough to become our single provider.
  - **PitchAPI** should not be used. Its operator is anonymous, it has no terms, and its schema is a FotMob feed field for field. FotMob's terms prohibit that use.
- **Consolidation:** ESPN plus football-data.org can cover the five leagues and Europe without Understat, cutting us to two core providers. New leagues can launch on results and Elo first (no xG). Bzzoiro xG can be added after a trial.

## What Understat feeds today

| Use | Code | Effect of the outage |
| --- | --- | --- |
| Team xG strengths in the domestic blend | `src/standing_prediction/xg.py` (`getLeagueData`) | Stale cache: no xG for matches after 1 Nov; strengths drift toward goals-only |
| Domestic xG in the Champions League strength fit | `champions_league/data.py` via `load_season_xg` | Same |
| Calibration datasets and backtests | `forecast_calibration` (dataset, replay, miss reports) | Past seasons are cached; a cold cache would fail |
| Match-page shot maps and xG timelines | `scripts/fetch_match_events.py`, `archive_understat_shots.py`, `site/assets/match.js` | No new shot maps |
| Player minutes for squad usage | `scripts/fetch_understat_rosters.py`, `lineup_usage.py` | No new minutes |

`cached_get(..., stale_if_error=True)` keeps forecasts running, but it hides the gap. `xg_coverage` reports the newer matches as unmatched, and nothing alerts on that.

## Our current providers

| Provider | Used for | Access | Leagues |
| --- | --- | --- | --- |
| football-data.org | Fixtures, kickoffs, statuses, results (backbone) | Free key, 10 calls/min | Free: PL, PD, BL1, SA, FL1, CL, **Portugal, Netherlands**, Championship, Brazil, WC, EC. Belgium, Turkey, Switzerland, Scotland are paid (€49+/mo) |
| Understat | xG, shots, player minutes | Unofficial, **down** | Big five (+ Russia) |
| ESPN site + core API | UCL/EL/ECL xG, match events, box scores, EL/ECL results | Unofficial, no key | All of ours; also Portugal, Belgium, Turkey, Netherlands, Scotland (results only, no xG). Switzerland's feed is stuck on 2025/26 |
| UEFA (match, matchstats, comp APIs) | UCL match stats, lineups, coefficients | Unofficial, no key | UEFA only |
| football-data.co.uk | Historical results and pre-closing odds for calibration and backtests; domestic results for European clubs | Free CSV | Big five + P1, N1, B1, T1, G1, SC0, Switzerland (`new/SWZ.csv`) and more |
| The Odds API | Live odds archive | Key, 500 credits/mo free | All of ours plus `soccer_portugal_primeira_liga`, `soccer_belgium_first_div`, `soccer_turkey_super_league`, `soccer_switzerland_superleague`, `soccer_netherlands_eredivisie`, `soccer_spl` |
| openfootball (GitHub) | EL/ECL 2024/25, Czech league | Free, pinned commits | Several |
| nikeliga.sk, upl.ua, pfl.az | Domestic results for Slovak, Ukrainian, Azerbaijani clubs | Unofficial | One league each |
| EA FC dataset (GitHub) | Player ratings | Pinned file | n/a |

## ESPN as the Understat replacement

Checked on 3 November 2026 against the cached Understat 2026/27 data, which runs to 1 November:

| League | Matches | Matched | ESPN − Understat per team-game | Corr. (team-game) | Corr. (goal difference) | Corr. (team season average) |
| --- | --- | --- | --- | --- | --- | --- |
| Premier League | 60 | 60 | −0.17 | 0.926 | 0.929 | 0.914 |
| La Liga | 78 | 78 | −0.17 | 0.937 | 0.967 | 0.993 |
| Bundesliga | 45 | 40 | −0.23 | 0.916 | 0.920 | 0.978 |
| Serie A | 60 | 60 | −0.24 | 0.939 | 0.945 | 0.969 |
| Ligue 1 | 54 | 48 | −0.11 | 0.960 | 0.945 | 0.983 |
| All | 297 | 286 | −0.18 | 0.935 | 0.946 | 0.973 |

ESPN had all 297 matches. The 11 unmatched rows (RB Leipzig and Rennes) came from the quick name matcher used for this check, not from missing data.

**Coverage depth** (`expectedGoals` in `/competitors/{id}/statistics`):

- **Big five:** none for 2024/25 or 2025/26 (sampled March 2025, November 2025, February, April and May 2026). Present every sampled date from 23 August 2026.
- **UCL, EL, ECL:** present for the 2026/27 rounds. The UCL also has the May 2026 final.
- **Portugal, Belgium, Turkey, Netherlands, Scotland:** no xG.
- **Switzerland:** ESPN has no 2026/27 data at all.

**What switching involves:**

1. **Freeze the Understat archive.** Commit team-level xG (league, season, date, teams, score, home/away xG, Understat id) for 2014/15 to 1 Nov 2026. That is about 4,700 rows per league, a few hundred KB. Read it before any network call, so calibration and backtests no longer depend on the cache.
2. **Add an ESPN xG fetcher for the five leagues.** Reuse the scoreboard → event → competitor-statistics path in `scripts/fetch_ucl_xg.py`. That is two calls per match, plus one scoreboard call per match day. Join on kickoff date, score and team identity, as `attach_xg` already does.
3. **Splice the sources.** Use Understat up to 1 Nov 2026 and ESPN after that. Rescale ESPN to the Understat level per league using the 286-match overlap. That is a ratio of about 1.12, recorded in metadata as an approximation. Without rescaling, recent matches would look lower-scoring to the xG fit. The blend shares the goal model's intercept, which absorbs most of a uniform level shift, but not the change partway through the season.
4. **Keep the availability rule** (ESPN results available three hours after kickoff), and set `XG_PROVIDER` per row so coverage metadata shows the mix.
5. **Check against the saved calibration.** The xG weight and scale were tuned on Understat. Compare the 2026/27 forecasts on Understat-only and spliced inputs before trusting it. The scale does not need refitting while ESPN's spread matches Understat's (goal-difference correlation 0.95).
6. **Alert on staleness.** Fail the xG step, or show a warning on the site, when the newest xG-bearing match is more than a few days older than the newest result.

**Not covered by ESPN:**

- **Shot maps** for match pages: ESPN gives per-player xG but no shot coordinates.
- **Understat-style player minutes:** derive these from ESPN rosters and substitution events instead.

Until another shot source exists, match pages can show team xG without the chance map.

**Risks:**

- ESPN's API is unofficial and undocumented, like Understat's. It has been stable for us since October.
- ESPN doesn't name its xG provider. Its values run lower than Understat's, which fits Opta-style models.

### Implemented, 3 November 2026

**What changed:**

- **[Understat archive](../data/xg/README.md):** Understat xG now comes only from the committed archive; nothing calls Understat.
  - The archive covers 2014/15 to 12 October 2026, the newest saved response; the CI cache with later data can't be exported.
  - Earlier versions retried the dead site for about 90 seconds in each forecast process.
- **ESPN fill:** ESPN team xG fills every finished 2026/27 league game still missing xG.
  - **Join:** kickoff within three hours, same final score, at least one agreeing club name. On 2026/27 results it matched 452 of 452 games. On the 296 games both providers have, it agrees as well as the name-based check above (correlation 0.934).
  - **Scaling:** values are scaled per league to Understat's level (`ESPN_TO_UNDERSTAT`: 1.08 Ligue 1 to 1.17 Serie A) before fitting.
  - **Display:** the site shows ESPN's own numbers, marked `xg_source: "espn"`.
- **Staleness warning:** `refresh_site.sh` warns when finished games more than two days before the latest result still lack xG.

**Forecast impact.** Origin 3 November, 20,000 simulations, seed 7, no odds; the scaled splice (production with Understat down) is compared with the unscaled splice, and the unscaled splice with no ESPN fill at all:

| League | Games with ESPN xG | Unscaled ESPN: max change in title / top four / relegation, pp | Match 1X2 mean / max, pp | No ESPN vs unscaled: max change in title / top four / relegation, pp |
| --- | --- | --- | --- | --- |
| Premier League | 30 | 0.5 / 1.2 / 1.3 | 0.2 / 0.8 | 1.5 / 7.0 / 9.4 |
| La Liga | 31 | 0.1 / 0.6 / 1.4 | 0.2 / 1.2 | 0.5 / 2.9 / 9.6 |
| Bundesliga | 27 | 0.3 / 0.7 / 1.9 | 0.3 / 1.2 | 2.9 / 10.7 / 18.6 |
| Serie A | 40 | 0.3 / 1.1 / 1.9 | 0.3 / 1.5 | 5.0 / 6.8 / 12.7 |
| Ligue 1 | 28 | 0.1 / 0.5 / 0.7 | 0.1 / 0.3 | 0.6 / 6.4 / 14.0 |

**Reading the table:**

- **Leaving the gap without xG is not neutral.** It moves relegation chances by up to 19 points.
- **Scaling is small but systematic.** It keeps the fit on the scale `xg_weight` and `xg_scale` were calibrated on.

**Not verified:** the scaled splice has no historical evaluation. ESPN has no domestic xG before 2026/27, so no backtest can score it. Revisit the ratios once more overlap exists, if Understat returns.

**Not changed:**

- Match-page shot maps, Understat player minutes and club profiles still need Understat. Recent games show team xG without the chance map.
- Calibration and `calibrated_weights.json` are unchanged.

## The two suggested APIs

### Bzzoiro Sports Data (sports.bzzoiro.com)

- **Who runs it:** Bzzoiro LLC (New Mexico). It launched on Product Hunt in February 2026 with one founder, and also covers six other sports.
- **Football coverage** (its coverage page): 90 competitions. Matches 2026/27 marked "Full" have xG and shot maps.
  - **Full:** all big five, Belgium Pro League, Liga Portugal, Süper Lig, Swiss Super League, Eredivisie, Scottish Premiership and the UCL.
  - **Partial:** the EL and ECL ("Basic", shot maps on about 40% of matches). UCL shot maps are on 63%.
- **Data:**
  - Fixtures, results and statuses.
  - Team xG with first- and second-half splits, and a shot map with xG and xGOT.
  - Lineups (confirmed and predicted), player minutes and ratings.
  - Standings and consensus pre-match odds (with closing lines only recently).
  - Its own match predictions.
- **xG source:** an unnamed upstream "shot feed". The field names (`gm`, `gml`, `sit`, `body`, momentum, average positions) look like a Sofascore-style feed. Where upstream has no xG, BSD fills in its own model and sets `xg_estimated: true`. "Just under half" of matches with a shot map carry some BSD-estimated xG. Several smaller leagues have none measured.
- **History:** not documented. Lineups cover 69% of 2025 matches and almost none before 2022. Expect one to two seasons of xG, which needs checking with a key.
- **Free tier:** 7,500 requests/day and 25/s burst, no card. "Football Unlimited" is $5/mo and adds per-bookmaker odds.
- **Licence (v4.0, effective 1 Oct 2026):**
  - Allows displaying data on our own websites, plus internal storage, archiving and model training.
  - Derived forecasts are ours to publish, provided the raw data can't be rebuilt from them.
  - Forbids redistributing raw data as a dataset or feed.
  - No attribution required. Liability is capped at $100.
- **Red flags:**
  - The licence went through four versions in a month.
  - The free quota was introduced in August 2026, after "no rate limits" launch claims.
  - Some leagues are listed as donor-funded.
  - Its pages give competition counts of 30+, 60+, 88 and 90.
  - It admits feed disagreements, for example 11% of shot counts.
  - It has betting-promotion links.

**Verdict:** this is the best free xG option for the new leagues, and a possible backup for the big five. It is too young and opaque to be our only provider. Its terms explicitly allow our use, and PitchAPI's don't exist.

### PitchAPI (pitchapi.dev)

- **Who runs it:** anonymous. There is no company, contact, terms of service or licence. The changelog starts on 31 Aug 2026, and the PyPI SDK on 4 Sep 2026.
- **Claims:** 77 leagues ("the big five, second tiers, cups and UEFA") with history back to 2021. It offers shots with xG and xGOT, team xG stats, lineups, player stats, events and momentum. It has no odds and no standings. The league list needs a key, so coverage of Portugal, Belgium, Turkey and Switzerland couldn't be confirmed.
- **Source:** almost certainly FotMob. The shot schema matches FotMob's field for field: `goal_crossed_y/z`, `is_blocked`, `blocked_x/y`, `is_saved_off_line`, `expected_goals_on_target`, event types `AttemptSaved`/`Miss`/`Post`. So do the `top_stats`/`attack`/`defense`/`duels` stat groups and momentum. FotMob's terms prohibit scraping and commercial use without written consent.
- **Contradictions:**
  - The site says "one plan… nothing to upgrade to", but the SDK has `PLAN_UPGRADE_REQUIRED` ("the resource's league is Pro-only") and `SUBSCRIPTION_SUSPENDED`.
  - It claims history from 2021, but 26 leagues were pulled and restored "from the 2024 seasons on", with new IDs.
- **Verdict:** do not adopt. It is the Understat risk again (an unofficial relay that can vanish), plus a licensing problem we can't evaluate.

## Other providers checked

| Provider | xG | Our leagues + new ones | Cost | Notes |
| --- | --- | --- | --- | --- |
| FBref | **Removed** (Jan 2026, Opta ended access) | n/a | Free | Results history only |
| FotMob | Opta xG, shots | Everything | Free site | Terms forbid scraping and commercial use |
| Sofascore | Opta xG, shots | Everything | Free site | No licensed API; same problem |
| API-Football (api-sports) | Some leagues, not confirmed | Everything | Free 100/day, but **only seasons from 4 to 2 years ago** (no current season) | Paid needed for live use; docs blocked automated reading |
| Sportmonks | xG add-on | Everything | Free: Denmark + Scotland only. Starter about €29 (5 leagues), Growth about €99 (30). xG add-on about €19–69 on top | Licensed and stable; prices from third-party reviews |
| TheStatsAPI | Yes | Lists Portugal, Belgium, Turkey | About $50/mo, 7-day trial | Not tested |
| football-data.org paid | No xG | Belgium, Turkey, Switzerland, Scotland on €49+ plans | €49–199/mo | Fixtures only |
| StatsBomb open data | Yes | Selected past competitions | Free | Static, not usable for live forecasts |

No free, licensed, stable source of current-season xG for Portugal, Belgium, Turkey or Switzerland was found. Every free option is either unofficial (ESPN, FotMob, Sofascore), new and opaque (Bzzoiro, PitchAPI), or missing the current season (API-Football free).

## Adding Portugal, Belgium, Turkey and Switzerland

The model already runs without xG: teams without xG keep goal-based strengths. P1, N1, B1, T1, G1 and SC0 are already in the calibration dataset as robustness leagues, with results and odds but no xG. A first version needs no new xG provider.

| Need | Source | Portugal | Belgium | Turkey | Switzerland | Netherlands / Scotland |
| --- | --- | --- | --- | --- | --- | --- |
| Fixtures, kickoffs, live statuses | football-data.org free | ✓ | paid | paid | paid | NL ✓, SCO paid |
| | ESPN (unofficial) | ✓ | ✓ | ✓ | ✗ (stale) | ✓ |
| | Bzzoiro | ✓ | ✓ | ✓ | ✓ | ✓ |
| Results + odds history (calibration) | football-data.co.uk | ✓ | ✓ | ✓ | ✓ (`new/SWZ.csv`) | ✓ |
| Live odds | The Odds API | ✓ | ✓ | ✓ | ✓ | ✓ |
| xG | Bzzoiro (free) / Sportmonks (paid) | ✓ | ✓ | ✓ | ✓ | ✓ |

**League-specific formats:**

- **Belgium:** regular season, then championship and relegation play-offs, with points halved.
- **Switzerland:** 12 clubs, 33 rounds, then a split.
- **Scotland:** split after 33 rounds.

These need simulator changes regardless of the data source.

## Can we cut to one or two providers?

| Option | Providers | Covers | Gives up |
| --- | --- | --- | --- |
| **A. ESPN + football-data.org** (recommended now) | 2 core + the frozen Understat archive | Big five, UCL/EL/ECL xG, results, events; new-league results via ESPN | Shot maps; xG for new leagues; ESPN is unofficial |
| B. Bzzoiro for everything | 1 | Fixtures, xG, shots, lineups, odds, all target leagues | xG history before about 2025; odds history; stability; no data for Slovakia, Ukraine or Azerbaijan clubs; UEFA coefficients |
| C. Sportmonks Growth + xG | 1 paid | Licensed fixtures, xG, lineups, odds across 30 leagues | About €170/mo; still needs football-data.co.uk for odds history |

**Either way, these sources stay:**

- **football-data.co.uk:** calibration and backtest odds history. No other free source has 10+ seasons of pre-closing prices.
- **UEFA:** coefficients and stats specific to the Champions League.
- **Archived odds:** must stay immutable.

The small league sites and openfootball serve the Champions League's connected-league fit. No consolidated provider covers those leagues.

## Recommended plan

1. **Today:**
   - Commit the frozen Understat team-xG archive from the cache.
   - Add the ESPN big-five xG fetcher with a per-league level splice, and validate against the cached overlap.
   - Add a staleness alert.
   - Draw match pages without the shot map when there is no Understat id.
2. **This month:** get a free Bzzoiro key and confirm three things:
   - its xG history depth per league;
   - how often `xg_estimated` is set in the leagues we care about;
   - its agreement with Understat and ESPN on the 2025/26 and 2026/27 overlap.

   If it holds up, use it for new-league xG and as a fallback for shot maps.
3. **New leagues:** start Portugal and the Netherlands on football-data.org; Belgium, Turkey and Switzerland on ESPN or Bzzoiro fixtures plus football-data.co.uk history, all without xG. Add xG once a source passes step 2.
4. **Ignore PitchAPI** unless it publishes terms and a named data source.

## Sources

- Understat outage reports: [fantasy-database PR #16](https://github.com/fantasy-database/fantasy-database.github.io/pull/16), [fpl-agent PR #4](https://github.com/drupadashardesigns/fpl-agent/pull/4); our run 41599378881 logs.
- [Bzzoiro football docs](https://sports.bzzoiro.com/docs/football/), [coverage](https://sports.bzzoiro.com/football-coverage/), [pricing](https://sports.bzzoiro.com/pricing/), [licence v4.0](https://sports.bzzoiro.com/docs/api-license/), [Product Hunt](https://www.producthunt.com/products/bzzoiro-sports-data-bsd).
- [PitchAPI docs](https://pitchapi.dev/), [PyPI SDK 0.1.6](https://pypi.org/project/pitchapi/) (inspected source).
- [FotMob terms](https://www.fotmob.com/tos.txt).
- FBref xG removal: [Ricardo Heredia](https://ricardoheredia.substack.com/p/farewell-fbref-advanced-stats-when), [Liam Henshaw](https://www.liamhenshaw.com/writing/where-to-find-football-data).
- [football-data.org coverage](https://www.football-data.org/coverage) and [pricing](https://www.football-data.org/pricing); [The Odds API sports](https://the-odds-api.com/sports-odds-data/sports-apis.html).
- [Sportmonks xG pricing](https://www.sportmonks.com/blogs/xg-pricing-explained/), [plans](https://www.sportmonks.com/football-api/plans-pricing); [API-Football free seasons](https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football).
- ESPN coverage and the ESPN–Understat comparison: live probes on 3 Nov 2026.
