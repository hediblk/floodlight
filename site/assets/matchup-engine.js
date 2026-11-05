// What-if matchups: a port of the goal model, Elo, their blend and the knockout tie maths.
// Mirrors standing_prediction (dixon_coles, elo, ensemble, match_forecasts) and
// champions_league.tournament.MatchupCache.tie_probability; check_site.py compares it with
// the reference cases exported beside the parameters in matchups.json.

const LOG_FACT = [0];
const logFact = (k) => {
  for (let i = LOG_FACT.length; i <= k; i++) LOG_FACT[i] = LOG_FACT[i - 1] + Math.log(i);
  return LOG_FACT[k];
};
const poissonPmf = (rate, k) => Math.exp(k * Math.log(rate) - rate - logFact(k));

// Default tweaks: every value at the model's own.
export const NO_TWEAKS = Object.freeze({ clubs: {}, home: 1, pens: 0.5 });

export function isTweaked(t) {
  return t.home !== 1 || t.pens !== 0.5 || Object.values(t.clubs).some((c) => c.attack || c.defense);
}

// Expected goals for home and away; `neutral` drops the home advantage. Club nudges scale a side's goals
// scored (attack) and conceded (defence), before the joint model's rate bounds.
export function rates(engine, home, away, { neutral = false, tweaks = NO_TWEAKS } = {}) {
  const h = engine.clubs[home] || { attack: 0, defense: 0 };
  const a = engine.clubs[away] || { attack: 0, defense: 0 };
  const advantage = neutral ? 0 : engine.home_advantage * tweaks.home;
  const clip = (x) => Math.min(15, Math.max(-15, x));
  let lh = Math.exp(clip(engine.intercept + advantage + h.attack + a.defense));
  let la = Math.exp(clip(engine.intercept + a.attack + h.defense));
  const th = tweaks.clubs[home] || {}, ta = tweaks.clubs[away] || {};
  lh *= (1 + (th.attack || 0)) * (1 - (ta.defense || 0));
  la *= (1 + (ta.attack || 0)) * (1 - (th.defense || 0));
  if (engine.rate_bounds) {
    const [lo, hi] = engine.rate_bounds;
    lh = Math.min(hi, Math.max(lo, lh));
    la = Math.min(hi, Math.max(lo, la));
  }
  return [lh, la];
}

function goalProbs(mean, n) {
  const m = Math.max(mean, 1e-9);
  const p = [];
  let total = 0;
  for (let k = 0; k <= n; k++) { p.push(Math.exp(k * Math.log(m) - m - logFact(k))); total += p[k]; }
  return p.map((x) => x / total);
}

// Home-by-away goal probabilities with the Dixon–Coles low-score correction.
export function scoreMatrix(lh, la, rho, n = 10) {
  const hp = goalProbs(lh, n), ap = goalProbs(la, n);
  const tau = [[Math.max(0, 1 - lh * la * rho), Math.max(0, 1 + lh * rho)], [Math.max(0, 1 + la * rho), Math.max(0, 1 - rho)]];
  let m = hp.map((x, i) => ap.map((y, j) => x * y * (i < 2 && j < 2 ? tau[i][j] : 1)));
  let total = m.flat().reduce((s, x) => s + x, 0);
  if (total <= 0) {
    m = hp.map((x) => ap.map((y) => x * y));
    total = m.flat().reduce((s, x) => s + x, 0);
  }
  return m.map((row) => row.map((x) => x / total));
}

export function outcomes(m) {
  let w = 0, d = 0, l = 0;
  m.forEach((row, i) => row.forEach((p, j) => { if (i > j) w += p; else if (i === j) d += p; else l += p; }));
  const total = w + d + l;
  return total > 0 ? [w / total, d / total, l / total] : [1 / 3, 1 / 3, 1 / 3];
}

export function eloProbs(engine, home, away, { neutral = false, tweaks = NO_TWEAKS } = {}) {
  const { home_advantage, draw_base, draw_scale } = engine.elo;
  const rh = engine.clubs[home]?.elo ?? 1500, ra = engine.clubs[away]?.elo ?? 1500;
  const diff = rh + (neutral ? 0 : home_advantage * tweaks.home) - ra;
  const two = 1 / (1 + 10 ** (-diff / 400));
  const draw = Math.min(0.35, Math.max(0.05, draw_base * Math.exp(-Math.abs(diff) / Math.max(draw_scale, 1e-6))));
  const p = [(1 - draw) * two, draw, (1 - draw) * (1 - two)];
  const total = p[0] + p[1] + p[2];
  return total > 0 ? p.map((x) => x / total) : [1 / 3, 1 / 3, 1 / 3];
}

// Log-linear pool of the goal model and Elo.
export function blend(main, elo, weights) {
  const total = weights.main + weights.elo;
  const wm = weights.main / total, we = weights.elo / total;
  const log = (p) => Math.log(Math.min(1, Math.max(1e-12, p)));
  const p = main.map((x, k) => Math.exp(wm * log(x) + we * log(elo[k])));
  const sum = p[0] + p[1] + p[2];
  return p.map((x) => x / sum);
}

// The goal model's scores rescaled within home win, draw and away win to the blended chances.
export function rescale(m, p) {
  const masks = [(i, j) => i > j, (i, j) => i === j, (i, j) => i < j];
  const mass = masks.map((f) => m.reduce((s, row, i) => s + row.reduce((t, x, j) => t + (f(i, j) ? x : 0), 0), 0));
  const out = m.map((row, i) => row.map((x, j) => { const k = i > j ? 0 : i === j ? 1 : 2; return x * (p[k] / mass[k]); }));
  const total = out.flat().reduce((s, x) => s + x, 0);
  return out.map((row) => row.map((x) => x / total));
}

// One game: blended chances, goal rates and the blended score grid.
export function game(engine, home, away, opts = {}) {
  const r = rates(engine, home, away, opts);
  const m = scoreMatrix(r[0], r[1], engine.rho, engine.max_goals);
  const p = blend(outcomes(m), eloProbs(engine, home, away, opts), engine.weights);
  return { p, rates: r, grid: rescale(m, p) };
}

// Goal difference (home minus away) distribution; index d + max goals.
export function difference(grid) {
  const n = grid.length - 1, out = new Array(2 * n + 1).fill(0);
  grid.forEach((row, i) => row.forEach((p, j) => { out[i - j + n] += p; }));
  return out;
}

function convolve(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
  return out;
}

// Extra time: independent Poisson goals at a third of the deciding game's rates.
function extraTime([lh, la]) {
  let win = 0, level = 0, loss = 0;
  const n = 60, hp = [], ap = [];
  for (let k = 0; k <= n; k++) { hp.push(poissonPmf(lh / 3, k)); ap.push(poissonPmf(la / 3, k)); }
  hp.forEach((x, i) => ap.forEach((y, j) => { if (i > j) win += x * y; else if (i === j) level += x * y; else loss += x * y; }));
  return [win, level, loss];
}

// A knockout tie from team1's side. Two legs: `secondHome` hosts the second leg and `firstLeg` is an
// already played first-leg score [first host goals, visitors' goals]. A final is one neutral game.
// Returns team1's chance and its split by when the tie is decided, plus the aggregate distribution.
export function tie(engine, team1, team2, { final = false, secondHome = team1, firstLeg = null, tweaks = NO_TWEAKS } = {}) {
  const other = secondHome === team1 ? team2 : team1;
  const legs = final ? [[team1, team2]] : [[other, secondHome], [secondHome, other]];
  const games = [];
  let mass = [1], origin = 0;
  legs.forEach(([home, away], k) => {
    const sign = home === team1 ? 1 : -1;
    const g = game(engine, home, away, { neutral: final, tweaks });
    games.push({ home, away, ...g });
    if (k === 0 && firstLeg && !final) {
      origin += (firstLeg[0] - firstLeg[1]) * sign;
      games[0].played = firstLeg;
      return;
    }
    const d = difference(g.grid);
    mass = convolve(mass, sign > 0 ? d : d.slice().reverse());
    origin -= engine.max_goals;
  });
  const aggregate = new Map();
  let win = 0, level = 0, loss = 0;
  mass.forEach((p, i) => {
    const d = i + origin;
    aggregate.set(d, (aggregate.get(d) || 0) + p);
    if (d > 0) win += p; else if (d === 0) level += p; else loss += p;
  });
  const last = games[games.length - 1];
  const [ew, el, eloss] = extraTime(last.rates);
  const lastHome = last.home === team1;
  const etWin = lastHome ? ew : eloss, etLoss = lastHome ? eloss : ew;
  const team1Pens = tweaks.pens;
  const split = {
    team1: [win, level * etWin, level * el * team1Pens],
    team2: [loss, level * etLoss, level * el * (1 - team1Pens)],
  };
  return { p: win + level * (etWin + el * team1Pens), split, aggregate, games, level };
}

// Goal markets and likeliest scores from a score grid.
export function markets(grid) {
  let over = 0, btts = 0, eh = 0, ea = 0;
  const scores = [];
  grid.forEach((row, i) => row.forEach((p, j) => {
    if (i + j >= 3) over += p;
    if (i && j) btts += p;
    eh += i * p; ea += j * p;
    scores.push([i, j, p]);
  }));
  scores.sort((x, y) => y[2] - x[2]);
  return {
    over, btts, exp: [eh, ea], top: scores.slice(0, 5),
    clean: [grid.reduce((s, row) => s + row[0], 0), grid[0].reduce((s, p) => s + p, 0)],
  };
}

// One random game drawn from a score grid; `rng` returns uniforms in [0, 1).
export function sampleScore(grid, rng = Math.random) {
  let u = rng();
  for (let i = 0; i < grid.length; i++) for (let j = 0; j < grid.length; j++) {
    u -= grid[i][j];
    if (u <= 0) return [i, j];
  }
  return [0, 0];
}

export function samplePoisson(rate, rng = Math.random) {
  let k = 0, p = Math.exp(-rate), s = p;
  const u = rng();
  while (u > s && k < 30) { k += 1; p *= rate / k; s += p; }
  return k;
}
