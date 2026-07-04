/**
 * Refresh the standalone call-asset from the Grounds Index generated data.
 *
 * Reads terrasync-web/src/lib/benchmarks/grounds-index.generated.json (which
 * `npm run generate:grounds-index` in terrasync-web builds from the Velocity
 * production catalog) and surgically rewrites index.html: data rows, the
 * three verdict cards, subtitle provenance, and footnotes. Layout, embedded
 * product images, and chart code are untouched.
 *
 * Run:  node scripts/refresh.mjs        (then commit + push → Pages rebuilds)
 *
 * Replacements are anchored on page STRUCTURE (card labels, the D array),
 * not on current copy — so the script is safely re-runnable. Missing
 * structural anchors throw instead of shipping half-updated numbers.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = resolve(__dirname, "../index.html");
const INDEX = resolve(
  process.env.TERRASYNC_WEB ?? "C:/Users/hello/repos/terrasync-web",
  "src/lib/benchmarks/grounds-index.generated.json",
);

const { models, provenance } = JSON.parse(readFileSync(INDEX, "utf8"));
let html = readFileSync(HTML, "utf8");

function replaceRe(anchor, re, to) {
  if (!re.test(html)) throw new Error(`Anchor not found: ${anchor}`);
  html = html.replace(re, to);
}

/* ── Derived facts ──────────────────────────────────────────────────────── */
const field = models.filter((m) => m.tier === "field");
const byC = [...field].sort((a, b) => a.c - b.c);
const cheapest = byC[0];
const runnerUp = byC[1];
const strongest = field.reduce((a, b) => (b.s > a.s ? b : a), field[0]);
const biggest = field
  .filter((m) => m.mode === "leave-behind")
  .reduce((a, b) => (b.acPerDay > a.acPerDay ? b : a));
const bestOutput = field.reduce((a, b) => (b.sqftHr > a.sqftHr ? b : a));
const priceSpread = Math.round(
  Math.max(...models.map((m) => m.msrp)) / Math.min(...models.map((m) => m.msrp)),
);
const capSpread = Math.round(
  Math.max(...models.map((m) => m.acPerDay)) / Math.min(...models.map((m) => m.acPerDay)),
);
const usd2 = (n) => `$${n.toFixed(2)}`;

/* ── 1. Data rows (between `const D=[` and `];`) ────────────────────────── */
const starName = (m) => (m.tier === "claimed" ? `${m.name}*` : m.name);
const rows = models
  .map(
    (m) =>
      `{n:${JSON.stringify(starName(m))},b:${JSON.stringify(m.brand)},l:${JSON.stringify(m.klass)},w:${m.cutW},ac:${m.acPerDay},s:${m.sqftHr},sl:${JSON.stringify(m.slopeLabel)},mb:${m.msrp},m:${m.msrp},st:false,f:${m.fairway},v:${m.v},c:${m.c}}`,
  )
  .join(",\n");
replaceRe("const D=[...]", /const D=\[\n[\s\S]*?\n\];/, `const D=[\n${rows}\n];`);

/* ── 2. Subtitle / provenance ───────────────────────────────────────────── */
replaceRe(
  "subtitle",
  /<p class="sub">[\s\S]*?<\/p>/,
  `<p class="sub">${models.length} models across Kress, Husqvarna, and NEXMOW, with their Velocity product images. Daily coverage = 12-hour mowing cycle; commercial EPOS &amp; CEORA on Husqvarna&rsquo;s 24-hour basis; drop-and-go on their documented route. Cost is amortized over a 5-year life and a 32-week season. Generated ${provenance.generatedAt} from Velocity production <code>mowerCatalog.ts</code> @ <code>${provenance.headCommit}</code>.</p>`,
);

/* ── 3. The three verdict cards (anchored on their label spans) ─────────── */
function card(labelPattern, anchor, title, body) {
  replaceRe(
    anchor,
    new RegExp(
      `(>${labelPattern}</span></div>\\s*<div style="font-size:18px; font-weight:500;">)[^<]*(</div>\\s*<div style="font-size:13px; color:var\\(--text-secondary\\); margin-top:4px;">)[^<]*(</div>)`,
    ),
    `$1${title}$2${body}$3`,
  );
}

card(
  "Cheapest to run",
  "cheapest card",
  `${cheapest.brand} ${cheapest.name}`,
  `${usd2(cheapest.c)} per acre per day amortized (5 yr, 24-h EPOS basis). ${runnerUp.name} (${usd2(runnerUp.c)}) is next; best value per dollar is the ${field.reduce((a, b) => (b.v > a.v ? b : a)).name} (${field.reduce((a, b) => (b.v > a.v ? b : a)).v}).`,
);
card(
  "Highest output \\(Drop-and-Go\\)",
  "output card",
  `${bestOutput.brand} ${bestOutput.name}`,
  `~${bestOutput.acPerDay} ac in one ~7-hr route at ${bestOutput.sqftHr.toLocaleString()} sq ft/hr — mows straight, no charging. A different class than leave-behind.`,
);
card(
  "Most acreage, autonomous",
  "acreage card",
  `${biggest.brand} ${biggest.name}`,
  `${biggest.acPerDay} ac/day fully autonomous (24/7, no operator)${biggest.fairway ? ", fairway" : ""}, ${usd2(biggest.c)}/ac·day — fewest machines for a big site.`,
);

/* ── 4. Cost footnote (structure: the "Cost =" line) ────────────────────── */
replaceRe(
  "cost footnote",
  /<span style="color:var\(--text-muted\);">Cost =<\/span>[\s\S]*?<\/p>/,
  `<span style="color:var(--text-muted);">Cost =</span> amortized $/acre/day (price &divide; [5 yr &times; 32-wk season &times; 7 days &times; daily acres]) &middot; commercial EPOS &amp; CEORA on the 24-h basis (2&times; cycle rating, hourly throughput unscaled) &middot; Voyager on its ~7-hr drop-and-go route &middot; prices = Velocity catalog MSRP. <span style="color:var(--text-muted);">Spread: ${priceSpread}&times; price, ${capSpread}&times; capacity.</span></p>`,
);

writeFileSync(HTML, html);
console.log(
  `index.html refreshed — ${models.length} models @ Velocity ${provenance.headCommit} (${provenance.generatedAt}). Cheapest: ${cheapest.name} ${usd2(cheapest.c)} · most acreage: ${biggest.name} ${biggest.acPerDay} ac.`,
);
