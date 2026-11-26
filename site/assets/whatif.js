// What if: pick any two clubs, then the model's forecast for a single game, a two-leg tie or a final.
// Routes: #whatif (pick sides) and #whatif/<home>/<away>/<single|neutral|legs|final>[/<first-leg score>].
import { $, esc, getJSON, setStatus, crestPath, bulb, when, LEAGUES } from "./core.js";
import { NO_TWEAKS, isTweaked, game, tie, markets, sampleScore, samplePoisson } from "./matchup-engine.js";

const GROUPS = [...["premier-league", "la-liga", "bundesliga", "serie-a", "ligue-1"].map((slug) => ({
  slug, label: LEAGUES.find((l) => l.slug === slug).label,
})), { slug: null, label: "Rest of Europe" }];
const MODES = ["single", "neutral", "legs", "final"];
const TITLES = { single: "single match", neutral: "single match", legs: "two-leg tie", final: "final" };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = { home: null, away: null, mode: "single", tweaks: { clubs: {}, home: 1, pens: 0.5 }, leg: null, played: null };
let clubs = null, bySlug = {}, data = null, current = null;

async function load() {
  if (!data) [data, clubs] = await Promise.all([getJSON("matchups.json"), getJSON("clubs.json").then((c) => c.clubs)]);
  bySlug = Object.fromEntries(clubs.filter((c) => data.engines.europe.clubs[c.slug]).map((c) => [c.slug, c]));
}

const members = (group) => Object.values(bySlug).filter((c) => (c.league ?? null) === group).sort((a, b) => b.rating - a.rating);
const groupOf = (club) => GROUPS.findIndex((g) => g.slug === (club.league ?? null));
const crest = (club, px, cls = "") => {
  const path = crestPath(club.id);
  return path ? `<img class="club-crest ${cls}" src="${esc(path)}" width="${px}" height="${px}" alt="" decoding="async">` : "";
};
const short = (club) => club.name;
const hashFor = (home, away, mode, played) => `#whatif/${home}/${away}/${mode}${played && mode === "legs" ? `/${played.join("-")}` : ""}`;

export async function showWhatIf(parts) {
  document.title = "What if · Floodlight";
  const view = $("view-whatif");
  try {
    await load();
  } catch {
    view.innerHTML = `<fieldset class="frame"><legend>What if</legend><p class="note top-note">The what-if model could not be loaded. <a href="#model">How the forecasts are made →</a></p></fieldset>`;
    return;
  }
  setStatus(data.generated_at);
  const [home, away, mode = "single", played] = parts;
  const valid = bySlug[home] && bySlug[away] && home !== away && MODES.includes(mode);
  if (valid) {
    Object.assign(state, { home, away, mode });
    const score = mode === "legs" && /^\d-\d$/.test(played || "") ? played.split("-").map(Number) : null;
    state.played = score;
    renderResults(view);
  } else {
    if (bySlug[home]) state.home = home;
    if (bySlug[away] && away !== state.home) state.away = away;
    renderPick(view);
  }
}

/* ---------- pick your sides ---------- */
function defaults() {
  const ranked = Object.values(bySlug).sort((a, b) => b.rating - a.rating);
  if (!bySlug[state.home]) state.home = (bySlug.arsenal || ranked[0]).slug;
  if (!bySlug[state.away] || state.away === state.home) state.away = (bySlug["bayern-munchen"] && state.home !== "bayern-munchen" ? bySlug["bayern-munchen"] : ranked.find((c) => c.slug !== state.home)).slug;
}

function renderPick(view) {
  defaults();
  view.innerHTML = `<fieldset class="frame wi-frame"><legend>What if · pick your sides</legend>
    <div class="wi-pick">
      <section class="wi-side" id="wi-side-home" aria-label="Home side"></section>
      <div class="wi-vs" aria-hidden="true">VS</div>
      <section class="wi-side" id="wi-side-away" aria-label="Away side"></section>
    </div>
    <datalist id="wi-clubs">${Object.values(bySlug).sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `<option value="${esc(c.name)}"></option>`).join("")}</datalist>
    <div class="wi-setup">
      <div class="wi-grp"><span id="wi-mode-label">Mode</span><div class="chips" role="group" aria-labelledby="wi-mode-label" id="wi-mode"></div></div>
      <div class="wi-grp" id="wi-venue-grp"><span id="wi-venue-label">Venue</span><div class="chips" role="group" aria-labelledby="wi-venue-label" id="wi-venue"></div></div>
      <a class="wi-kick" id="wi-kick" href="#">Kick off ▸</a>
    </div></fieldset>`;
  side("home"); side("away"); setup();
  view.querySelector(".wi-pick").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cycle]");
    if (!b) return;
    const [key, what, step] = b.dataset.cycle.split(":");
    const club = bySlug[state[key]];
    let g = groupOf(club), list = members(GROUPS[g].slug), i = list.indexOf(club);
    if (what === "league") {
      do { g = (g + Number(step) + GROUPS.length) % GROUPS.length; list = members(GROUPS[g].slug); } while (!list.length);
      i = 0;
    } else i = (i + Number(step) + list.length) % list.length;
    const other = key === "home" ? state.away : state.home;
    if (list[i].slug === other && list.length > 1) i = (i + Number(step) + list.length) % list.length;
    state[key] = list[i].slug;
    side(key, Number(step), b.dataset.cycle);
    setup();
  });
  view.querySelector(".wi-pick").addEventListener("change", (e) => {
    if (!e.target.matches(".wi-search")) return;
    const key = e.target.dataset.side;
    const club = Object.values(bySlug).find((c) => c.name.toLowerCase() === e.target.value.trim().toLowerCase());
    if (!club || club.slug === (key === "home" ? state.away : state.home)) return;
    state[key] = club.slug;
    side(key, 1);
    setup();
  });
}

function side(key, step = 0, focus = null) {
  const club = bySlug[state[key]], group = GROUPS[groupOf(club)];
  const el = $(`wi-side-${key}`);
  const where = club.league ? "" : club.country || "";
  el.innerHTML = `<span class="wi-tag">${key === "home" ? "Home side" : "Away side"}</span>
    <div class="wi-cyc"><button type="button" data-cycle="${key}:league:-1" aria-label="Previous league">◀</button>
      <div class="wi-lbl">${esc(group.label)}</div>
      <button type="button" data-cycle="${key}:league:1" aria-label="Next league">▶</button></div>
    <div class="wi-crest">${crest(club, 120, step ? (step > 0 ? "from-r" : "from-l") : "")}</div>
    <div class="wi-cyc wi-club"><button type="button" data-cycle="${key}:club:-1" aria-label="Previous club">◀</button>
      <div class="wi-lbl" aria-live="polite">${esc(club.name)}</div>
      <button type="button" data-cycle="${key}:club:1" aria-label="Next club">▶</button></div>
    ${where ? `<div class="wi-where">${esc(where)}</div>` : ""}
    <div class="wi-stats" title="Floodlight ratings on the European scale">
      <div><b>${Math.round(club.rating)}</b><span>OVR</span></div>
      <div><b>${Math.round(club.attack)}</b><span>ATT</span></div>
      <div><b>${Math.round(club.defense)}</b><span>DEF</span></div></div>
    <label class="wi-find"><span class="vh">Find a club for the ${key} side</span>
      <input class="wi-search" data-side="${key}" list="wi-clubs" placeholder="Search ${Object.keys(bySlug).length} clubs…" autocomplete="off"></label>`;
  if (step && !reduced()) requestAnimationFrame(() => requestAnimationFrame(() => el.querySelector(".club-crest")?.classList.remove("from-l", "from-r")));
  else el.querySelector(".club-crest")?.classList.remove("from-l", "from-r");
  if (focus) el.querySelector(`[data-cycle="${focus}"]`)?.focus();
}

function chipsHTML(list, current, attr) {
  return list.map(([value, label]) => `<button type="button" class="chip" data-${attr}="${value}" aria-pressed="${value === current}">${esc(label)}</button>`).join("");
}

// Mode and venue chips; the home slot hosts (the single game, or the first leg).
function venueChoices(mode, home, away) {
  if (mode === "final") return [];
  if (mode === "legs") return [["first", `${short(home)} host 1st leg`], ["swap", `${short(away)} host 1st leg`]];
  return [["single", `${short(home)} at home`], ["neutral", "Neutral"], ["swap", `${short(away)} at home`]];
}
const modeOf = (mode) => (mode === "neutral" ? "single" : mode);

function setup() {
  const home = bySlug[state.home], away = bySlug[state.away];
  $("wi-mode").innerHTML = chipsHTML([["single", "Single match"], ["legs", "Two legs"], ["final", "Final"]], modeOf(state.mode), "mode");
  const venue = venueChoices(state.mode, home, away);
  $("wi-venue-grp").hidden = !venue.length;
  $("wi-venue").innerHTML = chipsHTML(venue, state.mode === "legs" ? "first" : state.mode, "venue");
  $("wi-kick").href = hashFor(state.home, state.away, state.mode, null);
  $("wi-mode").onclick = (e) => {
    const b = e.target.closest("[data-mode]");
    if (!b) return;
    state.mode = b.dataset.mode;
    setup();
  };
  $("wi-venue").onclick = (e) => {
    const b = e.target.closest("[data-venue]");
    if (!b) return;
    if (b.dataset.venue === "swap") {
      [state.home, state.away] = [state.away, state.home];
      side("home"); side("away");
    } else if (b.dataset.venue !== "first") state.mode = b.dataset.venue;
    setup();
  };
}

/* ---------- results ---------- */
function engineFor(home, away, mode) {
  const league = home.league && home.league === away.league ? data.engines[home.league] : null;
  return mode === "single" && league?.clubs[home.slug] && league.clubs[away.slug]
    ? { engine: league, name: `${LEAGUES.find((l) => l.slug === home.league).label} model` }
    : { engine: data.engines.europe, name: "European model" };
}

function activeTweaks() {
  const t = state.tweaks;
  return { home: t.home, pens: t.pens, clubs: { [state.home]: t.clubs[state.home] || {}, [state.away]: t.clubs[state.away] || {} } };
}

// `partial` redraws everything above the Tweak frame and leaves the sliders (and any drag) alone.
function renderResults(view, partial = false) {
  const home = bySlug[state.home], away = bySlug[state.away], mode = state.mode;
  const { engine, name } = engineFor(home, away, mode);
  const tweaks = activeTweaks(), modified = isTweaked(tweaks);
  const knockout = mode === "legs" || mode === "final";
  const venue = mode === "neutral" || mode === "final" ? "Neutral ground" : mode === "legs" ? `1st leg at ${short(home)}` : `At ${short(home)}`;
  let hero, ko = null, legs;
  if (knockout) {
    ko = tie(engine, home.slug, away.slug, { final: mode === "final", secondHome: away.slug, firstLeg: state.played, tweaks });
    legs = ko.games;
    const through = ko.p >= 0.5 ? home : away;
    hero = { p: Math.max(ko.p, 1 - ko.p), text: `${short(through)} go through` };
  } else {
    legs = [{ home: home.slug, away: away.slug, ...game(engine, home.slug, away.slug, { neutral: mode === "neutral", tweaks }) }];
    const p = legs[0].p, k = p.indexOf(Math.max(...p));
    hero = { p: p[k], text: [`${short(home)} win`, "Draw", `${short(away)} win`][k] };
  }
  if (state.leg == null || state.leg >= legs.length || (state.played && state.leg === 0)) state.leg = state.played ? 1 : 0;
  const shown = legs[state.leg];
  const caption = mode === "final" ? "One game on neutral ground; extra time, then penalties"
    : mode === "legs" ? (state.played ? `After the ${state.played.join("–")} first leg at ${esc(short(home))}` : "Over two legs; extra time, then penalties, in the second")
    : `Expected goals <b>${markets(shown.grid).exp.map((x) => x.toFixed(2)).join(" – ")}</b>`;
  const main = `<fieldset class="frame wi-frame"><legend>What if · ${TITLES[mode]}</legend>
      <div class="wi-head">
        <div class="wi-t">${crest(home, 80)}<span>${esc(home.name)}</span></div>
        <div class="wi-mid"><b>VS</b>${esc(venue)}</div>
        <div class="wi-t wi-a"><span>${esc(away.name)}</span>${crest(away, 80)}</div>
      </div>
      <div class="wi-tools">
        <a class="chip" href="#whatif">← Change teams</a>
        <a class="chip" href="${hashFor(away.slug, home.slug, mode, null)}">⇄ Swap</a>
        <div class="chips" role="group" aria-label="Mode" id="wi-mode"></div>
        <div class="chips" role="group" aria-label="Venue" id="wi-venue"></div>
        ${modified ? `<span class="wi-mod">Modified · not a Floodlight forecast</span>` : ""}
      </div>
      <div class="wi-hero">
        <div class="who"><h1>${esc(hero.text)}</h1>
          ${knockout ? "" : outcomeBulbs(shown.p, home, away)}
          <p class="caption">${caption}</p></div>
        <div class="numeral">${Math.round(hero.p * 100)}<sup>%</sup></div>
      </div></fieldset>
    ${mode === "legs" ? firstLegFrame(home, away) : ""}
    ${knockout ? throughFrame(ko, home, away, mode) : ""}
    ${forecastFrame(legs, home, away, mode)}`;
  current = { legs, ko, home, away, mode };
  if (partial && $("wi-main")) {
    $("wi-main").innerHTML = main;
    $("wi-reset").disabled = !modified;
  } else view.innerHTML = `<div id="wi-main">${main}</div>
    ${tweakFrame(home, away, engine, knockout, mode)}
    <fieldset class="frame"><legend>Play it</legend>
      <div class="wi-play"><button type="button" class="wi-kick" id="wi-roll">Play it ▸</button>
        <div id="wi-rolled"><p class="note">One random result drawn from these chances. Press again for another.</p></div></div></fieldset>
    <p class="note wi-foot">Model only, no bookmaker prices · ${esc(name)}, run ${when(engine.generated_at)}${mode === "neutral" || mode === "final" ? " · neutral ground means no home advantage" : ""} · not saved as a forecast. <a href="#model">How the forecasts are made →</a></p>`;
  // Mode and venue chips here change the link.
  $("wi-mode").innerHTML = chipsHTML([["single", "Single match"], ["legs", "Two legs"], ["final", "Final"]], modeOf(mode), "mode");
  $("wi-venue").innerHTML = chipsHTML(venueChoices(mode, home, away), mode === "legs" ? "first" : mode, "venue");
  $("wi-mode").onclick = (e) => {
    const b = e.target.closest("[data-mode]");
    if (b && b.dataset.mode !== modeOf(mode)) location.hash = hashFor(home.slug, away.slug, b.dataset.mode === "single" ? "single" : b.dataset.mode, null);
  };
  $("wi-venue").onclick = (e) => {
    const b = e.target.closest("[data-venue]");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    location.hash = b.dataset.venue === "swap" ? hashFor(away.slug, home.slug, mode, null) : hashFor(home.slug, away.slug, b.dataset.venue, null);
  };
  wire(view, home, away, mode, partial);
}

function outcomeBulbs(p, home, away) {
  const top = Math.max(...p);
  return `<div class="wi-ob">${[[p[0], short(home)], [p[1], "Draw"], [p[2], short(away)]].map(([x, label]) =>
    `<div><i style="background:${bulb(x, top)}"></i><b>${Math.round(x * 100)}%</b><span>${esc(label)}</span></div>`).join("")}</div>`;
}

function firstLegFrame(home, away) {
  const s = state.played;
  const step = (i) => `<span class="wi-step"><button type="button" data-step="${i}:-1" aria-label="One fewer goal for ${esc(i ? away.name : home.name)}">−</button><b>${s ? s[i] : 0}</b><button type="button" data-step="${i}:1" aria-label="One more goal for ${esc(i ? away.name : home.name)}">+</button></span>`;
  return `<fieldset class="frame"><legend>First leg</legend>
    <div class="wi-fl"><button type="button" class="chip" id="wi-played" aria-pressed="${!!s}">Already played</button>
      ${s ? `<span class="wi-score">${esc(short(home))} ${step(0)} – ${step(1)} ${esc(short(away))}</span>` : ""}</div>
    <p class="note">${s ? "The chances cover the second leg, from this first-leg score." : `Enter a first-leg score at ${esc(short(home))} to play only the second leg.`}</p></fieldset>`;
}

function throughFrame(ko, home, away, mode) {
  const s = ko.split;
  const tone = (pct, ink) => `color-mix(in srgb, var(${ink}) ${pct}%, var(--bulb-off))`;
  const segs = [
    [s.team1[0], tone(100, "--amber"), `${short(home)} ${mode === "final" ? "in 90 minutes" : "on aggregate"}`],
    [s.team1[1], tone(62, "--amber"), `${short(home)} in extra time`],
    [s.team1[2], tone(34, "--amber"), `${short(home)} on penalties`],
    [s.team2[2], tone(34, "--ink-2"), `${short(away)} on penalties`],
    [s.team2[1], tone(62, "--ink-2"), `${short(away)} in extra time`],
    [s.team2[0], tone(100, "--ink-2"), `${short(away)} ${mode === "final" ? "in 90 minutes" : "on aggregate"}`],
  ];
  const pc = (x) => `${(x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0)}%`;
  const keys = [...ko.aggregate.keys()].filter((d) => Math.abs(d) <= 4).sort((a, b) => a - b);
  const top = Math.max(...keys.map((d) => ko.aggregate.get(d)));
  const label = mode === "final" ? "Goal difference after 90 minutes" : "Aggregate goal difference";
  return `<fieldset class="frame"><legend>Who goes through</legend><div class="wi-two">
    <div><h3>${esc(short(home))} ${pc(ko.p)} · ${esc(short(away))} ${pc(1 - ko.p)}</h3>
      <div class="wi-split" role="img" aria-label="${segs.map(([p, , t]) => `${t} ${pc(p)}`).join(", ")}">${segs.map(([p, c, t]) =>
        `<i style="width:${p * 100}%;background:${c}" data-tip="${esc(t)}: ${pc(p)}"></i>`).join("")}</div>
      <ul class="wi-key">${segs.map(([p, c, t]) => `<li><em style="background:${c}"></em>${esc(t)} <b>${pc(p)}</b></li>`).join("")}</ul></div>
    <div><h3>${label} · ${esc(short(home))}'s side</h3>
      <div class="wi-agg" role="img" aria-label="${keys.map((d) => `${d > 0 ? "+" : ""}${d}: ${pc(ko.aggregate.get(d))}`).join(", ")}">${keys.map((d) =>
        `<div class="${d > 0 ? "w" : d === 0 ? "z" : ""}" data-tip="${d > 0 ? "+" : ""}${d}: ${pc(ko.aggregate.get(d))}"><i style="height:${(ko.aggregate.get(d) / top) * 80}px"></i>${d > 0 ? "+" + d : d}</div>`).join("")}</div>
      <p class="note">Level goes to extra time, then penalties.</p></div>
  </div></fieldset>`;
}

function forecastFrame(legs, home, away, mode) {
  const g = legs[state.leg], gh = bySlug[g.home], ga = bySlug[g.away];
  const m = markets(g.grid), top = m.top[0][2];
  const pc = (x) => `${Math.round(x * 100)}%`;
  const legend = mode === "legs" ? "Each leg" : mode === "final" ? "The 90 minutes" : "The forecast";
  const chips = mode === "legs" ? `<div class="chips wi-legs" role="group" aria-label="Leg">${legs.map((leg, i) =>
    `<button type="button" class="chip" data-leg="${i}" aria-pressed="${i === state.leg}"${i === 0 && state.played ? " disabled" : ""}>${i ? "2nd" : "1st"} leg · at ${esc(short(bySlug[leg.home]))}${i === 0 && state.played ? ` <span>${state.played.join("–")}</span>` : ""}</button>`).join("")}</div>` : "";
  const cell = (i, j) => {
    const p = i === 5 ? g.grid.slice(5).reduce((s, row) => s + (j === 5 ? row.slice(5).reduce((a, b) => a + b, 0) : row[j]), 0)
      : j === 5 ? g.grid[i].slice(5).reduce((a, b) => a + b, 0) : g.grid[i][j];
    const label = `${i === 5 ? "5+" : i}–${j === 5 ? "5+" : j}`;
    return `<i style="background:${bulb(p, top)}" data-tip="${label}: ${(p * 100).toFixed(1)}%" aria-label="${label}: ${(p * 100).toFixed(1)}%" role="img">${p >= 0.05 ? Math.round(p * 100) : ""}</i>`;
  };
  return `<fieldset class="frame"><legend>${legend}</legend>${chips}
    ${mode === "single" || mode === "neutral" ? "" : outcomeBulbs(g.p, gh, ga)}
    <div class="wi-cols">
      <div><h3>Likeliest scores</h3><ol class="scores">${m.top.map(([i, j, p], k) =>
        `<li class="${k ? "" : "call"}"><span>${i}–${j}</span><i style="width:${Math.round((p / top) * 100)}%"></i><b>${(p * 100).toFixed(0)}%</b></li>`).join("")}</ol></div>
      <div><h3>Score grid · ${esc(short(gh))} down, ${esc(short(ga))} across</h3>
        <div class="wi-grid"><span></span>${["0", "1", "2", "3", "4", "5+"].map((x) => `<span>${x}</span>`).join("")}
        ${[0, 1, 2, 3, 4, 5].map((i) => `<span>${i === 5 ? "5+" : i}</span>` + [0, 1, 2, 3, 4, 5].map((j) => cell(i, j)).join("")).join("")}</div></div>
      <div><h3>Goals</h3><dl class="wi-kv">
        ${mode === "single" || mode === "neutral" ? "" : `<dt>Expected goals</dt><dd>${m.exp.map((x) => x.toFixed(2)).join(" – ")}</dd>`}
        <dt>Over 2.5 goals</dt><dd>${pc(m.over)}</dd>
        <dt>Both teams score</dt><dd>${pc(m.btts)}</dd>
        <dt>${esc(short(gh))} clean sheet</dt><dd>${pc(m.clean[0])}</dd>
        <dt>${esc(short(ga))} clean sheet</dt><dd>${pc(m.clean[1])}</dd></dl></div>
    </div></fieldset>`;
}

function tweakFrame(home, away, engine, knockout, mode) {
  const t = state.tweaks, neutral = mode === "neutral" || mode === "final";
  const slider = (id, label, value, min, max, step, base, fmt, disabled = false) =>
    `<label class="wi-range"><span>${label}<output id="${id}-out" class="${value === base ? "base" : ""}">${sliderText(value, base, fmt)}</output></span>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" data-base="${base}" data-fmt="${fmt}"${disabled ? " disabled" : ""}></label>`;
  const club = (c, key) => {
    const v = t.clubs[c.slug] || {};
    return `<h3>${crest(c, 24)}${esc(c.name)}</h3>
      ${slider(`wi-${key}-att`, "Attack · goals scored", Math.round((v.attack || 0) * 100), -20, 20, 1, 0, "signed")}
      ${slider(`wi-${key}-def`, "Defence · goals conceded", Math.round((v.defense || 0) * 100), -20, 20, 1, 0, "fewer")}`;
  };
  const elo = Math.round(engine.weights.elo * 100);
  return `<fieldset class="frame" id="wi-tweak-frame"><legend>Tweak</legend>
    <div class="wi-tweak">${club(home, "h")}${club(away, "a")}
      <h3>The game</h3>
      ${slider("wi-home", "Home advantage", Math.round(t.home * 100), 0, 200, 10, 100, "pct", neutral)}
      ${knockout ? slider("wi-pens", `Shootout · ${esc(short(home))} win`, Math.round(t.pens * 100), 20, 80, 1, 50, "pct") : ""}
    </div>
    <div class="chips"><button type="button" class="chip" id="wi-reset"${isTweaked(activeTweaks()) ? "" : " disabled"}>Reset to model</button></div>
    <p class="note">Attack scales the goals a club scores; defence the goals it concedes. They move the goal model only; Elo, ${elo}% of the blend, keeps its rating. Home advantage scales both${neutral ? "; it has no effect on neutral ground" : ""}. Anything off the model's value marks the result as modified.</p></fieldset>`;
}

// "Model" at the model's own value; defence shows the change in goals conceded.
function sliderText(value, base, fmt) {
  if (value === base) return "Model";
  if (fmt === "pct") return `${value}%`;
  const v = fmt === "fewer" ? -value : value;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}%`;
}

function wire(view, home, away, mode, partial) {
  const rerender = (keepTweak = false) => {
    const y = scrollY, focus = document.activeElement?.id;
    renderResults(view, keepTweak);
    scrollTo(0, y);
    if (focus && document.activeElement?.id !== focus) $(focus)?.focus();
  };
  view.querySelectorAll("[data-leg]").forEach((b) => { b.onclick = () => { state.leg = Number(b.dataset.leg); rerender(); }; });
  const played = $("wi-played");
  if (played) played.onclick = () => {
    state.played = state.played ? null : [1, 0];
    history.replaceState(null, "", hashFor(home.slug, away.slug, mode, state.played));
    rerender();
  };
  view.querySelectorAll("[data-step]").forEach((b) => {
    b.onclick = () => {
      const [i, d] = b.dataset.step.split(":").map(Number);
      state.played[i] = Math.max(0, Math.min(9, state.played[i] + d));
      history.replaceState(null, "", hashFor(home.slug, away.slug, mode, state.played));
      rerender();
      view.querySelector(`[data-step="${b.dataset.step}"]`)?.focus();
    };
  });
  if (partial) return;
  const bind = (id, apply) => {
    const input = $(id);
    if (!input) return;
    input.oninput = () => {
      const value = Number(input.value), base = Number(input.dataset.base), out = $(`${id}-out`);
      apply(value);
      out.textContent = sliderText(value, base, input.dataset.fmt);
      out.classList.toggle("base", value === base);
      rerender(true);
    };
  };
  const clubTweak = (slug, field) => (v) => { state.tweaks.clubs[slug] = { ...(state.tweaks.clubs[slug] || {}), [field]: v / 100 }; };
  bind("wi-h-att", clubTweak(home.slug, "attack"));
  bind("wi-h-def", clubTweak(home.slug, "defense"));
  bind("wi-a-att", clubTweak(away.slug, "attack"));
  bind("wi-a-def", clubTweak(away.slug, "defense"));
  bind("wi-home", (v) => { state.tweaks.home = v / 100; });
  bind("wi-pens", (v) => { state.tweaks.pens = v / 100; });
  $("wi-reset").onclick = () => {
    state.tweaks = { clubs: {}, home: NO_TWEAKS.home, pens: NO_TWEAKS.pens };
    rerender();
    $("wi-reset").focus();
  };
  $("wi-roll").onclick = () => { $("wi-rolled").innerHTML = playIt(current); };
}

function playIt({ legs, ko, home, away, mode }) {
  const board = (h, a, sh, sa, label) => `<div class="wi-board" role="img" aria-label="${esc(label)}">
    ${crest(bySlug[h], 36)}<b>${sh}</b><span>–</span><b>${sa}</b>${crest(bySlug[a], 36)}</div>`;
  if (!ko) {
    const [h, a] = sampleScore(legs[0].grid);
    return `${board(home.slug, away.slug, h, a, `${home.name} ${h}, ${away.name} ${a}`)}
      <p class="note">This score had a ${(legs[0].grid[h][a] * 100).toFixed(1)}% chance. Press again for another.</p>`;
  }
  const scores = legs.map((leg, i) => (i === 0 && leg.played ? leg.played : sampleScore(leg.grid)));
  let agg = 0;
  legs.forEach((leg, i) => { agg += (scores[i][0] - scores[i][1]) * (leg.home === home.slug ? 1 : -1); });
  let decided = agg > 0 ? home : agg < 0 ? away : null, how = mode === "final" ? "in 90 minutes" : "on aggregate";
  let extra = "";
  if (!decided) {
    const last = legs[legs.length - 1];
    const eh = samplePoisson(last.rates[0] / 3), ea = samplePoisson(last.rates[1] / 3);
    extra = `<p class="wi-et">Extra time ${eh}–${ea}</p>`;
    if (eh !== ea) { decided = (eh > ea) === (last.home === home.slug) ? home : away; how = "in extra time"; }
    else { decided = Math.random() < state.tweaks.pens ? home : away; how = "on penalties"; }
  }
  const boards = legs.map((leg, i) => `<div><span class="wi-leg">${mode === "final" ? "Final" : `${i ? "2nd" : "1st"} leg${i === 0 && leg.played ? " · played" : ""}`}</span>
    ${board(leg.home, leg.away, scores[i][0], scores[i][1], `${bySlug[leg.home].name} ${scores[i][0]}, ${bySlug[leg.away].name} ${scores[i][1]}`)}</div>`).join("");
  return `<div class="wi-boards">${boards}</div>${extra}<p class="wi-won"><b>${esc(decided.name)}</b> go through ${how}.</p><p class="note">Press again for another.</p>`;
}
