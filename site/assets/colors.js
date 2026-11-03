// Line colours. Charts of clubs use each club's own colours, tuned to read on the dark ground (and darkened
// until they read on the light one); a club's second
// colour (or a neutral spare) stands in when its first is too close to a club already on the chart. Charts of
// other series (model against baselines, actual against expected) use the three SERIES colours in order.

export const SERIES = ["var(--amber)", "var(--series-2)", "var(--series-3)"];

// football-data.org id: [first colour, second colour]
const CLUB = {
  // Premier League
  57: ["#ef3b33", "#e8c35a"], 65: ["#6cabdd", "#f2f2f2"], 64: ["#d6232f", "#1fbf8f"], 66: ["#e0301e", "#f7d83b"],
  61: ["#3f6fe0", "#d1d3d4"], 73: ["#f2f2f2", "#7d8fd6"], 67: ["#c8c8c8", "#41b6e6"], 58: ["#b8406a", "#95bfe5"],
  397: ["#3d7fdb", "#f2f2f2"], 1044: ["#e0301e", "#c8c8c8"], 402: ["#ea2a2a", "#fbb800"], 354: ["#3b6fd8", "#e3263a"],
  62: ["#3f6ad8", "#f2f2f2"], 63: ["#f2f2f2", "#e04040"], 341: ["#f2f2f2", "#ffcd00"], 351: ["#e52222", "#f2f2f2"],
  71: ["#eb2a3b", "#f2f2f2"], 322: ["#f5a12d", "#f2f2f2"], 1076: ["#59cbe8", "#f2f2f2"], 349: ["#4a6fd2", "#f2f2f2"],
  // La Liga
  81: ["#b4448f", "#3f86e0"], 86: ["#f2f2f2", "#9b7ce0"], 78: ["#e03a3e", "#4a78d8"], 77: ["#ee2523", "#f2f2f2"],
  92: ["#3d78dc", "#f2f2f2"], 94: ["#ffe667", "#3f78d8"], 90: ["#2fb36b", "#f2f2f2"], 559: ["#f2f2f2", "#e0303a"],
  95: ["#f2f2f2", "#ff8a1f"], 558: ["#8ac3ee", "#e5254e"], 79: ["#e02a30", "#5a7fd0"], 87: ["#f2f2f2", "#e53027"],
  82: ["#4a78d8", "#f2f2f2"], 80: ["#3d84dc", "#f2f2f2"], 263: ["#3d78dc", "#f2f2f2"], 285: ["#2fa84f", "#f2f2f2"],
  88: ["#c03a66", "#4a6fd2"], 560: ["#4a78d8", "#f2f2f2"], 5335: ["#2f9e5a", "#f2f2f2"], 84: ["#4a90d9", "#f2f2f2"],
  // Bundesliga
  5: ["#e3263a", "#4a78d8"], 3: ["#e32221", "#c8c8c8"], 4: ["#fde100", "#c8c8c8"], 721: ["#e0284f", "#f2f2f2"],
  10: ["#e32219", "#f2f2f2"], 19: ["#e3141e", "#c8c8c8"], 17: ["#e2001a", "#c8c8c8"], 2: ["#3d78dc", "#f2f2f2"],
  15: ["#ed1c24", "#f2f2f2"], 18: ["#2fa84f", "#f2f2f2"], 28: ["#eb1923", "#ffe500"], 12: ["#2fa05f", "#f2f2f2"],
  16: ["#c84a46", "#5fa06a"], 1: ["#ed1c24", "#f2f2f2"], 7: ["#4a78d8", "#f2f2f2"], 6: ["#3f6ad8", "#f2f2f2"],
  29: ["#4a6fd2", "#c8c8c8"], 719: ["#c8c8c8", "#f2f2f2"],
  // Serie A
  108: ["#3d84dc", "#c8c8c8"], 98: ["#e03030", "#f2f2f2"], 109: ["#f2f2f2", "#f4a6c8"], 113: ["#3ab0e6", "#f2f2f2"],
  100: ["#c4404a", "#f0bc42"], 110: ["#87d8f7", "#f2f2f2"], 102: ["#3d78dc", "#c8c8c8"], 99: ["#9a63d6", "#f2f2f2"],
  103: ["#d0263b", "#5a78d0"], 586: ["#b84050", "#f2f2f2"], 107: ["#c8263d", "#5a78d0"], 7397: ["#3d84dc", "#f2f2f2"],
  115: ["#f2f2f2", "#c8c8c8"], 104: ["#c8263d", "#5a78d0"], 5890: ["#ffd200", "#e3263a"], 112: ["#f2f2f2", "#ffd200"],
  471: ["#2fa84f", "#c8c8c8"], 454: ["#f07c1f", "#2fa84f"], 470: ["#ffd200", "#4a6fd2"], 5911: ["#e3263a", "#f2f2f2"],
  // Ligue 1
  524: ["#3b6fd8", "#e3423f"], 516: ["#3cb4e6", "#f2f2f2"], 548: ["#e5242f", "#f2f2f2"], 523: ["#f2f2f2", "#4a6fd2"],
  521: ["#e0261d", "#5a78d0"], 546: ["#ffd100", "#e3263a"], 522: ["#e3263a", "#c8c8c8"], 529: ["#e2001a", "#c8c8c8"],
  576: ["#3a8be0", "#f2f2f2"], 512: ["#e3263a", "#f2f2f2"], 511: ["#9a63d6", "#f2f2f2"], 525: ["#f58220", "#c8c8c8"],
  1045: ["#4a6fd2", "#8ac3ee"], 519: ["#f2f2f2", "#3a7bd5"], 533: ["#6fb6e8", "#4a6fd2"], 532: ["#f2f2f2", "#c8c8c8"],
  535: ["#e3263a", "#ffd200"], 531: ["#3a7bd5", "#f2f2f2"],
  // other Champions League clubs
  498: ["#2fa84f", "#f2f2f2"], 503: ["#3d78dc", "#f2f2f2"], 674: ["#e3263a", "#f2f2f2"], 675: ["#e3263a", "#f2f2f2"],
  851: ["#3a7bd5", "#c8c8c8"], 610: ["#f2a900", "#c8304a"], 613: ["#f2d300", "#3f6ad8"], 1887: ["#f58220", "#c8c8c8"],
  5721: ["#ffe100", "#c8c8c8"], 930: ["#e3263a", "#f2f2f2"], 1899: ["#ffd200", "#c8c8c8"], 5720: ["#3d78dc", "#f2f2f2"],
  2016: ["#f2f2f2", "#c8c8c8"], 7509: ["#6fb6e8", "#f2f2f2"],
};
// for clubs without their own entry, and when both of a club's colours clash: distinct hues that read on the ground
const SPARE = ["#4a8fe0", "#d55fa0", "#2fb36b", "#f07c1f", "#9a63d6", "#3cb4e6", "#e3263a", "#ffd200", "#f2f2f2", "#c8c8c8"];

/* OKLab distance ×100 between two hex colours: under 15 two lines are hard to tell apart */
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function oklab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const apart = (a, b) => Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i])) * 100;
const MIN_APART = 15; // the normal-vision floor for telling two marks apart
const MIN_CONTRAST = 3; // light ground: the floor for chart marks; club colours never colour text
const MIN_CHROMA = 4; // whites and greys darken to a neutral grey, which reads as a benchmark line
const chroma = (hex) => Math.hypot(...oklab(hex).slice(1)) * 100;

function channels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function luminance(hex) {
  return channels(hex).map((v) => lin(v / 255)).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function darker(hex, bg) {
  const [r, g, b] = channels(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = 0, l = (max + min) / 2;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  for (; l >= 0; l -= 0.01) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const candidate = `#${rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
    if (contrast(candidate, bg) >= MIN_CONTRAST) return candidate;
  }
  return "#24211d";
}

/* on the light ground: a club's readable hues, then its hues darkened until readable, then the same for the spares */
function lightOptions(own, spare, bg) {
  return [...new Set([own, spare].flatMap((set) => {
    const hues = set.filter((c) => chroma(c) >= MIN_CHROMA);
    return [...hues.filter((c) => contrast(c, bg) >= MIN_CONTRAST), ...hues.map((c) => darker(c, bg))];
  }))];
}

/* one colour per club id, in order (the leader first): each club takes the first of its own colours, then the
   spares, that sits far enough from every colour already taken; on the light ground, failing that, the most distinct */
export function clubColors(ids) {
  const light = document.documentElement.dataset.theme === "light";
  const bg = light && getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  const taken = [];
  const nearest = (c) => Math.min(Infinity, ...taken.map((t) => apart(c, t)));
  return ids.map((id) => {
    const hash = Math.abs(Number(id) || 0) % SPARE.length;
    const own = CLUB[id] || [SPARE[hash]];
    const spare = [...SPARE.slice(hash), ...SPARE.slice(0, hash)];
    const options = light ? lightOptions(own, spare, bg) : [...own, ...spare];
    const color = options.find((c) => nearest(c) >= MIN_APART)
      || (light ? options.reduce((best, c) => (nearest(c) > nearest(best) ? c : best)) : options[0]);
    taken.push(color);
    return color;
  });
}
