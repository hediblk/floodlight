import { decodeSeason, normalizeStrategy, runBacktest, universeMatch } from "./backtest-engine.js";

// Replayed and published rows of one game share this key, so overlap counts fixtures, not forecast rows.
const fixtureKey = (row) => [row.comp, row.kickoff, row.home_key ?? row.home, row.away_key ?? row.away].join("|");
const day = (time) => new Date(time).toISOString().slice(0, 10);

function population(rows, strategy, result) {
  const universe = rows.filter((row) => universeMatch(row, strategy.universe));
  const times = universe.map((row) => Date.parse(row.kickoff));
  return {
    keys: new Set(universe.map(fixtureKey)), bets: new Set(result.bets.map(fixtureKey)),
    comps: [...new Set(universe.map((row) => row.comp))].sort(),
    seasons: [...new Set(universe.map((row) => row.season))].sort((a, b) => a - b),
    first: times.length ? day(times.reduce((a, b) => Math.min(a, b))) : null,
    last: times.length ? day(times.reduce((a, b) => Math.max(a, b))) : null,
  };
}
function overlap(a, b) {
  let both = 0;
  for (const key of a) if (b.has(key)) both += 1;
  return { both, only_a: a.size - both, only_b: b.size - both };
}

self.onmessage = ({ data: { files, strategy, comparisons = [] } }) => {
  let rows;
  try { rows = files.flatMap(decodeSeason); } catch (error) { self.postMessage({ error: error.message }); return; }
  const message = {};
  // The editor strategy and the saved comparison fail independently.
  if (strategy) {
    try {
      const result = runBacktest(rows, strategy);
      self.postMessage({ progress: "Calculating market-favourite reference…" });
      message.reference = runBacktest(rows, {
        ...strategy, rule: { pick: "market_favourite", conditions: [] },
        universe: { ...strategy.universe, team_side: false },
        stake: { method: "flat", unit: strategy.stake.unit },
      }, { breakdowns: false });
      message.result = result;
    } catch (error) { message.error = error.message; delete message.reference; }
  }
  if (comparisons.length) {
    let name = "";
    try {
      const populations = [];
      message.comparisons = comparisons.map(({ name: label, strategy: input }, index) => {
        name = label;
        self.postMessage({ progress: `Comparing saved strategy ${index + 1} of ${comparisons.length}…` });
        const normalized = normalizeStrategy(input);
        const result = runBacktest(rows, normalized, { breakdowns: false });
        const p = population(rows, normalized, result);
        populations.push(p);
        return { name: label, strategy: normalized, result, population: { comps: p.comps, seasons: p.seasons, first: p.first, last: p.last, fixtures: p.keys.size, bet_fixtures: p.bets.size } };
      });
      message.overlap = { fixtures: overlap(populations[0].keys, populations[1].keys), bets: overlap(populations[0].bets, populations[1].bets) };
    } catch (error) {
      delete message.comparisons;
      message.comparisonError = `${name}: ${error.message}`;
    }
  }
  self.postMessage(message);
};
