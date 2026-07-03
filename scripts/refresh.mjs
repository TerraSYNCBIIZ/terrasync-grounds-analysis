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
 * Every replacement is anchored and THROWS if the anchor is missing, so a
 * drifted template fails loudly instead of shipping half-updated numbers.
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

function replaceOnce(anchor, from, to) {
  if (!html.includes(from)) throw new Error(`Anchor not found: ${anchor}`);
  html = html.replace(from, to);
}

/* ── Derived facts ──────────────────────────────────────────────────────── */
const field = models.filter((m) => m.tier === "field");
const byC = [...field].sort((a, b) => a.c - b.c);
const cheapest = byC[0];
const runnerUp = byC[1];
const strongest = field.reduce((a, b) => (b.s > a.s ? b : a));
const biggest = field
  .filter((m) => m.mode === "leave-behind")
  .reduce((a, b) => (b.ac > a.ac ? b : a));
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
{
  const m = html.match(/const D=\[\n[\s\S]*?\n\];/);
  if (!m) throw new Error("Anchor not found: const D=[ ... ];");
  html = html.replace(m[0], `const D=[\n${rows}\n];`);
}

/* ── 2. Subtitle / provenance ───────────────────────────────────────────── */
replaceOnce(
  "subtitle",
  /<p class="sub">[\s\S]*?<\/p>/.exec(html)?.[0] ?? "«sub»",
  `<p class="sub">${models.length} models across Kress, Husqvarna, and NEXMOW, with their Velocity product images. Daily coverage = 12-hour mowing cycle (the fleet optimizer&rsquo;s planning basis); drop-and-go models are rated on their documented route. Cost is amortized over a 5-year life and a 32-week season. Generated ${provenance.generatedAt} from Velocity production <code>mowerCatalog.ts</code> @ <code>${provenance.headCommit}</code>.</p>`,
);

/* ── 3. The three verdict cards ─────────────────────────────────────────── */
replaceOnce(
  "cheapest card title",
  `<div style="font-size:18px; font-weight:500;">Husqvarna 580 / 580L EPOS</div>`,
  `<div style="font-size:18px; font-weight:500;">${cheapest.brand} ${cheapest.name}</div>`,
);
replaceOnce(
  "cheapest card body",
  `$3.70 per acre per day amortized (5 yr), and best value per dollar (875). 440 iQ ($3.84) is the residential pick.`,
  `${usd2(cheapest.c)} per acre per day amortized (5 yr), and best value per dollar (${cheapest.v}). ${runnerUp.name} (${usd2(runnerUp.c)}) is next.`,
);
replaceOnce(
  "output card body",
  `~7 ac in one ~7-hr route at 43,560 sq ft/hr — mows straight, no charging. A different class than leave-behind.`,
  `~${strongest.acPerDay} ac in one ~7-hr route at ${strongest.sqftHr.toLocaleString()} sq ft/hr — mows straight, no charging. A different class than leave-behind.`,
);
replaceOnce(
  "acreage card body",
  `5 ac/day fully autonomous (24/7, no operator), fairway, $7.86/ac·day — fewest machines for a big site.`,
  `${biggest.acPerDay} ac/day fully autonomous (24/7, no operator), fairway, ${usd2(biggest.c)}/ac·day — fewest machines for a big site.`,
);

/* ── 4. Cost footnote + legend ──────────────────────────────────────────── */
replaceOnce(
  "cost footnote",
  / &middot; Voyager re-based to its ~7-hr drop-and-go route \(7 ac, no charging\) &middot; 550\/550H = \$5,899\.99 \(Husqvarna MSRP\)\. <span style="color:var\(--text-muted\);">Spread: 24&times; price, 56&times; capacity\.<\/span>/.exec(
    html,
  )?.[0] ?? "«footnote»",
  ` &middot; Voyager rated on its ~7-hr drop-and-go route (${strongest.acPerDay} ac, no charging) &middot; prices = Velocity catalog MSRP. <span style="color:var(--text-muted);">Spread: ${priceSpread}&times; price, ${capSpread}&times; capacity.</span>`,
);
replaceOnce(
  "legend",
  ` <i class="ti ti-antenna" style="font-size:12px;" aria-hidden="true"></i> = commercial EPOS, price all-in incl. $900 site reference station.`,
  ``,
);
replaceOnce(
  "claimed footnote",
  `NEXMOW M2* is develop-only.`,
  `* = manufacturer-claimed specs, not yet field-verified.`,
);

writeFileSync(HTML, html);
console.log(
  `index.html refreshed — ${models.length} models @ Velocity ${provenance.headCommit} (${provenance.generatedAt}). Cheapest: ${cheapest.name} ${usd2(cheapest.c)} · value ${cheapest.v}.`,
);
