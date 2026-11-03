# Floodlight light mode

Status: implemented, 3 November 2026. The site defaults to dark and offers a saved explicit light choice.

## Direction: the scoreboard in daylight

Use warm ivory surfaces, charcoal typography and a deeper amber. Keep Big Shoulders Display, JetBrains Mono, the large dotted hero numeral, the bulb logo, compact tables and legends cut into frame borders. Preserve the current density, layout and short state transitions.

The light version should feel like the same stadium board viewed during the day. Surfaces stay flat, edges square and rules warm grey. Avoid cream-heavy vintage styling, texture, shadows or a new accent palette. All main surfaces become light, including the header and hero.

The existing `DESIGN.md` says “Dark only, by request.” This proposal adds an optional appearance; adopting it should update that sentence and document both token sets. It does not replace the accepted site/model architecture.

## Proposed colours

Reuse the existing CSS custom properties. Dark values remain as shipped.

| Token | Light candidate | Role |
| --- | --- | --- |
| `--bg` | `#F4F1EB` | Warm ivory page |
| `--panel` | `#FCFAF6` | Slightly lighter frames and sticky cells |
| `--bulb-off` | `#E5DED3` | Unlit probability bulbs |
| `--rule` | `#B7AC9E` | Frame borders and structural rules |
| `--rule-2` | `#E0D8CD` | Quiet row separators |
| `--ink` | `#24211D` | Main text |
| `--ink-2` | `#585149` | Supporting text |
| `--dim` | `#71685E` | Captions and metadata |
| `--amber` | `#A45C16` | Hero numeral, bulbs and selected marks |
| `--amber-t` | `#895019` | Small amber labels and links |
| `--red` | `#B23632` | Relegation, elimination and negative results |
| `--green`, `--green-t` | `#287739` | Called results and positive movement |
| `--draw` | `#626A75` | Draws and neutral result marks |
| `--series-2` | `#2466A6` | Second non-club series |
| `--series-3` | `#A43E78` | Third non-club series |

Calculated sRGB contrast on the proposed page / panel: main text **14.22 / 15.37**, secondary text **6.93 / 7.49**, captions **4.85 / 5.24**, amber text **5.78 / 6.25**. Solid amber marks are **4.52 / 4.89**. The current pale amber is only **1.82 / 1.96** on these surfaces, so carrying it over directly would lose readability.

These are solid colour-pair calculations, not a claim that the complete interface passes accessibility checks. Opacity, mixtures, dotted masks and overlapping states still need rendered review. Aim for 4.5:1 for ordinary text and 3:1 for essential graphical marks and control indicators against adjacent colours. Decorative separators need not meet the latter target. See [W3C text contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum) and [non-text contrast](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast).

## Component treatment

- **Hero and logo:** keep the same dot geometry and hierarchy; deep amber takes the place of emitted light. Remove the status lamp's glow in light mode. The favicon can retain its existing self-contained dark tile.
- **Probability bulbs:** preserve the values, current relative scale, exponent and cutoffs in `core.js`. In light mode, stronger probabilities gain amber density against the pale unlit bulb. Percentages and labels remain the precise reading; colour is supplementary. Review 0, 1, 5, 25, 50, 75 and 100% samples on both surfaces. Ordered intensity should remain monotonic (Munzner, *Visualization Analysis & Design*, 2014).
- **Tables and controls:** retain opaque sticky cells and visibly selected rows/chips. Use a separate on-accent foreground token for filled rank plates and buttons rather than assuming the page colour is suitable everywhere. Tokenize the hardcoded off-state, scatter-dot and hover colours in `style.css`. Check essential control boundaries separately from decorative frame rules.
- **Club charts:** preserve the current dark palette. For light mode, first try a club's secondary colour when its primary is too pale, then a restrained darker version or a checked spare. Real Madrid white, Dortmund yellow and Marseille light blue need explicit review. Extend `clubColors()` to check contrast against the actual plotting surface as well as the existing pairwise OKLab distance. Coloured small text must also meet text contrast. Keep solid lines, names, keyed legends and the existing focus/isolation behaviour; do not introduce dashed club series. Check colour-vision simulations rather than treating OKLab distance as a colour-blindness guarantee (Ware, *Information Visualization*, 2004).
- **Crests:** keep the original full-colour artwork, proportions and transparent containers. Inspect white and outlined artwork on both surfaces; do not globally invert, tint or filter crests.
- **Pitches and activity maps:** ordinary shot/squad pitches follow the light panel and receive readable pitch markings. Keep the established activity-map colour scale and meaning; its pitch lines and markers use strong charcoal overlays in light mode, reviewed over the rendered gradient. Yellow cards remain yellow with a readable dark outline. Do not repurpose semantic red/green.
- **Downloadable cards:** export the currently selected appearance. The canvas exporter already reads CSS tokens when drawing; check filled plates, mixed bulbs and glows in the light output. No separate export-theme control in this change.

## Appearance control

Use one small, borderless sun/moon icon button, as requested on 3 November. One click switches directly between Dark and Light. There is no dropdown, visible text label or System option. Show a crescent moon in Light mode (switch to Dark) and a sun in Dark mode (switch to Light). Use an 18px outline icon in the global header utility area beside freshness information; keep it on the logo row on phones without displacing the section tabs.

Recommended initial behaviour: keep **Dark** as the default for visitors without a saved choice, preserving the current launch identity. Remember the choice in `localStorage` under `floodlight-theme`; unavailable or invalid storage falls back safely to Dark. Do not follow OS theme changes. Give the native button a changing accessible name and tooltip: “Switch to light mode” or “Switch to dark mode”. Preserve keyboard activation and visible focus, with a 32px desktop hit area expanding to 44px on touch devices while the icon stays 18px. This keeps the control visually minimal and easy to activate (Fitts's law; Nielsen #3 user control).

Apply the saved/resolved appearance before the first paint with a small guarded script in `index.html`, before the stylesheet. Use an HTML `data-theme` attribute, the matching CSS `color-scheme`, and update the browser's `theme-color`. [MDN documents the distinction between browser control styling and the preferred colour scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme).

Changing appearance must retain the route, scroll position, keyboard focus, selected competition/day, expanded rows, comparison club and Backtest inputs. It must not refetch forecast data or replay hero animations. Update token-driven SVG/CSS directly and redraw only visuals with concrete colour values or generated pixels. Do not call the full router merely to recolour charts.

## Implementation sequence

1. **Tokens and representative screens.** Add the light override in `site/assets/style.css`; replace the few hardcoded presentation colours and introduce on-accent/control tokens only where needed. Review a league table, match report and club profile. Record the approved tokens and component exceptions in `DESIGN.md`.
2. **Preference and repainting.** Add the early preference script and accessible sun/moon button in `site/index.html`, with a small appearance module for events if useful. Integrate through `main.js` without rebuilding unrelated UI. Adapt `colors.js` and its consumers (`race.js`, `clubs.js`, `match.js`) as required; audit `squad.js`, `cards.js` and the generated activity map.
3. **Whole-site verification.** Exercise all six competitions, Champions League bracket, Matches, pre/post-match reports, Clubs/comparison/Squad, Model/scorecard and the optional Backtest view. Validate both themes, exports and switching while controls are in use.

Keep the implementation in the existing HTML/CSS/JavaScript structure. Forecast probabilities, JSON contracts, data history, calibration and deployment feature switches are outside this change. No frontend framework or new dependency is needed.

## Acceptance checks

- Inspect desktop and phone layouts at 1280px, 768px, 375px and 320px; include fallback fonts, long club names, 200% zoom, sticky cells, tooltips, empty/error states and reduced motion.
- Verify text/mark contrast and colour-vision behaviour on real charts. Check light amber's limited contrast headroom, filled plates, low-probability bulbs, pale club series, crests, pitch overlays and yellow-card icons.
- Toggle Dark → Light → Dark on an open chart and expanded match; check the icon, accessible name and tooltip after each click and keyboard activation. Reload a deep link and verify the saved choice. Check blocked storage, the first paint, native controls and browser chrome; OS preference changes must not override the choice.
- Confirm chart values and all filters/inputs stay unchanged. Compare light/dark PNG exports for legible text, crest rendering and opaque backgrounds.
- Run the existing data validator and browser check. The current browser check does not prove theme persistence or visual contrast; exercise those explicitly with browser automation/manual review. New Python tests require a separate explicit request under the repository rules.

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/validate_site_data.py --data site/data
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/check_site.py --site site
git diff --check
```

Verification: the published-data validator passed for 651 site files. The existing headless browser traversal passed in Dark and Light across all six competitions, match views, club comparison and Squad, Model, the optional Backtest fixture, and generated PNG cards at 1280px and 375px; all 12 backtest parity cases passed in each run. Full-time PNGs were compared in both themes for readable text, crests, bulbs and opaque backgrounds. Separate browser checks verified dark default, early saved-theme application, persistence, invalid and blocked storage, keyboard activation, no OS following, and preservation of focus, scroll, route and expanded/selected UI. Desktop/tablet/phone layouts were inspected at 1280, 768, 375 and 320px with no horizontal overflow. A representative light title-race chart was inspected with protanopia, deuteranopia and tritanopia simulations; this is not an exhaustive colour-vision review. The UEFA activity map was reviewed in both themes with its original green–yellow–red scale; light pitch markings and yellow-card outlines were checked on screen. The browser check does not cover 200% zoom.
