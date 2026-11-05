# What-if matchups: plan and feasibility (5 November 2026)

**Status: built (5 November 2026).** Decisions taken: D1 domestic engine for same-league single games at a club's ground; D2 its own **What if** tab; D3 the 111 site clubs; D4 first-leg score included. Two changes to this plan, at the user's request: the tab opens on a team-select screen (two club panels cycled by league and club, then Kick off), and it adds tweak sliders (each club's attack and defence ±20%, home advantage 0–200% and the shootout split), replacing the "no strength sliders" non-goal below. Any slider off the model's value marks the result "Modified · not a Floodlight forecast". A "Play it" button draws one result from the chances.

## The idea

A page where you pick any two clubs, choose the venue (either club at home, or a neutral ground) and get the model's forecast for that game. A two-leg mode answers "who goes through?", optionally with a first-leg score already entered. Examples: Arsenal v Bayern at the Emirates, the same game at Bayern, the same game on neutral ground, and a two-leg tie between them.

## Verdict: feasible, low risk, two tasks

All of it runs in the browser, it computes instantly with no simulation, and it fits the static site with no new dependencies. Three facts make this cheap:

1. **Every match probability has a closed form.** The goal model (Dixon–Coles) needs only an intercept, a home advantage, `rho` and each club's attack and defence. From those it gives the two expected-goal rates and an 11×11 score grid with the low-score correction. Elo needs each club's rating and three constants (`home_advantage`, `draw_base`, `draw_scale`). The published blend is a fixed log-linear pool of the two (main 0.844, Elo 0.156, from `no_odds_weights` in `calibrated_weights.json`). Published runs use no calibrator (`--calibrate` is off), so the browser can reproduce the exact numbers from a few numbers per club.
2. **Two-leg ties are already solved exactly.** `MatchupCache.tie_probability` in `packages/champions-league/src/champions_league/tournament.py` works like this:
   - Each leg's blended score grid (the goal-model grid rescaled within home win, draw and away win to match the blended 1X2) is turned into a goal-difference distribution.
   - The two legs' distributions are convolved.
   - A level aggregate goes to extra time: a Skellam distribution on one third of the second leg's expected-goal rates.
   - Still level after that, penalties are 50/50.
   - There's no away-goals rule. Finished legs enter as a known goal difference, which is exactly the "first leg already played" case.

   Porting this to JavaScript is about 80 lines.
3. **Neutral venues already exist.** The joint European model's neutral version is the same model with `home_advantage = 0`, and its Elo neutral sets the Elo home advantage to 0 (`JointStrengths.elo_probs`).

## Engines

| Engine | Covers | Use |
| --- | --- | --- |
| Joint European model (`champions-league` package, `JointStrengths`) | Every club in `clubs.json` (111 now: the big five plus the other Champions League clubs) on one scale with league offsets | Any cross-league pair, any neutral game and any two-leg tie |
| Domestic league models (`football-predict`: goal model with xG adjustment, plus Elo) | The 20 or 18 clubs of one league | The numbers the Matches page publishes for league fixtures |

The two engines give different numbers for the same pair, because the domestic models use xG and their own home advantage. The recommendation (**D1**) is:

- Use the domestic engine when both clubs are in the same league and the mode is a single match with a home side, so a real upcoming fixture matches its published forecast.
- Use the joint model for everything else.
- Name the engine under the result.

The alternative is the joint model everywhere. That's simpler, but the same fixture would then show two different numbers on the site.

What-if results are **model only**, with no bookmaker prices for that game. Champions League league levels already include archived prices through the fit (Plan E), but a single what-if game uses no quote. A real knockout tie with archived quotes can therefore differ slightly from the bracket's own figure. Say so in the footer.

## Data export

Add a new site file, `site/data/matchups.json`, of about 15–20 KB. Clubs are keyed by the slugs already used in `clubs.json`.

```json
{
  "generated_at": "…",
  "engines": {
    "europe": {
      "generated_at": "…", "max_goals": 10, "rate_bounds": [0.08, 6.0],
      "intercept": 0.0, "home_advantage": 0.0, "rho": 0.0,
      "elo": {"home_advantage": 0.0, "draw_base": 0.0, "draw_scale": 0.0},
      "weights": {"main": 0.844, "elo": 0.156},
      "clubs": {"arsenal": {"attack": 0.0, "defense": 0.0, "elo": 0.0}}
    },
    "premier-league": { "…same shape, no rate_bounds…": "" }
  },
  "reference": [{"engine": "europe", "home": "arsenal", "away": "bayern", "venue": "home", "p": [0, 0, 0], "tie": 0.0}]
}
```

- **Raw writers.** `football-ucl` writes `cl_matchup_params.json` next to `cl_club_ratings.csv` (from `model.european` and `model.elo`). `football-predict` writes `<prefix>_matchup_params.json` next to `<prefix>_club_ratings.csv` (from the fitted domestic `dc`, `elo` and weights). The domestic `dc` is the one after the xG adjustment, which is the model that produced the published forecasts.
- **Exporter.** `scripts/build_site_data.py` maps identities to slugs and merges the blocks. A competition whose refresh failed keeps its previous block and its original `generated_at`, as the other files do.
- **Reference cases.** The exporter adds a few Python-computed results: three pairs at each venue, plus one two-leg tie with and one without a first-leg score. The browser check asserts that the JavaScript engine reproduces them to 1e-9.
- **Contract.** Update the schema (`schemas/site/data.schema.json`), `validate_site_data.py` and [the site data contract](site-data-contract.md).
- **Guards.** Check that `pair_shift` is empty (H2H weight is 0), and apply `RATE_BOUNDS` only to the joint model (`_BoundedDixonColes`).
- **Timing.** The parameters are the models as of the latest refresh (`as_of`/`generated_at`), so nothing from after the forecast origin leaks in. What-if results are not forecast receipts and are not written to history.

## UI

Placement is decision **D2**. The recommendation is a **What if** tab between Clubs and Model, at route `#whatif`. Shareable links go to `#whatif/<home>/<away>/<mode>[/<first-leg score>]`. Club pages and the match page get a "What if…" link that pre-fills the pair.

Controls follow the existing chip conventions (DESIGN.md, Task 13):

- Two club pickers, searchable and grouped by league, with crests, plus a ⇄ swap button.
- Venue chips: **Home** or **Neutral**. Swap covers away.
- Mode chips: **Single match**, **Two legs**, **Final** (one neutral game with extra time and penalties).
- Two-leg mode only: which club hosts the first leg, and an optional first-leg score (two steppers). With a score entered, the result shows the second leg only.

Results:

- **Single match:** the existing win/draw/loss bar, expected goals, the five likeliest scores, a score grid from 0 to 5 using the `--heat-*` tokens, and over 2.5, both teams to score and clean sheets.
- **Knockout:** each club's chance to go through, split into after 90 or 180 minutes, after extra time and on penalties. Also the aggregate goal-difference distribution and each leg's 1X2.
- **Footer:** the engine used, the model date, "model only, no bookmaker prices", and that a neutral venue means no home advantage.

It needs to work at 375 px and in both themes.

## Limits and non-goals

- No strength sliders and no injury or lineup tweaks: player-level forecasting is closed (ROADMAP item 3).
- Penalties are 50/50, and extra time uses a third of the second leg's rates, matching the tournament simulation.
- Neutral is home advantage zero. Neutral-venue accuracy is untested because there are too few neutral games (Champions League finals).
- Joint-model accuracy: replay log loss of about 0.909 on Champions League games (Plan D). Cross-league games between clubs that rarely meet rest on league offsets, which are least certain for Serie A (ROADMAP item 1).
- Clubs: at first, only the 111 in `clubs.json`, which already have names and crests. The joint model rates clubs from about 40 leagues, but most of them have no crest or display name. That would be a later extension (**D3**).

## Tasks

| Task | Scope | Done when |
| --- | --- | --- |
| T1 Export | Raw parameter writers in both CLIs; exporter merge with retained-block behavior; reference cases; schema, validator, contract | `validate_site_data.py` passes on a full refresh; the reference cases match `JointStrengths`, the domestic forecasts and `tie_probability` |
| T2 Engine | `site/assets/matchup-engine.js`: pure functions for the score grid, Elo, blend, leg difference, convolution, extra time and penalties | `check_site.py` reproduces every reference case to 1e-9 |
| T3 Page | `site/assets/whatif.js`, the tab, the route and links, a DESIGN.md section, `check_site.py` routes for a single game and a two-leg tie | Works on desktop and at 375 px, in light and dark; a permalink restores the state |

T1 merges first. T2 and T3 can be one PR. Each task fits one agent session.

## Decisions for the user

- **D1.** Same-league single games: domestic engine (recommended) or the joint model everywhere?
- **D2.** Its own **What if** tab (recommended) or a sub-view of Clubs?
- **D3.** Only the 111 site clubs (recommended), or every club the joint model rates?
- **D4.** Include the first-leg score input in the first release (recommended: yes, it costs almost nothing)?
