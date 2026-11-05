// Router: #<competition> (tables), #matches[/YYYY-MM-DD], #match/<competition>/<fixture id>, #clubs[/<club>[/squad | /vs/<club>]], #model[/<section>], #backtest[/<encoded strategy>], #whatif[/<home>/<away>/<mode>[/<first leg>]].
import { COMPS, $, loadCrests, loadRun } from "./core.js";
import { BACKTEST_ENABLED } from "./features.js";
import { showTables } from "./tables.js";
import { showMatches } from "./matches.js";
import { showClubs } from "./clubs.js";
import { showModel } from "./model.js";
import { showMatch } from "./match.js";
import { showWhatIf } from "./whatif.js";

const VIEWS = ["tables", "matches", "clubs", "model", "match", "backtest", "whatif"];
const THEME_KEY = "floodlight-theme";
let lastComp = COMPS[0].slug;
let lastView = null;
let lastArg = null;

function setTheme(theme, save = false) {
  const resolved = theme === "light" ? "light" : "dark";
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]').content = resolved === "light" ? "#F4F1EB" : "#131312";
  const action = resolved === "light" ? "Switch to dark mode" : "Switch to light mode";
  const button = $("theme-toggle");
  button.setAttribute("aria-label", action);
  button.title = action;
  if (save) {
    try { localStorage.setItem(THEME_KEY, resolved); } catch { /* Keep this page usable when storage is blocked. */ }
  }
  window.dispatchEvent(new CustomEvent("floodlight-theme-change", { detail: { theme: resolved } }));
}

$("theme-toggle").addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light", true);
});
window.addEventListener("storage", (event) => {
  if (event.key === THEME_KEY) setTheme(event.newValue, false);
});
setTheme(document.documentElement.dataset.theme);

$("tabs").querySelector('[data-view="backtest"]').hidden = !BACKTEST_ENABLED;

function route() {
  const [head = "", arg = "", sub = "", extra = ""] = location.hash.slice(1).split("/");
  if (head === "backtest" && !BACKTEST_ENABLED) {
    history.replaceState(null, "", `#${lastComp}`);
    route();
    return;
  }
  const view = VIEWS.includes(head) && head !== "tables" ? head : "tables";
  if (view === "tables") lastComp = COMPS.some((c) => c.slug === head) ? head : COMPS[0].slug;
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
  // A match page belongs to Matches.
  const tab = view === "match" ? "matches" : view;
  $("tabs").querySelectorAll("a").forEach((a) => a.setAttribute("aria-current", String(a.dataset.view === tab)));
  $("tabs").querySelector('[data-view="tables"]').href = `#${lastComp}`;
  $("subnav").hidden = view !== "tables";
  if (view === "tables") renderSubnav();
  // A new view, club or fixture starts at the top; stepping through match days or changing a club comparison keeps the place.
  const key = view === "clubs" ? arg : `${arg}/${sub}/${extra}`;
  if (view !== lastView || (["clubs", "model", "match", "backtest"].includes(view) && key !== lastArg)) window.scrollTo(0, 0);
  lastView = view;
  lastArg = key;
  if (view === "tables") showTables(lastComp);
  else if (view === "matches") showMatches(arg);
  else if (view === "match") showMatch(arg, sub);
  else if (view === "clubs") showClubs(arg, sub === "vs" ? extra : "", sub === "squad");
  else if (view === "whatif") showWhatIf(location.hash.slice(1).split("/").slice(1));
  else if (view === "backtest") import("./backtest.js").then(({ showBacktest }) => {
    if (location.hash.split("/")[0] === "#backtest") showBacktest();
  });
  else showModel(arg);
}

function renderSubnav() {
  $("nav").innerHTML = COMPS.map((c) =>
    `<a href="#${c.slug}" aria-current="${c.slug === lastComp}">${c.label}</a>`).join("");
  const on = $("nav").querySelector('[aria-current="true"]');
  if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
}

Promise.all([
  loadCrests().catch(() => { /* Club names remain usable if the crest manifest is unavailable. */ }),
  loadRun().catch(() => { /* Each page falls back to its own run time. */ }),
]).finally(() => {
  window.addEventListener("hashchange", route);
  route();
});
