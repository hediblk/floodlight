# Parameters for the site's what-if matchups: a goal model and Elo, enough to recompute any pairing in the browser.
# Reference cases come from the fitted model objects, so the site check can confirm its JavaScript port.

from __future__ import annotations

import json
from pathlib import Path

from standing_prediction.dixon_coles import outcome_probs_from_matrix
from standing_prediction.ensemble import blend_probabilities
from standing_prediction.match_forecasts import scoreline_distribution


def matchup_params(dc, elo, weights, *, teams, generated_at, as_of, rate_bounds=None, max_goals=10):
    if dc.pair_shift:
        raise ValueError("Matchup parameters cannot express head-to-head shifts.")
    main, elo_weight = float(weights.get("main", 0.0)), float(weights.get("elo", 0.0))
    if main + elo_weight <= 0:
        raise ValueError("Matchups need a positive model weight.")
    return {
        "generated_at": generated_at, "as_of": as_of, "max_goals": max_goals,
        "rate_bounds": list(rate_bounds) if rate_bounds is not None else None,
        "intercept": float(dc.intercept), "home_advantage": float(dc.home_advantage), "rho": float(dc.rho),
        "elo": {"home_advantage": float(elo.home_advantage), "draw_base": float(elo.draw_base),
                "draw_scale": float(elo.draw_scale)},
        "weights": {"main": main / (main + elo_weight), "elo": elo_weight / (main + elo_weight)},
        "teams": {team: {"attack": float(dc.attack[dc.team_index[team]]), "defense": float(dc.defense[dc.team_index[team]]),
                         "elo": float(elo.ratings.get(team, 1500.0))} for team in teams if team in dc.team_index},
        "reference": [],
    }


# One game's blended chances, goal rates and 1–1 chance from the fitted objects (`model` may be the joint model).
def single_reference(model, elo, weights, home, away, *, neutral=False, max_goals=10):
    kwargs = {"neutral": neutral} if neutral else {}
    _, matrix = model.score_matrix(home, away, max_goals=max_goals, **kwargs)
    p = blend_probabilities(outcome_probs_from_matrix(matrix), p_elo=elo(home, away), weights=weights)
    dist = scoreline_distribution(matrix, p)
    return {"kind": "single", "home": home, "away": away, "neutral": neutral, "p": list(p),
            "rates": list(model.expected_goals(home, away, **kwargs)), "score_1_1": float(dist[1, 1])}


def write_matchup_params(path, params):
    Path(path).write_text(json.dumps(params, ensure_ascii=False, allow_nan=False) + "\n")
