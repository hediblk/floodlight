from __future__ import annotations

import json
import logging
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Dict

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from standing_prediction.utils import cached_get, normalize_team

LOG = logging.getLogger(__name__)
UNDERSTAT_BASE = "https://understat.com"
XG_PROVIDER = "understat"
XG_COLUMNS = ["home_xg", "away_xg"]
# Understat covers these leagues from 2014/15 with post-match, penalty-inclusive shot xG.
COMPETITION_TO_UNDERSTAT_LEAGUE = {
    "PD": "La_liga", "PL": "EPL", "BL1": "Bundesliga", "SA": "Serie_A", "FL1": "Ligue_1",
}
UNDERSTAT_FIRST_SEASON = 2014
UNDERSTAT_COLUMNS = ["understat_id", "utcDate", "homeTeam", "awayTeam", "homeGoals", "awayGoals", *XG_COLUMNS]
# Saved league data (see data/xg/README.md), the only Understat source since it went offline.
UNDERSTAT_ARCHIVE = Path(__file__).resolve().parents[2] / "data" / "xg"
# ESPN publishes team xG for these leagues from 2026/27 and fills matches Understat lacks.
ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer"
ESPN_CORE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues"
COMPETITION_TO_ESPN_LEAGUE = {"PD": "esp.1", "PL": "eng.1", "BL1": "ger.1", "SA": "ita.1", "FL1": "fra.1"}
ESPN_FIRST_SEASON = 2026
# ESPN reads below Understat, so its values are scaled to Understat's level before fitting: mean Understat over
# ESPN team xG on the 296 2026/27 matches both cover (through 12 October 2026). The raw values stay for display.
ESPN_TO_UNDERSTAT = {"PL": 1.117, "PD": 1.117, "BL1": 1.133, "SA": 1.169, "FL1": 1.078}
ESPN_XG_COLUMNS = ["espn_home_xg", "espn_away_xg"]
XG_PROVIDERS = "understat, espn where understat has none"
# Finished matches whose xG is still missing this long before the latest result count as stale.
XG_STALE_AFTER = pd.Timedelta(days=2)


def understat_rows(content):
    return [[match["id"], match["datetime"], match["h"]["title"], match["a"]["title"], match["goals"]["h"],
             match["goals"]["a"], match["xG"]["h"], match["xG"]["a"]]
            for match in json.loads(content).get("dates", []) if match.get("isResult")]


def understat_frame(rows):
    out = pd.DataFrame(rows, columns=UNDERSTAT_COLUMNS)
    out["utcDate"] = pd.to_datetime(out["utcDate"], utc=True, errors="coerce")
    for column in ["homeGoals", "awayGoals", *XG_COLUMNS]:
        out[column] = pd.to_numeric(out[column], errors="coerce")
    return out.sort_values("utcDate").reset_index(drop=True)


def fetch_understat_matches(*, competition, season, archive=UNDERSTAT_ARCHIVE):
    """Completed league matches with Understat xG from the archive; kickoff times are UTC.

    Understat has been unreachable since 2 November 2026, so nothing here touches the network.
    """
    league = COMPETITION_TO_UNDERSTAT_LEAGUE.get(competition)
    if league is None:
        raise ValueError(f"Understat does not cover competition {competition}.")
    if season < UNDERSTAT_FIRST_SEASON:
        raise ValueError(f"Understat xG starts in {UNDERSTAT_FIRST_SEASON}/{UNDERSTAT_FIRST_SEASON + 1 - 2000}.")
    path = Path(archive) / league / f"{season}.csv.gz"
    if not path.exists():
        raise FileNotFoundError(f"No archived Understat xG for {competition} {season}.")
    return understat_frame(pd.read_csv(path, dtype={"understat_id": str}))


def _espn_json(url, path, keep, *, timeout, use_cache):
    # Only final payloads are cached: completed scoreboards and team statistics that carry xG.
    if use_cache and path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    payload = json.loads(cached_get(url, timeout=timeout, cache_dir=None))
    if use_cache and keep(payload):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
    return payload


def _espn_team_xg(payload):
    for category in payload.get("splits", {}).get("categories", []):
        for stat in category.get("stats", []):
            if stat.get("name") == "expectedGoals" and stat.get("value") is not None:
                return float(stat["value"])
    return None


def fetch_espn_xg(*, competition, dates, timeout=30, cache_dir=".cache/espn/xg", use_cache=True):
    """Completed league matches on the given UTC dates with ESPN team xG (NaN when unpublished)."""
    league = COMPETITION_TO_ESPN_LEAGUE.get(competition)
    if league is None:
        raise ValueError(f"ESPN xG is not configured for competition {competition}.")
    cache = Path(cache_dir) / league
    rows = []
    for date in sorted({pd.Timestamp(value).strftime("%Y%m%d") for value in dates}):
        board = _espn_json(f"{ESPN_SITE}/{league}/scoreboard?dates={date}", cache / "scoreboards" / f"{date}.json",
                           lambda b: all(e["status"]["type"]["state"] == "post" for e in b.get("events", [])),
                           timeout=timeout, use_cache=use_cache)
        for event in board.get("events", []):
            competition_data = event["competitions"][0]
            if not competition_data["status"]["type"]["completed"]:
                continue
            sides = {row["homeAway"]: row for row in competition_data["competitors"]}
            xg = [_espn_team_xg(_espn_json(
                f"{ESPN_CORE}/{league}/events/{event['id']}/competitions/{competition_data['id']}/competitors/{sides[side]['id']}/statistics",
                cache / "teams" / f"{event['id']}-{sides[side]['id']}.json", lambda p: _espn_team_xg(p) is not None,
                timeout=timeout, use_cache=use_cache)) for side in ("home", "away")]
            rows.append({"espn_id": str(event["id"]), "utcDate": competition_data["date"],
                         "homeTeam": sides["home"]["team"]["displayName"], "awayTeam": sides["away"]["team"]["displayName"],
                         "homeGoals": sides["home"]["score"], "awayGoals": sides["away"]["score"],
                         "home_xg": xg[0], "away_xg": xg[1]})
    out = pd.DataFrame(rows, columns=["espn_id", "utcDate", "homeTeam", "awayTeam", "homeGoals", "awayGoals", *XG_COLUMNS])
    out["utcDate"] = pd.to_datetime(out["utcDate"], utc=True, errors="coerce")
    for column in ["homeGoals", "awayGoals", *XG_COLUMNS]:
        out[column] = pd.to_numeric(out[column], errors="coerce")
    return out


def attach_xg(matches, xg, *, max_kickoff_gap=pd.Timedelta(days=2)):
    """Join one season's xG onto its results by team pair, checking kickoff and final score.

    Rows that cannot be matched unambiguously keep missing xG; nothing is imputed.
    """
    out = matches.copy()
    out["understat_id"] = None
    out["xg_source"] = None
    for column in XG_COLUMNS:
        out[column] = np.nan
    coverage = {"provider": XG_PROVIDER, "finished": 0, "matched": 0, "unmatched": 0,
                "kickoff_mismatch": 0, "score_mismatch": 0}
    finished = out["homeGoals"].notna() & out["awayGoals"].notna()
    coverage["finished"] = int(finished.sum())
    if xg is None or xg.empty or not finished.any():
        coverage["unmatched"] = coverage["finished"]
        out.attrs["xg_coverage"] = coverage
        return out
    source = xg.assign(home_norm=xg["homeTeam"].map(normalize_team), away_norm=xg["awayTeam"].map(normalize_team))
    # Each home/away pairing occurs once per league season; duplicates make the join ambiguous.
    source = source.drop_duplicates(["home_norm", "away_norm"], keep=False).set_index(["home_norm", "away_norm"])
    kickoffs = pd.to_datetime(out["utcDate"], utc=True, errors="coerce")
    for index in out.index[finished]:
        key = (normalize_team(out.at[index, "homeTeam"]), normalize_team(out.at[index, "awayTeam"]))
        if key not in source.index:
            coverage["unmatched"] += 1
            continue
        row = source.loc[key]
        if pd.isna(kickoffs[index]) or abs(row["utcDate"] - kickoffs[index]) > max_kickoff_gap:
            coverage["kickoff_mismatch"] += 1
            continue
        if (row["homeGoals"], row["awayGoals"]) != (out.at[index, "homeGoals"], out.at[index, "awayGoals"]):
            coverage["score_mismatch"] += 1
            continue
        out.loc[index, XG_COLUMNS] = row[XG_COLUMNS].to_numpy(dtype=float)
        out.at[index, "understat_id"] = row.get("understat_id")
        out.at[index, "xg_source"] = XG_PROVIDER
        coverage["matched"] += 1
    out.attrs["xg_coverage"] = coverage
    return out


def _same_club(ours, theirs):
    ours, theirs = normalize_team(ours), normalize_team(theirs)
    return bool(ours and theirs) and (ours in theirs or theirs in ours)


def attach_espn_xg(matches, espn, *, scale=1.0, max_kickoff_gap=pd.Timedelta(hours=3)):
    """Fill finished results still missing xG from ESPN, matched by kickoff, final score and a club name.

    Provider names differ (Hamburg SV, Deportivo), so one agreeing side is enough once kickoff and score agree.
    The xG columns get ESPN's values times `scale`; `espn_home_xg`/`espn_away_xg` keep the raw values.
    """
    out = matches.copy()
    for column in ESPN_XG_COLUMNS:
        out[column] = np.nan
    coverage = dict(out.attrs.get("xg_coverage", {}))
    coverage.update(espn_matched=0, espn_unmatched=0, espn_scale=scale)
    kickoffs = pd.to_datetime(out["utcDate"], utc=True, errors="coerce")
    missing = out["homeGoals"].notna() & out["awayGoals"].notna() & out["home_xg"].isna()
    for index in out.index[missing]:
        candidates = espn[(espn["utcDate"] - kickoffs[index]).abs().le(max_kickoff_gap)
                          & espn["homeGoals"].eq(out.at[index, "homeGoals"]) & espn["awayGoals"].eq(out.at[index, "awayGoals"])]
        agree = [_same_club(out.at[index, "homeTeam"], row.homeTeam) + _same_club(out.at[index, "awayTeam"], row.awayTeam)
                 for row in candidates.itertuples()]
        best = candidates[[0 < count == max(agree) for count in agree]]
        if len(best) != 1 or np.isnan(best[XG_COLUMNS].to_numpy(dtype=float)).any():
            coverage["espn_unmatched"] += 1
            continue
        raw = best[XG_COLUMNS].to_numpy(dtype=float)[0]
        out.loc[index, ESPN_XG_COLUMNS] = raw
        out.loc[index, XG_COLUMNS] = raw * scale
        out.at[index, "xg_source"] = "espn"
        coverage["espn_matched"] += 1
    out.attrs["xg_coverage"] = coverage
    return out


def load_season_xg(matches, *, competition, season, cache=True):
    """Attach Understat xG to one season's results, then ESPN's where Understat has none.

    Unavailable seasons keep missing xG; `xg_coverage` counts stale gaps before the latest result.
    """
    try:
        xg = fetch_understat_matches(competition=competition, season=season)
    except (ValueError, OSError, RuntimeError, KeyError) as exc:
        LOG.warning("Understat xG unavailable for %s %s (%s).", competition, season, type(exc).__name__)
        out = attach_xg(matches, None)
        out.attrs["xg_coverage"]["error"] = type(exc).__name__
    else:
        out = attach_xg(matches, xg)
    finished = out["homeGoals"].notna() & out["awayGoals"].notna()
    if competition in COMPETITION_TO_ESPN_LEAGUE and season >= ESPN_FIRST_SEASON and out.loc[finished, "home_xg"].isna().any():
        dates = pd.to_datetime(out.loc[finished & out["home_xg"].isna(), "utcDate"], utc=True, errors="coerce").dropna()
        try:
            espn = fetch_espn_xg(competition=competition, dates=dates, use_cache=cache)
        except (ValueError, OSError, RuntimeError, KeyError, TypeError) as exc:
            LOG.warning("ESPN xG unavailable for %s %s (%s).", competition, season, type(exc).__name__)
            out.attrs["xg_coverage"]["espn_error"] = type(exc).__name__
        else:
            out = attach_espn_xg(out, espn, scale=ESPN_TO_UNDERSTAT[competition])
    kickoffs = pd.to_datetime(out["utcDate"], utc=True, errors="coerce")
    stale = finished & out["home_xg"].isna() & kickoffs.lt(kickoffs[finished].max() - XG_STALE_AFTER)
    out.attrs["xg_coverage"]["stale"] = int(stale.sum())
    if stale.any() and season >= ESPN_FIRST_SEASON:
        LOG.warning("xG missing for %s finished %s matches before %s.", int(stale.sum()), competition,
                    (kickoffs[finished].max() - XG_STALE_AFTER).date())
    return out


@dataclass(frozen=True)
class XgStrengths:
    attack: Dict[str, float]
    defense: Dict[str, float]
    intercept: float
    home_advantage: float
    matches: int


def fit_xg_strengths(matches, *, reference_date=None, xi=0.003, lambda_reg=0.1, max_iter=2000):
    """Time-decayed attack/defense strengths fitted to xG with a quasi-Poisson log-link objective.

    Fractional xG is a continuous response, so only the Poisson mean structure is used, not
    an integer likelihood. Strengths are centered like the Dixon–Coles team parameters.
    """
    if not set(XG_COLUMNS).issubset(matches.columns):
        return None
    data = matches.dropna(subset=XG_COLUMNS).copy()
    data["utcDate"] = pd.to_datetime(data["utcDate"], utc=True)
    if reference_date is not None:
        reference_date = pd.to_datetime(reference_date, utc=True)
        data = data[data["utcDate"] < reference_date]
    if data.empty:
        return None
    latest = reference_date if reference_date is not None else data["utcDate"].max()
    teams = sorted(pd.unique(data[["homeTeam", "awayTeam"]].values.ravel("K")))
    if len(teams) < 2:
        return None
    index = {team: i for i, team in enumerate(teams)}
    n = len(teams)
    home = data["homeTeam"].map(index).to_numpy(dtype=int)
    away = data["awayTeam"].map(index).to_numpy(dtype=int)
    y_home = data["home_xg"].to_numpy(dtype=float)
    y_away = data["away_xg"].to_numpy(dtype=float)
    weights = np.exp(-xi * (latest - data["utcDate"]).dt.total_seconds().to_numpy() / 86400.0)

    def objective(params):
        intercept, home_adv, attack, defense = params[0], params[1], params[2:2 + n], params[2 + n:]
        log_home = intercept + home_adv + attack[home] + defense[away]
        log_away = intercept + attack[away] + defense[home]
        mu_home, mu_away = np.exp(np.clip(log_home, -15, 15)), np.exp(np.clip(log_away, -15, 15))
        loss = (weights * (mu_home - y_home * log_home + mu_away - y_away * log_away)).sum()
        loss += lambda_reg * (home_adv**2 + np.square(attack).sum() + np.square(defense).sum())
        r_home, r_away = weights * (mu_home - y_home), weights * (mu_away - y_away)
        grad = np.empty_like(params)
        grad[0] = r_home.sum() + r_away.sum()
        grad[1] = r_home.sum() + 2 * lambda_reg * home_adv
        grad[2:2 + n] = np.bincount(home, r_home, n) + np.bincount(away, r_away, n) + 2 * lambda_reg * attack
        grad[2 + n:] = np.bincount(away, r_home, n) + np.bincount(home, r_away, n) + 2 * lambda_reg * defense
        return float(loss), grad

    x0 = np.zeros(2 + 2 * n)
    x0[0] = np.log(max(np.average(y_away, weights=weights), 1e-3))
    result = minimize(objective, x0, jac=True, method="L-BFGS-B", options={"maxiter": max_iter})
    if not result.success:
        raise RuntimeError(f"xG strength fit failed: {result.message}")
    attack, defense = result.x[2:2 + n], result.x[2 + n:]
    shift_attack, shift_defense = attack.mean(), defense.mean()
    return XgStrengths(
        attack={team: float(attack[i] - shift_attack) for team, i in index.items()},
        defense={team: float(defense[i] - shift_defense) for team, i in index.items()},
        intercept=float(result.x[0] + shift_attack + shift_defense), home_advantage=float(result.x[1]),
        matches=len(data),
    )


def blend_xg_strengths(dc, xg, weight, scale=1.0):
    """Blend log goal rates with xG-based rates through team strengths.

    Sharing the goal model's intercept and home advantage makes
    log(rate) = (1 - w) log(goal rate) + w log(xG rate) while keeping the goal scale, so
    provider differences in penalty or own-goal scope do not shift league scoring. Teams
    without xG history keep their goal-based strengths.

    `scale` multiplies the xG strengths before blending. xG understates the differences
    between teams in goals (strong sides keep beating their xG and weak sides fall short),
    so unscaled xG pulls the best teams toward average; 1 is the plain blend.
    """
    if xg is None or weight == 0:
        return dc
    if not 0 <= weight <= 1:
        raise ValueError("xG weight must be between 0 and 1.")
    if not np.isfinite(scale) or scale <= 0:
        raise ValueError("xG scale must be positive.")
    attack, defense = dc.attack.copy(), dc.defense.copy()
    for team, i in dc.team_index.items():
        if team in xg.attack:
            attack[i] = (1 - weight) * attack[i] + weight * scale * xg.attack[team]
            defense[i] = (1 - weight) * defense[i] + weight * scale * xg.defense[team]
    return replace(dc, attack=attack, defense=defense)
