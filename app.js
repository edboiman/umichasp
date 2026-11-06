"use strict";
// ASP Guide: offline phone reference built from a one-time capture.
// Captured text is only ever inserted with textContent (never innerHTML).
// Clinical data files are read-only; presentation adapters retain source runs.

const $ = (id) => document.getElementById(id);
/* ---------- storage (never required) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("asp." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("asp." + k, JSON.stringify(v)); } catch {} },
};

const S = {
  data: null, drugs: [], tax: null, pages: [], byId: new Map(), byPath: new Map(),
  cond: new Map(), res: new Map(), sections: [], drugHits: new Map(), files: [], staff: [],
  orgs: [], orgCats: [], orgHits: new Map(), unitDrugs: new Map(), unitOrgs: new Map(),
  pop: store.get("pop", "all"), saved: new Set(store.get("saved", [])), recent: store.get("recent", []),
  size: store.get("size", 1), searchQ: "",
};

/* ---------- small helpers ---------- */
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false && c !== "") n.append(c);
  return n;
}
const safeUrl = (u) => { try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? p.href : null; } catch { return null; } };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const enc = encodeURIComponent;
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
const blockText = (b) => b.t === "table" ? b.rows.map((r) => r.join(" · ")).join("  ") : b.x || "";
const chev = () => el("span", { class: "chev", "aria-hidden": "true" });
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : /(ch|sh|s|x)$/.test(w) ? "es" : "s"}`;
const termRe = (t) => esc(t).replace(/\\-|\s+|\//g, "[\\s/-]+");

/* ---------- data and indexes ---------- */
async function load() {
  const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
  const [data, drugs, tax, orgs] = await Promise.all([get("data/content.json"), get("data/drugs.json"), get("data/taxonomy.json"),
    get("data/organisms.json").catch(() => ({ categories: [], organisms: [] }))]);
  Object.assign(S, { data, drugs, tax, pages: data.pages || [], orgCats: orgs.categories, orgs: orgs.organisms });
  const sectionRoots = new Set(S.pages.filter((p) => !p.parent && S.pages.some((c) => c.parent === p.path)).map((p) => p.path));
  for (const c of tax.conditions) S.cond.set(c.id, { ...c, re: new RegExp(c.match, "i"), pages: [] });
  for (const r of tax.resources) S.res.set(r.id, { ...r, re: new RegExp(r.match, "i"), pages: [] });

  for (const p of S.pages) {
    S.byId.set(p.id, p);
    if (p.path) S.byPath.set(p.path.toLowerCase(), p);
    if (p.guide) { p._units = guideUnits(p.guide); p._text = p._units.map((u) => u.x); }
    else p._text = p.blocks.map(blockText);
    const key = (p.path || "") + " " + (p.pdf ? p.title : "");
    p.pop = /pediatric|peds|child|neonat|perinatal|nirsevimab|necrotizing/i.test(key + " " + p.title) ? "peds" : "adult";
    p.setting = /\/outpatient\/|ambulatory|amb-|evisit/i.test(key) ? "Outpatient"
      : /surgical-prophylaxis/i.test(key) ? "Surgical" : "Inpatient";
    if (p.path && sectionRoots.has(p.path)) { p.kind = "section"; S.sections.push(p); continue; }
    const c = [...S.cond.values()].find((x) => x.re.test(key));
    if (c) { p.kind = "cond"; p.cond = c.id; c.pages.push(p); continue; }
    const r = [...S.res.values()].find((x) => x.re.test(key)) || S.res.get("other");
    if (r) { p.kind = "res"; p.res = r.id; r.pages.push(p); }
  }
  // Files and staff-only links, gathered from every page.
  const seen = new Set();
  for (const p of S.pages) for (const l of p.links || []) {
    if (!safeUrl(l.href) || seen.has(l.href) || !["file", "staff"].includes(l.kind)) continue;
    seen.add(l.href);
    (l.kind === "file" ? S.files : S.staff).push({ ...l, from: p });
  }
  indexDrugs();
  buildCharts();
  indexOrganisms();
}

// Single pass per block with all drug terms, longest first, so
// "ampicillin-sulbactam" is not also counted as "ampicillin".
function indexDrugs() {
  const terms = [];
  for (const d of S.drugs) for (const t of [d.name, ...d.aliases]) terms.push([t, d]);
  terms.sort((a, b) => b[0].length - a[0].length);
  const re = new RegExp(`(?<![\\w-])(?:${terms.map(([t]) => termRe(t)).join("|")})(?![\\w])`, "gi");
  const exact = terms.map(([t, d]) => [new RegExp(`^${termRe(t)}$`, "i"), d]);
  for (const d of S.drugs) S.drugHits.set(d.name, new Map());
  for (const p of S.pages) {
    if (p.kind === "section") continue;
    const scan = [p.title, ...p._text];
    scan.forEach((txt, i) => {
      for (const m of txt.matchAll(re)) {
        const d = exact.find(([r]) => r.test(m[0]))?.[1];
        if (!d) continue;
        const hits = S.drugHits.get(d.name);
        if (!hits.has(p.id)) hits.set(p.id, { inTitle: false, blocks: [] });
        const h = hits.get(p.id);
        if (i === 0) h.inTitle = true;
        else if (!h.blocks.some((b) => b.b === i - 1)) h.blocks.push({ b: i - 1, term: m[0] });
        if (i > 0) { const k = p.id + ":" + (i - 1); if (!S.unitDrugs.has(k)) S.unitDrugs.set(k, new Set()); S.unitDrugs.get(k).add(d.name); }
      }
    });
  }
}

const popOk = (p) => S.pop === "all" || p.pop === S.pop || p.kind === "section";
const popLabel = (p) => (p.pop === "peds" ? "Pediatric" : "Adult");
const versionLabel = (p) => p.setting === "Inpatient" ? `${popLabel(p)} inpatient` : `${popLabel(p)} ${p.setting.toLowerCase()}`;
const condPages = (c) => c.pages.filter(popOk);
const drugCount = (d) => [...S.drugHits.get(d.name).keys()].filter((id) => popOk(S.byId.get(id))).length;

// Preview of a passage around the search term. The window is widened to whole segments (sentences, bullet items,
// table cells) so a preview never ends in the middle of a qualifier such as "…without endocarditis or meningitis".
function snippet(text, term, len = 140) {
  if (text.length <= len) return text;
  const i = Math.max(0, term ? text.toLowerCase().indexOf(term.toLowerCase()) : 0);
  let start = Math.max(0, Math.min(i - 45, text.length - len)), end = Math.min(text.length, start + len);
  const BRK = /((?<!\b[A-Za-z]{1,2})\. |; | · | \/ |: )/g;   // not after abbreviations such as "S. aureus", "E. coli", "spp."
  const before = [...text.slice(Math.max(0, start - 120), start).matchAll(BRK)].pop();
  if (start > 0) start = before ? Math.max(0, start - 120) + before.index + before[0].length : start;
  BRK.lastIndex = 0;
  const after = BRK.exec(text.slice(end, end + 200));
  end = after ? end + after.index + after[0].trimEnd().length : Math.min(text.length, end + 200);
  return (start ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}
function highlight(text, terms) {
  const ts = (terms || []).filter((t) => t && t.length > 1);
  if (!ts.length) return document.createTextNode(text);
  const frag = document.createDocumentFragment();
  const re = new RegExp(`(${ts.map(termRe).join("|")})`, "gi");
  let last = 0;
  for (const m of text.matchAll(re)) { frag.append(text.slice(last, m.index), el("mark", { text: m[0] })); last = m.index + m[0].length; }
  frag.append(text.slice(last));
  return frag;
}

/* ---------- personal state ---------- */
function toggleSaved(key) { S.saved.has(key) ? S.saved.delete(key) : S.saved.add(key); store.set("saved", [...S.saved]); }
function pushRecent(key) { S.recent = [key, ...S.recent.filter((k) => k !== key)].slice(0, 15); store.set("recent", S.recent); }
function keyItem(k) {
  if (k.startsWith("drug:")) { const d = S.drugs.find((x) => x.name === k.slice(5)); return d && { href: `#/d/${enc(d.name)}`, title: d.name, sub: d.class }; }
  if (k.startsWith("cond:")) { const c = S.cond.get(k.slice(5)); return c && { href: `#/c/${c.id}`, title: c.name, sub: sysName(c.system) }; }
  if (k.startsWith("org:")) { const o = S.orgs.find((x) => x.id === k.slice(4)); return o && { href: `#/o/${o.id}`, title: orgName(o), sub: orgCatName(o.cat) }; }
  const p = S.byId.get(k); return p && { href: `#/p/${enc(p.id)}`, title: p.title, sub: versionLabel(p) };
}
const sysName = (id) => S.tax.systems.find((s) => s.id === id)?.name || "";

/* ---------- shared UI ---------- */
function setBar(title, { back = false, save = null, large = false, textSize = false } = {}) {
  $("bar-title").textContent = large ? "ASP Guide" : title;
  $("bar").classList.toggle("bar-large", large);
  $("back").hidden = !back;
  $("aa").hidden = !textSize;
  const star = $("star");
  star.hidden = !save;
  if (save) {
    const paint = () => { const on = S.saved.has(save); star.setAttribute("aria-pressed", String(on)); star.setAttribute("aria-label", on ? "Remove from saved" : "Save"); };
    paint(); star.onclick = () => { toggleSaved(save); paint(); toast(S.saved.has(save) ? "Saved" : "Removed from saved"); };
  }
}
function syncSavedBtn() { const sv = $("savedbtn"); if (sv) sv.hidden = !$("star").hidden; }
function setTab(t) { document.querySelectorAll(".tabs a").forEach((a) => a.dataset.tab === t ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")); }
function mount(...n) { $("view").replaceChildren(...n.flat(Infinity).filter(Boolean)); }
let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 1400); }

function row({ href, title, sub, right, external, terms }) {
  const a = el("a", { class: "row", href, ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) },
    el("span", { class: "row-main" }, el("span", { class: "row-title" }, typeof title === "string" ? highlight(title, terms) : title),
      sub ? el("span", { class: "row-sub" }, typeof sub === "string" ? highlight(sub, terms) : sub) : null),
    right || null, external ? el("span", { class: "ext", "aria-hidden": "true", text: "↗" }) : chev());
  return el("li", {}, a);
}
const list = (...rows) => el("ul", { class: "list" }, ...rows);
const section = (title, ...kids) => el("section", { class: "sec" }, title ? el("h2", { class: "sec-h", text: title }) : null, ...kids);
const largeTitle = (t, sub) => el("header", { class: "large" }, el("h1", { text: t }), sub ? el("p", { class: "large-sub", text: sub }) : null);

function popSwitch(onchange) {
  const opts = [["all", "All"], ["adult", "Adult"], ["peds", "Pediatric"]];
  const wrap = el("div", { class: "seg", role: "radiogroup", "aria-label": "Patient population" });
  for (const [v, label] of opts) {
    wrap.append(el("button", { type: "button", role: "radio", "aria-checked": String(S.pop === v), class: "seg-btn",
      onclick: () => { S.pop = v; store.set("pop", v); onchange(); } }, label));
  }
  return wrap;
}
function searchField(placeholder, value, oninput, focus) {
  const input = el("input", { type: "search", class: "search", placeholder, value: value || "", "aria-label": placeholder,
    autocomplete: "off", autocorrect: "off", autocapitalize: "none", spellcheck: "false", enterkeyhint: "search" });
  let t; input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => oninput(input.value), 110); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); if (e.key === "Escape") { input.value = ""; oninput(""); } });
  if (focus) setTimeout(() => input.focus({ preventScroll: true }), 60);
  return el("div", { class: "search-wrap" }, input);
}
function popBadges(pages) {
  const has = (f) => pages.some(f);
  return el("span", { class: "badges" },
    has((p) => p.pop === "adult") ? el("span", { class: "pb", title: "Adult", text: "A" }) : null,
    has((p) => p.pop === "peds") ? el("span", { class: "pb pb-p", title: "Pediatric", text: "P" }) : null,
    has((p) => p.setting === "Outpatient") ? el("span", { class: "pb pb-o", title: "Outpatient", text: "OP" }) : null);
}
const emptyState = (title, body) => el("div", { class: "empty-state" }, el("p", { class: "empty-title", text: title }), body ? el("p", { class: "muted", text: body }) : null);

/* ---------- Home ---------- */
function viewHome() {
  setBar("", { large: true }); setTab("home");
  const qa = S.tax.quick.map(({ label, resource }) => {
    const r = S.res.get(resource); const n = r ? r.pages.filter(popOk).length : 0;
    return el("a", { class: "qa", href: `#/r/${resource}` }, el("span", { class: "qa-icon", "aria-hidden": "true", "data-i": resource }),
      el("span", { class: "qa-label", text: label }), el("span", { class: "qa-n", text: plural(n, "page") }));
  });
  qa.push(el("a", { class: "qa", href: "#/conditions" }, el("span", { class: "qa-icon", "aria-hidden": "true", "data-i": "cond" }),
    el("span", { class: "qa-label", text: "All conditions" }), el("span", { class: "qa-n", text: `${[...S.cond.values()].filter((c) => condPages(c).length).length} conditions` })));
  const recents = S.recent.map(keyItem).filter(Boolean).slice(0, 5);
  const alert = S.data.alert && S.data.alert.text;
  mount(
    el("p", {class:"eyebrow",text:"Antimicrobial stewardship"}),
    largeTitle("Clinical reference", `Michigan Medicine guidelines · captured ${fmtDate(S.data.captured_at)}`),
    el("a", { class: "search fake", href: "#/search" }, "Search guidelines & drugs"),
    popSwitch(viewHome),
    alert ? el("a", { class: "alert", href: S.data.alert.path && S.byPath.get(S.data.alert.path.toLowerCase()) ? `#/p/${enc(S.byPath.get(S.data.alert.path.toLowerCase()).id)}` : "#/about" },
      el("strong", { text: "Site alert · " }), alert, S.data.alert.link ? el("span", { class: "alert-link", text: " " + S.data.alert.link + " ›" }) : null) : null,
    section("Browse guidelines", el("div",{class:"browse-grid"},
      el("a",{href:"#/conditions",class:"browse-card"},el("span",{class:"eyebrow",text:"Clinical syndrome"}),el("strong",{},"By condition"),el("span",{class:"muted",text:"Browse infections by body system"}),chev()),
      el("a",{href:"#/organisms",class:"browse-card"},el("span",{class:"eyebrow",text:"Pathogen index"}),el("strong",{},"By organism"),el("span",{class:"muted",text:"Grouped by Gram stain, with a summary of each"}),chev()))),
    section("Quick access", el("div", { class: "qa-grid" }, qa)),
    section("", list(
      row({ href: "#/charts", title: "Flowcharts", sub: `${(S.charts || []).length} charts and algorithm pages` }),
      row({ href: "#/saved", title: "Saved", sub: S.saved.size ? plural(S.saved.size, "saved item") : "Bookmarks and recently viewed" }))),
    recents.length ? section("Recently viewed", list(...recents.map((i) => row(i)))) : null,
    section("", list(row({ href: "#/about", title: "About & disclaimer", sub: S.data.demo ? "Demo data loaded" : `${S.pages.length} pages captured` }))));
}

/* ---------- Conditions ---------- */
function viewConditions(params) {
  setBar("Conditions"); setTab("cond");
  let f = params.get("f") || "";
  const holder = el("div");
  const paint = () => {
    const q = f.trim().toLowerCase();
    const out = [];
    for (const sys of S.tax.systems) {
      const cs = [...S.cond.values()].filter((c) => c.system === sys.id && condPages(c).length &&
        (!q || [c.name, ...c.synonyms].some((x) => x.toLowerCase().includes(q))));
      if (!cs.length) continue;
      out.push(section(sys.name, list(...cs.sort((a, b) => a.name.localeCompare(b.name)).map((c) =>
        row({ href: `#/c/${c.id}`, title: c.name, terms: [q], sub: q && !c.name.toLowerCase().includes(q) ? "Also: " + c.synonyms.find((s) => s.toLowerCase().includes(q)) : null,
          right: popBadges(condPages(c)) })))));
    }
    holder.replaceChildren(...(out.length ? out : [emptyState("No matching conditions", "Try Search to look inside the guideline text.")]));
  };
  paint();
  mount(largeTitle("Conditions", "Browse by infection or clinical syndrome."), browseSwitch("conditions"), searchField("Filter conditions", f, (v) => { f = v; paint(); history.replaceState(null, "", "#/conditions" + (v ? "?f=" + enc(v) : "")); }),
    popSwitch(() => viewConditions(new URLSearchParams(f ? "f=" + f : ""))), holder);
}

function viewCondition(id) {
  const c = S.cond.get(id);
  if (!c) return viewMissing();
  const pages = condPages(c);
  if (pages.length === 1) { history.replaceState(null, "", `#/p/${enc(pages[0].id)}`); return viewPage(pages[0].id, new URLSearchParams()); }
  setBar(sysName(c.system), { back: true, save: "cond:" + c.id }); setTab("cond");
  pushRecent("cond:" + c.id);
  const groups = new Map();
  for (const p of pages.sort((a, b) => a.title.localeCompare(b.title))) {
    const k = versionLabel(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p);
  }
  const order = ["Adult inpatient", "Adult outpatient", "Adult surgical", "Pediatric inpatient", "Pediatric outpatient", "Pediatric surgical"];
  mount(largeTitle(c.name, c.synonyms.length ? c.synonyms.join(" · ") : null),
    popSwitch(() => viewCondition(id)),
    pages.length ? [...groups].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([k, ps]) =>
      section(k, list(...ps.map((p) => row({ href: `#/p/${enc(p.id)}`, title: p.title, sub: p.pdf ? "PDF" : null })))))
      : emptyState(`No ${S.pop === "peds" ? "pediatric" : "adult"} guideline`, "Switch to All to see every version."),
    (() => { const cs = (S.charts || []).filter((x) => pages.includes(x.p)); return cs.length ? section("Flowcharts for this condition", el("ul", { class: "list" }, cs.map(chartRow))) : null; })());
}

/* ---------- Guideline reader ---------- */
function blockLink(b, terms) {
  const text = highlight(b.x, terms);
  const url = b.href && safeUrl(b.href);
  if (!url) return text;
  const u = new URL(url), srcHost = new URL(S.data.source).hostname;
  const inApp = u.hostname === srcHost && S.byPath.get(u.pathname.replace(/\/+$/, "").toLowerCase());
  if (inApp) return el("a", { class: "in-link", href: `#/p/${enc(inApp.id)}` }, text);
  const tag = /policystat|sharepoint|safelinks/.test(u.hostname) ? "Staff only" : /drive\.google|docs\.google/.test(u.hostname) ? "File" : null;
  return el("span", {}, el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, text), tag ? el("span", { class: "tag", text: tag }) : null);
}
function renderBlocks(p, terms, fromPdf = false) {
  const out = []; let ul = null, lastPg = null;
  p.blocks.forEach((b, i) => {
    if (("pg" in b) !== fromPdf) return;
    if (fromPdf && `${b.doc}-${b.pg}` !== lastPg) { lastPg = `${b.doc}-${b.pg}`; ul = null; out.push(el("p", { class: "pg-label", text: `Page ${b.pg}` })); }
    if (b.t !== "li") ul = null;
    if (b.t === "h") {
      if (i === 0 && b.x.trim().toLowerCase() === p.title.trim().toLowerCase()) return;
      out.push(el(`h${Math.min(Math.max(b.l, 2), 4)}`, { class: "rd-h", id: `b${i}`, "data-b": i }, highlight(b.x, terms)));
    } else if (b.t === "p") out.push(el("p", { "data-b": i }, blockLink(b, terms)));
    else if (b.t === "li") {
      if (!ul) { ul = el("ul", { class: "rd-ul" }); out.push(ul); }
      ul.append(el("li", { "data-b": i, class: b.d ? `d${Math.min(b.d, 3)}` : null }, blockLink(b, terms)));
    } else if (b.t === "table" && b.rows.length) {
      const [head, ...body] = b.rows;
      out.push(el("div", { class: "rd-table", "data-b": i, tabindex: "0", role: "region", "aria-label": "Table, scrolls sideways" },
        el("table", {}, el("thead", {}, el("tr", {}, head.map((c) => el("th", {}, highlight(c, terms))))),
          el("tbody", {}, body.map((r) => el("tr", {}, r.map((c) => el("td", {}, highlight(c, terms)))))))));
    }
  });
  return out;
}
/* ---------- native guideline rendering ---------- */
const runsText = (r) => (r || []).map((x) => (x[1] && x[1].includes("s") ? "^" : "") + x[0]).join("");
const plainRuns = (r) => (r || []).map((x) => x[0]).join("");
const parasText = (c) => (c || []).map(plainRuns).filter((t) => t.trim()).join(" / ");  // paragraphs inside one cell or box

// Flatten guideline blocks into searchable units (one per paragraph, bullet, heading, table row).
function guideUnits(g) {
  const units = [];
  g.blocks.forEach((b, gi) => {
    if (b.t === "table") {
      b.rows.forEach((row, ri) => {
        const parts = row.map((c, ci) => { const t = parasText(c); return t && b.head && b.head[ci] ? `${b.head[ci]}: ${t}` : t; }).filter(Boolean);
        units.push({ t: "row", x: parts.join(" · "), gi, ri, cap: b.caption, hide: b.hide });
      });
      (b.shared || []).forEach((sh, si) => units.push({ t: "row", x: (sh.label ? sh.label + ": " : "") + parasText(sh.p), gi, ri: "s" + si, cap: b.caption }));
    } else if (b.t === "flow") {
      let k = 0;
      b.cols.forEach((c) => c.nodes.forEach((n) => units.push({ t: "row", x: (c.head ? c.head + ": " : "") + parasText(n.p), gi, ri: k++, cap: c.head })));
    } else if (b.t === "rec") units.push({ t: "p", x: b.lines.join(" "), gi });
    else if (b.t === "figtext") b.lines.forEach((l, ri) => units.push({ t: "row", x: l, gi, ri, hide: 1 }));
    else if (b.t === "step") units.push({ t: "li", x: [plainRuns(b.r), ...(b.sub || []).map(plainRuns), ...(b.kv || []).map((x) => x.join(": "))].join(" · "), gi });
    else if (b.t === "fn") b.items.forEach(([n, r], ri) => units.push({ t: "row", x: n + " " + plainRuns(r), gi, ri }));
    else if (b.t !== "fig") units.push({ t: b.t, x: (b.n ? b.n + " " : "") + plainRuns(b.r), gi, hide: b.hide });
  });
  return units;
}

function runsEl(runs, terms) {
  const frag = document.createDocumentFragment();
  for (const [t, f = ""] of runs || []) {
    let n = highlight(t, terms);
    if (f.includes("s")) n = el("sup", {}, n);
    if (f.includes("i")) n = el("em", {}, n);
    if (f.includes("b")) n = el("strong", {}, n);
    frag.append(n);
  }
  return frag;
}
const paras = (cell, terms) => (cell || []).map((p) => {
  const t = plainRuns(p).trim();
  if (/^(OR|AND|AND\/OR|PLUS|\+)$/i.test(t)) return el("p", { class: "conj", text: t.toUpperCase() });
  if (/:$/.test(t) && t.length < 70) return el("p", { class: "lbl" }, runsEl(p, terms));
  return el("p", {}, runsEl(p, terms));
});

function isGrid(b) {
  const cols = Math.max(...b.rows.map((r) => r.length), (b.head || []).length);
  const cells = b.rows.flat();
  const avg = cells.reduce((s, c) => s + parasText(c).length, 0) / Math.max(cells.length, 1);
  return cols >= 5 && avg < 28 || cols >= 4 && avg < 14;
}

const tableEl = (...args) => clinicalTable(...args);

function renderGuide(p, terms, genericOnly = false) {
  S.current = p;
  if (!genericOnly) { const layout = gasPresentation(p, terms); if (layout) return layout; }
  const g = p.guide, out = [];
  let ul = null, hiddenPg = null, hiddenBox = null;
  const units = p._units, idx = new Map(units.map((u, i) => [u.ri != null ? `${u.gi}:${u.ri}` : `${u.gi}`, i]));
  const unitOf = (gi, ri) => idx.get(ri != null ? `${gi}:${ri}` : `${gi}`);
  g.blocks.forEach((b, gi) => {
    if (b.t !== "li") ul = null;
    let node = null;
    if (b.t === "fig") {
      hiddenPg = b.pg; hiddenBox = el("div", { class: "rd-body fig-text" });
      out.push(el("figure", { class: "fig", id: `g${gi}` },
        el("a", { href: b.img, target: "_blank", rel: "noopener", class: "fig-open", "aria-label": `Open chart from page ${b.pg} full size` },
          el("img", { src: b.img, width: b.w, height: b.h, loading: "lazy", decoding: "async", alt: `Chart from page ${b.pg} of the original guideline` })),
        el("figcaption", {}, el("span", { text: `Chart from page ${b.pg} of the original.` }), " ",
          el("a", { href: b.img, target: "_blank", rel: "noopener", text: "Open full size ↗" }), " · ",
          el("a", { href: pdfHref(p, b.pg), target: "_blank", rel: "noopener", text: "Original PDF ↗" })),
        el("details", { class: "textver" }, el("summary", {}, "Text in this chart (from the PDF)"), hiddenBox)));
      return;
    }
    if (b.t === "figtext") {
      const box = hiddenBox || el("div");
      b.lines.forEach((l, ri) => box.append(el("p", { "data-u": unitOf(gi, ri) }, highlight(l, terms))));
      return;
    }
    if (b.t === "step") { out.push(stepEl(b, gi, unitOf, terms)); return; }
    if (b.t === "note") { out.push(el("aside", { class: "clinical-note", "data-u": unitOf(gi) }, el("p", {}, runsEl(b.r, terms)))); return; }
    if (b.t === "fn") {
      out.push(el("section", { class: "footnotes", "aria-label": "Footnotes" }, el("h3", { class: "fn-h", text: "Footnotes" }),
        el("ol", {}, b.items.map(([n, r], ri) => el("li", { "data-u": unitOf(gi, ri) }, el("span", { class: "fn-n", text: n }), el("span", {}, runsEl(r, terms)))))));
      return;
    }
    if (b.t === "flow") { out.push(flowEl(b, gi, unitOf, terms)); return; }
    if (b.t === "rec") {
      out.push(el("aside", { class: "rec", "data-u": unitOf(gi) }, el("div", { class: "rec-h", text: `More text from page ${b.pg} of the original` }),
        b.lines.map((l) => el("p", {}, highlight(l, terms))))); return;
    }
    const target = b.hide && hiddenBox ? hiddenBox : null;
    if (b.t === "h") node = el(plainRuns(b.r).length > 180 ? "p" : `h${Math.min(4, Math.max(2, b.l || 3))}`, { class: plainRuns(b.r).length > 180 ? "scope-panel" : "rd-h", id: b.id || `g${gi}`, "data-u": unitOf(gi) }, runsEl(b.r, terms));
    else if (b.t === "p") {
      const text = plainRuns(b.r);
      if (/^1Low-risk allergies/.test(text) && / 2High-risk allergies/.test(text) && / 3Non-IgE/.test(text)) {
        const cuts=[0,text.indexOf(' 2High-risk'),text.indexOf(' 3Non-IgE'),text.length];
        node=el('section',{class:'allergy-footnotes','data-u':unitOf(gi)},cuts.slice(0,-1).map((start,i)=>el('p',{},highlight(text.slice(start,cuts[i+1]),terms))));
      } else node = el("p", { "data-u": unitOf(gi), class: b.disc || /^(The (recommendations|guidelines) in this guide|If obtained from a source other than)/.test(text) ? "source-disc" : null }, runsEl(b.r, terms));
    }
    else if (b.t === "li") {
      const cls = [b.d ? `d${Math.min(b.d, 3)}` : "", b.n ? "li-n" : ""].join(" ").trim() || null;
      const li = el("li", { class: cls, "data-u": unitOf(gi) }, b.n ? el("span", { class: "li-num", text: b.n }) : null, runsEl(b.r, terms));
      const host = target ? "fig" + hiddenPg : "main";
      if (!ul || ul._host !== host) { ul = el("ul", { class: "rd-ul" }); ul._host = host; if (target) target.append(ul); else out.push(ul); }
      ul.append(li); return;
    } else if (b.t === "table") node = tableEl(b, gi, unitOf, terms);
    if (!node) return;
    if (target) target.append(node); else out.push(node);
  });
  return out;
}

// Pocket-card step: numbered item with its sub-lines and, for durations, label/value rows.
function stepEl(b, gi, unitOf, terms) {
  return el("section", { class: "step", "data-u": unitOf(gi) },
    el("div", { class: "step-n", "aria-hidden": "true", text: String(b.n) }),
    el("div", { class: "step-body" },
      el("p", { class: "step-title" }, el("span", { class: "sr-only", text: b.n + ". " }), runsEl(b.r, terms)),
      (b.sub || []).length ? el("ul", { class: "step-sub" }, b.sub.map((r) => el("li", {}, runsEl(r, terms)))) : null,
      (b.kv || []).length ? el("dl", { class: "step-kv" }, b.kv.map(([k, v]) => el("div", {}, el("dt", {}, highlight(k + ":", terms)), el("dd", {}, highlight(v, terms))))) : null,
      b.jump ? el("a", { class: "step-jump", href: "#" + b.jump, onclick: (e) => { e.preventDefault(); document.getElementById(b.jump)?.scrollIntoView({ behavior: "smooth", block: "start" }); } }, "Go to MRSA recommendations ↓") : null));
}
const pdfHref = (p, pg) => `data/pdf/${encodeURIComponent(p.id)}.pdf${pg ? "#page=" + pg : ""}`;

// Flowchart as a pathway: each node card nests its matching nodes from the final column.
function flowEl(b, gi, unitOf, terms, p = S.current) {
  const cols = b.cols, n = cols.length;
  const ids = []; let k = 0;
  cols.forEach((c) => ids.push(c.nodes.map(() => k++)));
  const shownLast = new Set();
  const node = (ci, ni, extra) => el("div", { class: "flow-node", "data-u": unitOf(gi, ids[ci][ni]) }, paras(cols[ci].nodes[ni].p, terms), extra || null);
  const parts = [];
  cols.forEach((c, ci) => {
    if (ci === n - 1 && n > 1) return;                       // rendered nested under the previous column
    const nested = ci === n - 2;
    const cards = c.nodes.map((nd, ni) => {
      const kids = nested ? nd.next.filter((j) => cols[ci + 1].nodes[j]) : [];
      kids.forEach((j) => shownLast.add(j));
      return el("div", { class: "flow-card" }, node(ci, ni),
        kids.length ? el("div", { class: "flow-next" }, el("div", { class: "flow-arrow", text: "→ " + (cols[ci + 1].head || "Then") }),
          kids.map((j) => node(ci + 1, j))) : null);
    });
    parts.push(el("div", { class: "flow-col" }, c.head ? el("div", { class: "flow-head", text: c.head }) : null, cards));
  });
  if (n > 1) {
    const rest = cols[n - 1].nodes.map((_, j) => j).filter((j) => !shownLast.has(j));
    if (rest.length) parts.push(el("div", { class: "flow-col" }, el("div", { class: "flow-head", text: (cols[n - 1].head || "") + (cols[n - 1].head ? " (other)" : "Other") }),
      rest.map((j) => el("div", { class: "flow-card" }, node(n - 1, j)))));
  }
  return el("section", { class: "flow", id: `g${gi}` },
    el("div", { class: "flow-top" }, el("span", { class: "flow-tag", text: "Pathway · page " + b.pg }),
      p ? el("a", { class: "flow-src", href: pdfHref(p, b.pg), target: "_blank", rel: "noopener", text: "Original PDF ↗" }) : null),
    parts, (b.notes || []).map((nt) => el("div", { class: "flow-note" }, paras(nt, terms))),
    b.fig ? el("details", { class: "textver" }, el("summary", {}, "Original chart image"),
      el("a", { href: b.fig.img, target: "_blank", rel: "noopener", class: "fig-open" },
        el("img", { src: b.fig.img, width: b.fig.w, height: b.fig.h, loading: "lazy", alt: "Original flowchart, page " + b.pg, class: "flow-img" })),
      el("p", { class: "fig-links" }, el("a", { href: b.fig.img, target: "_blank", rel: "noopener", text: "Open full size ↗" }))) : null);
}

function guideMeta(p) {
  const g = p.guide;
  return el("div", { class: "rd-meta-wrap" },
    el("p", { class: "rd-meta" },
      g.revised ? el("span", { class: "pill pill-q", text: "Last revised " + g.revised }) : null,
      el("a", { href: pdfHref(p), target: "_blank", rel: "noopener", text: "Original PDF ↗" }),
      el("a", { href: safeUrl(p.url), target: "_blank", rel: "noopener noreferrer", text: "Source page ↗" })),
    g.approvals ? el("p", { class: "rd-approvals", text: g.approvals }) : null);
}

function guideExtras(p) {
  const g = p.guide;
  return [
    g.refs && g.refs.length ? el("details", { class: "extra" }, el("summary", {}, `References (${g.refs.length})`),
      el("ol", { class: "refs" }, g.refs.map((r) => el("li", { text: r })))) : null,
    g.history && g.history.length ? el("details", { class: "extra" }, el("summary", {}, "Revision history"),
      el("ul", { class: "refs" }, g.history.map((h) => el("li", {}, el("strong", { text: h[0] }), " " + h.slice(1).join(" "))))) : null,
  ];
}

function viewPage(id, params) {
  const p = S.byId.get(id);
  if (!p) return viewMissing();
  setBar(p.cond ? S.cond.get(p.cond).name : p.res ? S.res.get(p.res).name : p.category, { back: true, save: p.id, textSize: true });
  setTab(p.kind === "cond" ? "cond" : p.kind === "res" || p.kind === "section" ? "res" : "home");
  pushRecent(p.id);
  const q = params.get("q") || "";
  const terms = q ? [q] : [];
  const siblings = p.cond ? S.cond.get(p.cond).pages.filter((x) => x !== p) : [];
  const agents = S.drugs.filter((d) => S.drugHits.get(d.name).has(p.id));
  const orgsHere = S.orgs.filter((o) => S.orgHits.get(o.id).has(p.id));
  const files = (p.links || []).filter((l) => l.kind === "file" && safeUrl(l.href));
  const staff = (p.links || []).filter((l) => l.kind === "staff" && safeUrl(l.href));
  const toc = p.guide ? p.guide.blocks.map((b, gi) => [b, gi]).filter(([b]) => (b.t === "h" && (b.l || 3) <= 3 && !b.hide) || (b.t === "table" && b.caption && !b.hide))
    : p.blocks.map((b, i) => [b, i]).filter(([b, i]) => b.t === "h" && b.l <= 3 && i > 0);
  const tocLabel = (b) => (b.t === "table" ? b.caption : p.guide ? plainRuns(b.r) : b.x).replace(/:$/, "");
  const sub = p.guide && p.guide.title && p.guide.title.toLowerCase() !== p.title.toLowerCase() ? p.guide.title : null;

  mount(el("article", { class: "reader" },
    el("div", { class: "rd-badges" },
      p.kind !== "section" ? el("span", { class: "pill", text: popLabel(p) }) : null,
      p.kind !== "section" ? el("span", { class: "pill pill-q", text: p.setting }) : null),
    el("nav",{class:"breadcrumbs","aria-label":"Breadcrumb"},el("a",{href:p.cond?`#/c/${p.cond}`:p.res?`#/r/${p.res}`:"#/res",text:p.cond?S.cond.get(p.cond).name:p.res?S.res.get(p.res).name:"Resources"})),
    el("h1", { class: "rd-title", text: p.title }),
    sub ? (p.guide.title_r ? el("p", { class: "rd-sub" }, runsEl(p.guide.title_r, [])) : el("p", { class: "rd-sub", text: sub })) : null,
    p.guide ? guideMeta(p) : null,
    siblings.length ? el("details", { class: "versions" }, el("summary", { class: "versions-label", text: `Other versions (${siblings.length})` }),
      el("div", { class: "hscroll" }, siblings.map((s) => el("a", { class: "chip chip-out", href: `#/p/${enc(s.id)}` },
        el("span", { class: "chip-k", text: versionLabel(s) }), el("span", { text: s.title }))))) : null,
    toc.length >= 3 ? el("nav", { class: "toc", "aria-label": "On this page" }, el("div", { class: "hscroll" },
      toc.map(([b, i]) => el("button", { type: "button", class: "chip", onclick: () => $(p.guide ? `g${i}` : `b${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }) }, tocLabel(b).slice(0, 48))))) : null,
    chartLinks(p),
    agents.length ? el("details", { class: "agents" }, el("summary", {}, `Agents mentioned (${agents.length})`),
      el("div", { class: "chips" }, agents.map((d) => el("a", { class: "chip", href: `#/d/${enc(d.name)}`, text: d.name })))) : null,
    orgsHere.length ? el("details", { class: "agents orgs-here" }, el("summary", {}, `Organisms mentioned (${orgsHere.length})`),
      el("div", { class: "chips" }, orgsHere.map((o) => el("a", { class: "chip cat-chip", href: `#/o/${o.id}`, "data-cat": o.cat }, orgName(o))))) : null,
    el("div", { class: "rd-body" }, p.guide ? renderGuide(p, terms) : renderBlocks(p, terms)),
    p.guide ? guideExtras(p) : null,
    !p.guide && !p.blocks.length ? el("p", { class: "muted", text: "No content was captured for this page. Open the source page below." }) : null,
    files.length ? section("Files & calculators", list(...files.map((l) => row({ href: safeUrl(l.href), title: l.text, sub: "Opens in Google Drive", external: true })))) : null,
    staff.length ? section("Staff-only links", list(...staff.map((l) => row({ href: safeUrl(l.href), title: l.text, sub: "Michigan Medicine login required", external: true })))) : null,
    el("footer", { class: "rd-foot" },
      el("p", { class: "muted", text: "Unofficial copy captured " + fmtDate(S.data.captured_at) + ". Guidance changes: confirm on the source before acting." }),
      el("a", { class: "btn", href: safeUrl(p.url), target: "_blank", rel: "noopener noreferrer", text: "Open original on source site ↗" }))));

  readerContents(document.querySelector(".reader"));
  const b = params.get("b");
  let target = b != null ? document.querySelector(`[data-u="${CSS.escape(b)}"]`) : null;
  if (target) { let det = target.parentElement; while(det) { if(det.tagName === "DETAILS") det.open=true; det=det.parentElement; } }
  target = target || (q && document.querySelector(".rd-body mark"));
  if (target) requestAnimationFrame(() => { target.classList.add("flash"); target.scrollIntoView({ block: "center" }); });
}

/* ---------- Drugs ---------- */
function viewDrugs(params) {
  setBar("Antibiotics"); setTab("drugs");
  let f = params.get("f") || "";
  const holder = el("div");
  const paint = () => {
    const q = f.trim().toLowerCase();
    const byClass = new Map();
    for (const d of S.drugs) {
      const n = drugCount(d);
      if (!n) continue;
      if (q && ![d.name, d.class, ...d.aliases].some((x) => x.toLowerCase().includes(q))) continue;
      if (!byClass.has(d.class)) byClass.set(d.class, []);
      byClass.get(d.class).push([d, n]);
    }
    holder.replaceChildren(...(byClass.size ? [...byClass].map(([c, ds]) => section(c, list(...ds.map(([d, n]) =>
      row({ href: `#/d/${enc(d.name)}`, title: d.name, terms: [q], sub: d.aliases.length ? d.aliases.slice(0, 3).join(", ") : null,
        right: el("span", { class: "count", text: String(n) }) })))))
      : [emptyState("No matching agents", "Names, brand names and abbreviations all work, e.g. Zosyn or TMP-SMX.")]));
  };
  paint();
  mount(largeTitle("Antibiotics", "Find guideline mentions by agent, brand name, or drug class."), searchField("Find an antibiotic or class", f, (v) => { f = v; paint(); history.replaceState(null, "", "#/drugs" + (v ? "?f=" + enc(v) : "")); }),
    popSwitch(() => viewDrugs(new URLSearchParams(f ? "f=" + f : ""))),
    el("p", { class: "hint", text: "Number = guideline pages that mention the agent." }), holder);
}

function passages(p, h, limit = 2) {
  const seen = new Set(), out = [];
  for (const x of h.blocks) {      // the same sentence printed twice in a guideline is shown once
    const t = snippet(p._text[x.b], x.term); if (seen.has(t)) continue; seen.add(t);
    out.push(el("a", { class: "psg", href: `#/p/${enc(p.id)}?q=${enc(x.term)}&b=${x.b}` }, highlight(t, [x.term])));
    if (out.length >= limit) break;
  }
  return out;
}
function viewDrug(name) {
  const d = S.drugs.find((x) => x.name === name);
  if (!d) return viewMissing();
  setBar(d.class, { back: true, save: "drug:" + d.name }); setTab("drugs");
  pushRecent("drug:" + d.name);
  const hits = [...S.drugHits.get(d.name)].map(([id, h]) => [S.byId.get(id), h]).filter(([p]) => popOk(p));
  const restricted = hits.filter(([p]) => p.res === "restricted");
  const dosing = hits.filter(([p]) => p.res === "dosing").sort((a, b) => b[1].inTitle - a[1].inTitle || b[1].blocks.length - a[1].blocks.length);
  const other = hits.filter(([p]) => p.kind === "res" && !["restricted", "dosing"].includes(p.res));
  const conds = new Map();
  for (const [p, h] of hits.filter(([p]) => p.kind === "cond")) { if (!conds.has(p.cond)) conds.set(p.cond, []); conds.get(p.cond).push([p, h]); }

  const condSection = S.tax.systems.map((sys) => {
    const items = [...conds].filter(([cid]) => S.cond.get(cid).system === sys.id);
    if (!items.length) return null;
    return section(sys.name, el("ul", { class: "list" }, items.sort((a, b) => S.cond.get(a[0]).name.localeCompare(S.cond.get(b[0]).name)).map(([cid, ph]) => {
      const c = S.cond.get(cid);
      const n = ph.reduce((s, [, h]) => s + h.blocks.length, 0);
      return el("li", {}, el("details", { class: "exp" },
        el("summary", { class: "row" }, el("span", { class: "row-main" }, el("span", { class: "row-title", text: c.name }),
          el("span", { class: "row-sub", text: `${ph.map(([p]) => versionLabel(p)).filter((v, i, a) => a.indexOf(v) === i).join(" · ")} · ${plural(n, "mention")}` })),
          popBadges(ph.map(([p]) => p)), el("span", { class: "chev chev-d", "aria-hidden": "true" })),
        el("div", { class: "exp-body" }, ph.map(([p, h]) => el("div", { class: "exp-page" },
          el("a", { class: "exp-title", href: `#/p/${enc(p.id)}?q=${enc(h.blocks[0]?.term || d.name)}` }, `${p.title} · ${versionLabel(p)}`), passages(p, h))))));
    })));
  });

  const dosingRows = (arr) => list(...arr.map(([p, h]) => el("li", { class: "card-li" },
    el("a", { class: "exp-title", href: `#/p/${enc(p.id)}?q=${enc(h.blocks[0]?.term || d.name)}` }, el("span", { text: p.title }), el("span", { class: "pill pill-s", text: popLabel(p) })),
    passages(p, h, 1))));

  const nPass = hits.reduce((s, [, h]) => s + h.blocks.length, 0);
  const orgs = tally(hits, S.unitOrgs).map(([id, n]) => [S.orgs.find((o) => o.id === id), n]).filter(([o]) => o).slice(0, 12);
  const charts = chartsForHits(hits);
  const jumpTo = (id) => () => { const t = $(id); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const synopsis = hits.length ? el("section", { class: "synopsis syn-drug", "aria-label": "Synopsis" },
    el("div", { class: "syn-head" }, el("span", { class: "syn-cat", text: d.class }), restricted.length ? el("span", { class: "pill pill-warn", text: "Restricted" }) : null),
    statTiles([[hits.length, hits.length === 1 ? "guideline" : "guidelines"], [conds.size, conds.size === 1 ? "condition" : "conditions"], [nPass, nPass === 1 ? "passage" : "passages"], charts.length ? [charts.length, charts.length === 1 ? "chart" : "charts"] : null]),
    el("div", { class: "syn-jump" }, [dosing.length ? ["Dosing", "drug-dosing"] : null, conds.size ? ["Conditions", "drug-conds"] : null, orgs.length ? ["Organisms", "drug-orgs"] : null,
      charts.length ? ["Charts", "drug-charts"] : null, other.length ? ["Other", "drug-other"] : null].filter(Boolean).map(([l, id]) => el("button", { type: "button", class: "jump-btn", onclick: jumpTo(id) }, l))),
    el("p", { class: "syn-note", text: "A summary of where the guidelines mention this agent. Read each passage in its guideline before acting on it." })) : null;
  mount(largeTitle(d.name, d.aliases.length ? "Also: " + d.aliases.join(", ") : null),
    popSwitch(() => viewDrug(name)),
    !hits.length ? emptyState("No mentions", S.pop === "all" ? "This agent isn't mentioned in the captured guidelines." : "Switch to All to include every population.") : null,
    synopsis,
    restricted.length ? el("div", { class: "notice" }, el("strong", { text: "Restricted · " }), "Appears on ",
      restricted.map(([p], i) => [i ? ", " : "", el("a", { href: `#/p/${enc(p.id)}?q=${enc(d.name)}`, text: p.title })]), ". Check the criteria before ordering.") : null,
    dosing.length ? el("section", { class: "sec", id: "drug-dosing" }, el("h2", { class: "sec-h", text: "Dosing & monitoring" }), dosingRows(dosing)) : null,
    conds.size ? el("h2", { class: "group-h", id: "drug-conds", text: `Used for · ${plural(conds.size, "condition")}` }) : null,
    condSection,
    orgs.length ? el("section", { class: "sec", id: "drug-orgs" }, el("h2", { class: "sec-h", text: "Organisms named with it" }),
      el("div", { class: "chips" }, orgs.map(([o, n]) => el("a", { class: "chip chip-count", href: `#/o/${o.id}`, "data-cat": o.cat }, orgName(o), el("span", { class: "chip-n", text: String(n) })))),
      el("p", { class: "hint", text: "Number = passages that name both." })) : null,
    charts.length ? el("section", { class: "sec", id: "drug-charts" }, el("h2", { class: "sec-h", text: "Charts that name it" }), el("div", { class: "chart-grid" }, charts.map((c) => chartCard(c)))) : null,
    other.length ? el("section", { class: "sec", id: "drug-other" }, el("h2", { class: "sec-h", text: "Other resources" }), dosingRows(other)) : null);
}

/* ---------- Resources ---------- */
function viewResources() {
  setBar("Resources"); setTab("res");
  const groups = [...S.res.values()].filter((r) => r.pages.filter(popOk).length);
  mount(popSwitch(viewResources),
    section("Guidance", list(...groups.map((r) => row({ href: `#/r/${r.id}`, title: r.name, sub: r.desc || null,
      right: el("span", { class: "count", text: String(r.pages.filter(popOk).length) }) })))),
    section("Tools", list(
      row({ href: "#/files", title: "Calculators & files", sub: "PDFs, pocket cards and spreadsheets", right: el("span", { class: "count", text: String(S.files.length) }) }),
      row({ href: "#/staff", title: "Staff-only links", sub: "Policies and protocols behind Michigan Medicine login", right: el("span", { class: "count", text: String(S.staff.length) }) }))),
    section("Original site sections", list(...S.sections.map((p) => row({ href: `#/p/${enc(p.id)}`, title: p.title })))));
}
function viewResource(id) {
  const r = S.res.get(id);
  if (!r) return viewMissing();
  setBar("Resources", { back: true }); setTab("res");
  const pages = r.pages.filter(popOk).sort((a, b) => a.pop.localeCompare(b.pop) || a.title.localeCompare(b.title));
  const adult = pages.filter((p) => p.pop === "adult"), peds = pages.filter((p) => p.pop === "peds");
  const mk = (ps) => list(...ps.map((p) => row({ href: `#/p/${enc(p.id)}`, title: p.title, sub: p.setting !== "Inpatient" ? p.setting : null })));
  mount(largeTitle(r.name, r.desc), popSwitch(() => viewResource(id)),
    adult.length ? section(peds.length ? "Adult" : "", mk(adult)) : null,
    peds.length ? section(adult.length ? "Pediatric" : "", mk(peds)) : null,
    !pages.length ? emptyState("Nothing for this population", "Switch to All.") : null);
}
function viewLinks(kind) {
  const items = kind === "files" ? S.files : S.staff;
  setBar("Resources", { back: true }); setTab("res");
  let f = "";
  const ul = list();
  const paint = () => {
    const q = f.trim().toLowerCase();
    const shown = items.filter((l) => !q || (l.text + " " + l.from.title).toLowerCase().includes(q));
    ul.replaceChildren(...shown.map((l) => row({ href: safeUrl(l.href), title: l.text, sub: "From: " + l.from.title, external: true, terms: [q] })));
    if (!shown.length) ul.append(el("li", { class: "empty", text: "Nothing matches." }));
  };
  paint();
  mount(largeTitle(kind === "files" ? "Calculators & files" : "Staff-only links",
    kind === "files" ? "These open in Google Drive and need a connection." : "These need a Michigan Medicine login."),
    searchField("Filter", "", (v) => { f = v; paint(); }), ul);
}

/* ---------- Search ---------- */
function runSearch(q) {
  const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return null;
  const all = (s) => terms.every((t) => s.toLowerCase().includes(t));
  const conds = [...S.cond.values()].filter((c) => condPages(c).length && all([c.name, ...c.synonyms].join(" ")));
  const drugs = S.drugs.filter((d) => drugCount(d) && all([d.name, ...d.aliases, d.class].join(" ")));
  const orgs = S.orgs.filter((o) => orgCount(o) && all([o.name, ...o.aka, orgCatName(o.cat)].join(" ")));
  const titles = [], text = [];
  for (const p of S.pages) {
    if (!popOk(p) || p.kind === "section") continue;
    if (all(p.title)) { titles.push(p); continue; }
    const i = p._text.findIndex((t) => all(t));
    if (i >= 0) text.push({ p, i, n: p._text.filter((t) => all(t)).length });
  }
  text.sort((a, b) => b.n - a.n);
  return { conds, drugs, orgs, titles, text: text.slice(0, 50), more: text.length > 50 };
}
function viewSearch(params) {
  setBar("Search", { back: true }); setTab("");
  const holder = el("div");
  const paint = (q) => {
    S.searchQ = q;
    history.replaceState(null, "", "#/search" + (q ? "?q=" + enc(q) : ""));
    const r = runSearch(q);
    const first = q.trim().split(/\s+/).find((t) => t.length > 1) || "";
    if (!r) {
      holder.replaceChildren(el("p", { class: "hint", text: "Search everything: conditions, antibiotics, brand names, organisms, and the full guideline text." }),
        section("Try", el("div", { class: "chips" }, ["MRSA", "Pseudomonas", "cefazolin", "pyelonephritis", "penicillin allergy", "Zosyn", "Candida"].map((t) =>
          el("button", { type: "button", class: "chip", onclick: () => { holder.previousSibling.previousSibling.querySelector("input").value = t; paint(t); } }, t)))));
      return;
    }
    const kids = [];
    // Best match: an antibiotic or organism whose name or abbreviation matches the query gets a summary card on top.
    const ql = q.trim().toLowerCase();
    const near = (names) => names.some((n) => { const x = n.toLowerCase(); return x === ql || (ql.length >= 3 && x.startsWith(ql)); });
    const rank = (names) => { const xs = names.map((n) => n.toLowerCase()); return xs[0] === ql ? 0 : xs.includes(ql) ? 1 : near(names) ? 2 : 9; };
    const bestDrug = r.drugs.map((d) => [rank([d.name, ...d.aliases]), d]).filter(([k]) => k < 9).sort((a, b) => a[0] - b[0])[0]?.[1];
    const bestOrg = r.orgs.map((o) => [rank([o.name, ...o.aka, ...o.name.split(" ")]), o]).filter(([k]) => k < 9).sort((a, b) => a[0] - b[0] || orgCount(b[1]) - orgCount(a[1]))[0]?.[1];
    const best = [];
    if (bestDrug) {
      const hits = [...S.drugHits.get(bestDrug.name)].map(([id, h]) => [S.byId.get(id), h]).filter(([p]) => popOk(p));
      const condN = new Set(hits.filter(([p]) => p.cond).map(([p]) => p.cond)).size;
      const top = tally(hits, S.unitOrgs).slice(0, 4).map(([id]) => S.orgs.find((o) => o.id === id)).filter(Boolean);
      best.push(el("a", { class: "best-card", href: `#/d/${enc(bestDrug.name)}` },
        el("span", { class: "best-k", text: "Antibiotic" }), el("span", { class: "best-t", text: bestDrug.name }),
        el("span", { class: "best-s", text: `${bestDrug.class} · ${plural(hits.length, "guideline")} · ${plural(condN, "condition")}` }),
        top.length ? el("span", { class: "best-s" }, "Often named with ", top.map((o, i) => [i ? ", " : "", orgName(o)])) : null,
        el("span", { class: "best-go", text: "Open antibiotic summary →" })));
    }
    if (bestOrg) {
      const hits = orgPagesFor(bestOrg);
      const condN = new Set(hits.filter(([p]) => p.cond).map(([p]) => p.cond)).size;
      const top = tally(hits, S.unitDrugs).slice(0, 4).map(([n]) => n);
      best.push(el("a", { class: "best-card", href: `#/o/${bestOrg.id}`, "data-cat": bestOrg.cat },
        el("span", { class: "best-k" }, el("span", { class: "org-dot", "aria-hidden": "true" }), orgCatName(bestOrg.cat)), el("span", { class: "best-t" }, orgName(bestOrg)),
        el("span", { class: "best-s", text: `${plural(hits.length, "guideline")} · ${plural(condN, "condition")}` }),
        top.length ? el("span", { class: "best-s", text: "Often named with " + top.join(", ") }) : null,
        el("span", { class: "best-go", text: "Open organism summary →" })));
    }
    if (best.length) kids.push(el("div", { class: "best" }, best));
    if (r.conds.length) kids.push(section("Conditions", list(...r.conds.map((c) => row({ href: `#/c/${c.id}`, title: c.name, sub: sysName(c.system), terms: [first], right: popBadges(condPages(c)) })))));
    if (r.drugs.length) kids.push(section("Antibiotics", list(...r.drugs.slice(0, 8).map((d) => row({ href: `#/d/${enc(d.name)}`, title: d.name, sub: d.class, terms: [first], right: el("span", { class: "count", text: String(drugCount(d)) }) })))));
    if (r.orgs.length) kids.push(section("Organisms", list(...r.orgs.slice(0, 8).map((o) => el("li", {}, el("a", { class: "row", href: `#/o/${o.id}` },
      el("span", { class: "row-main" }, orgName(o, "row-title"), el("span", { class: "row-sub", text: orgCatName(o.cat) })), el("span", { class: "count", text: String(orgCount(o)) }), chev()))))));
    if (r.titles.length) kids.push(section("Guideline titles", list(...r.titles.map((p) => row({ href: `#/p/${enc(p.id)}`, title: p.title, sub: versionLabel(p), terms: [first] })))));
    if (r.text.length) kids.push(section(`Found in text · ${r.text.length}${r.more ? "+" : ""} pages`, list(...r.text.map(({ p, i, n }) => row({
      href: `#/p/${enc(p.id)}?q=${enc(first)}&b=${i}`, title: p.title, terms: [first],
      sub: el("span", {}, el("span", { class: "row-meta", text: `${versionLabel(p)} · ${plural(n, "match")}` }), el("br"), highlight(snippet(p._text[i], first, 120), [first])) })))));
    holder.replaceChildren(...(kids.length ? kids : [emptyState(`No results for “${q}”`, S.pop !== "all" ? "Try switching the population to All." : "Check the spelling, or try a broader term.")]));
  };
  const q0 = params.get("q") ?? S.searchQ;
  mount(searchField("Search everything", q0, paint, !q0), popSwitch(() => paint(S.searchQ)), holder);
  paint(q0 || "");
}

/* ---------- Saved, About ---------- */
function viewSaved() {
  setBar("Saved", { back: true }); setTab("");
  const saved = [...S.saved].map(keyItem).filter(Boolean);
  const recent = S.recent.map(keyItem).filter(Boolean);
  mount(largeTitle("Saved", "Your bookmarks and recently viewed guidelines."), saved.length ? section("Saved", list(...saved.map((i) => row(i))))
      : emptyState("Nothing saved yet", "Tap the star on any condition, guideline or antibiotic to keep it here."),
    recent.length ? section("Recently viewed", list(...recent.map((i) => row(i)))) : null,
    recent.length ? el("button", { type: "button", class: "btn btn-quiet", onclick: () => { S.recent = []; store.set("recent", []); viewSaved(); } }, "Clear history") : null);
}
function viewAbout() {
  setBar("About", { back: true }); setTab("home");
  mount(el("article", { class: "reader" },
    el("h1", { class: "rd-title", text: "About ASP Guide" }),
    el("p", { class: "callout", text: "Unofficial personal copy. Guidance changes: before acting on anything here, open the source page and confirm it is current." }),
    el("p", {}, "An offline copy of the public guidelines on the ",
      el("a", { href: S.data.source + "/home", target: "_blank", rel: "noopener noreferrer", text: "Michigan Medicine Antimicrobial Stewardship Program website" }),
      `, captured once on ${fmtDate(S.data.captured_at)}. Text and tables were extracted word for word from the program's PDF guidelines and checked against them automatically; flowcharts are shown as pathways with the original chart available. It is not affiliated with or endorsed by Michigan Medicine and is not updated automatically.`),
    el("h2", { class: "rd-h", text: "Source disclaimer" }),
    el("p", { text: S.data.disclaimer || "No disclaimer was captured. See the source site." }),
    el("h2", { class: "rd-h", text: "Appearance" }), appearanceControl(),
    el("h2", { class: "rd-h", text: "Install on your phone" }),
    el("p", { text: "iPhone: open in Safari → Share → Add to Home Screen. Android: open in Chrome → ⋮ → Install app. After the first launch it works offline." }),
    el("h2", { class: "rd-h", text: "Use offline" }),
    el("p", { text: "All guideline text is stored on your phone after the first launch. Chart images download as you view them; save them all for offline use here." }),
    offlineButton(),
    el("h2", { class: "rd-h", text: "What's inside" }),
    el("p", { class: "muted", text: `${S.pages.length} pages · ${S.pages.filter((p) => p.guide).length} guidelines · ${[...S.cond.values()].filter((c) => c.pages.length).length} conditions · ${S.drugs.filter((d) => S.drugHits.get(d.name).size).length} antibiotics indexed · ${S.files.length} files` })));
}
function offlineButton() {
  const imgs = S.pages.flatMap((p) => (p.guide ? p.guide.blocks : []).flatMap((b) => b.t === "fig" ? [b.img] : b.t === "flow" && b.fig ? [b.fig.img] : []));
  const btn = el("button", { type: "button", class: "btn", text: imgs.length ? `Save all ${imgs.length} charts for offline` : "Nothing to download" });
  if (!imgs.length || !("caches" in window)) { btn.disabled = true; return btn; }
  btn.addEventListener("click", async () => {
    btn.disabled = true; let done = 0, failed = 0;
    const queue = imgs.flatMap((u) => [u, thumbOf(u)]);
    const worker = async () => { while (queue.length) { const u = queue.shift(); try { const r = await fetch(u); if (!r.ok) failed++; } catch { failed++; } done++; btn.textContent = `Downloading… ${Math.ceil(done / 2)} / ${imgs.length}`; } };
    await Promise.all([worker(), worker(), worker(), worker()]);
    btn.textContent = failed ? `Done, ${failed} failed. Tap to retry.` : "All charts saved for offline";
    btn.disabled = !failed;
  });
  return btn;
}
function viewMissing() { setBar("Not found", { back: true }); mount(emptyState("Not in this capture", "Go back and try another page.")); }

/* ---------- flowcharts and charts index ---------- */
// Built only from charts already in the captured guidelines: chart images (with their pathway text where it could be
// extracted) and guidelines whose own source title names them an algorithm or workflow. Each chart is labelled with
// its guideline title and PDF page; the group it is filed under is a browsing aid assigned from what the chart shows.
const CHART_KINDS = [
  ["path", "Treatment pathways", "Step-by-step treatment decisions", "Pathways"],
  ["dx", "Diagnostic algorithms", "When and how to test", "Diagnostic"],
  ["ref", "Reference charts & tables", "Timelines, panels, grids and calculations", "Reference"],
  ["algo", "Algorithm guidelines", "Guidelines written as a workflow, shown as text", "Algorithms"],
  ["edu", "Patient education graphics", "Slides and posters from patient materials", "Education"],
];
const CHART_KIND_OF = (p, pg) => {
  const id = p.id;
  if (/blood-stream-infections-adult/.test(id) || /clostridiodies-difficile-pediatric/.test(id) || (/CDI-treatment/.test(id) && pg === 1)) return "path";
  if (/BCx-algorithm|CDI-diagnostics|meningitis-film-array/.test(id) || (/CDI-treatment/.test(id) && pg === 2)) return "dx";
  if (/^patient-education/.test(id)) return "edu";
  return "ref";
};
// Small line icons (SVG built with DOM methods, no markup strings).
const ICONS = { doc: ["M7 3h7l4 4v14H7z", "M14 3v4h4", "M10 12h5", "M10 16h5"], expand: ["M4 9V4h5", "M20 9V4h-5", "M4 15v5h5", "M20 15v5h-5"],
  pdf: ["M6 3h9l4 4v14H6z", "M15 3v4h4", "M9 13h6", "M12 10v7"] };
function icon(name) {
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("class", "act-i");
  for (const d of ICONS[name]) { const pth = document.createElementNS(NS, "path"); pth.setAttribute("d", d); svg.append(pth); }
  return svg;
}
const pageRange = (pgs) => { const out = []; for (const n of pgs) { const last = out[out.length - 1]; if (last && n === last[1] + 1) last[1] = n; else out.push([n, n]); }
  return out.map(([a, b]) => a === b ? String(a) : `${a}–${b}`).join(", "); };
const thumbOf = (img) => img ? img.replace("data/fig/", "data/fig/thumb/") : null;
function buildCharts() {
  S.charts = [];
  const plain = (r) => (r || []).filter((x) => !(x[1] || "").includes("s")).map((x) => x[0]).join("").replace(/^[•●▪o\-–\s]+/, "").trim();
  const okSub = (t) => t && t.length > 10 && !/P&T|revised|subcommittee|approval|^N\/A$|^page \d/i.test(t);
  for (const p of S.pages) {
    const g = p.guide; if (!g) continue;
    g.blocks.forEach((b, gi) => {
      if (b.t === "flow") {
        const heads = b.cols.map((c) => c.head).filter((h) => h && /[a-z]{3}/i.test(h) && !/^(yes|no)$/i.test(h.trim()) && okSub(h));
        const first = b.cols.flatMap((c) => c.nodes.map((n) => plain(n.p[0]))).find(okSub) || "";
        S.charts.push({ p, gi, pg: b.pg, path: true, img: b.fig && b.fig.img, sub: (heads.length > 1 ? heads.join(" → ") : first).slice(0, 90) });
      } else if (b.t === "fig") {
        const ft = g.blocks[gi + 1] && g.blocks[gi + 1].t === "figtext" ? g.blocks[gi + 1].lines : [];
        S.charts.push({ p, gi, pg: b.pg, img: b.img, sub: (ft.map((l) => l.replace(/^[•●▪\-–\s]+/, "").trim()).find(okSub) || "").slice(0, 90) });
      }
    });
    if (!S.charts.some((c) => c.p === p) && /algorithm|workflow|pathway/i.test(p.title + " " + (g.title || "")))
      S.charts.push({ p, gi: null, pg: null, img: null, sub: g.title && g.title !== p.title ? g.title : "" });
  }
  for (const c of S.charts) {
    c.kind = c.gi == null ? "algo" : CHART_KIND_OF(c.p, c.pg);
    c.where = c.p.cond ? S.cond.get(c.p.cond).name : c.p.res ? S.res.get(c.p.res).name : c.p.category;
  }
  S.charts.sort((a, b) => a.where.localeCompare(b.where) || a.p.title.localeCompare(b.p.title) || (a.pg || 0) - (b.pg || 0));
}
const chartHref = (c) => c.gi == null ? `#/p/${enc(c.p.id)}` : `#/chart/${enc(c.p.id)}/${c.gi}`;
const chartSet = (c) => (S.charts || []).filter((x) => x.p === c.p && x.gi != null);
async function offlineState(url) {
  if (!url || !("caches" in window)) return null;
  try { return !!(await caches.match(url, { ignoreSearch: true })); } catch { return null; }
}
function offlineBadge(url) {
  const b = el("span", { class: "pill pill-q offline-badge", text: url ? "Checking…" : "Text only" });
  if (url) offlineState(url).then((ok) => { b.textContent = ok ? "Saved offline" : ok === false ? "Online only" : "Offline status unavailable"; if (ok) b.classList.add("pill-ok"); });
  return b;
}
function offlineDot(url) {   // small status mark on chart cards: filled when the full chart image is stored on this device
  const d = el("span", { class: "off-dot", title: "Checking offline status", "aria-label": "Offline status" });
  offlineState(url).then((ok) => { d.classList.toggle("on", !!ok); const t = ok ? "Saved offline" : "Needs a connection"; d.title = t; d.setAttribute("aria-label", t); });
  return d;
}
// Card for one chart, or for a guideline's set of chart pages (n > 1).
function chartCard(c, n = 1) {
  return el("a", { class: "chart-card", href: chartHref(c) },
    el("span", { class: "chart-thumb" }, c.img ? el("img", { src: thumbOf(c.img), alt: "", loading: "lazy", decoding: "async", width: 480, height: 326 }) : null,
      n > 1 ? el("span", { class: "chart-count", text: `${n} pages` }) : null),
    el("span", { class: "chart-card-body" },
      el("span", { class: "chart-card-title", text: c.p.title }),
      el("span", { class: "chart-card-meta" }, el("span", { text: n > 1 ? `Pages ${pageRange(chartSet(c).filter((x) => x.kind === c.kind).map((x) => x.pg))}` : `Page ${c.pg}` }),
        el("span", { class: "pb" + (c.p.pop === "peds" ? " pb-p" : ""), text: c.p.pop === "peds" ? "P" : "A", title: popLabel(c.p) }),
        c.img ? offlineDot(c.img) : null)));
}
function chartRow(c) {
  return el("li", {}, el("a", { class: "row chart-row", href: chartHref(c) },
    el("span", { class: "row-main" },
      el("span", { class: "row-title" }, c.p.title, c.pg ? el("span", { class: "row-pg", text: " · page " + c.pg }) : null),
      c.sub ? el("span", { class: "row-sub", text: c.sub }) : null),
    el("span", { class: "pill pill-q", text: popLabel(c.p) }), chev()));
}
function offlinePanel() {
  const imgs = (S.charts || []).filter((c) => c.img).map((c) => c.img);
  const status = el("p", { class: "muted off-status", text: "Checking this device…" });
  Promise.all(imgs.map(offlineState)).then((r) => { const n = r.filter(Boolean).length; status.textContent = n === imgs.length ? `All ${imgs.length} chart images are saved on this device.` : `${n} of ${imgs.length} chart images saved on this device. Guideline text always works offline.`; });
  return el("section", { class: "offline-card" }, el("h2", { class: "offline-h", text: "Offline charts" }), status, offlineButton());
}
function viewCharts(params) {
  setBar("Flowcharts"); setTab("charts");
  let f = params.get("f") || "", kind = params.get("k") || "all";
  const holder = el("div");
  const seg = el("div", { class: "kind-filter", role: "radiogroup", "aria-label": "Chart type" });
  const kinds = [["all", "All"], ...CHART_KINDS.map(([k, , , short]) => [k, short])];
  const paintSeg = () => seg.replaceChildren(...kinds.map(([k, label]) => el("button", { type: "button", role: "radio", class: "chip kind-chip", "aria-checked": String(kind === k),
    onclick: () => { kind = k; paintSeg(); paint(); history.replaceState(null, "", "#/charts?" + new URLSearchParams({ ...(f ? { f } : {}), ...(k !== "all" ? { k } : {}) })); } }, label)));
  const paint = () => {
    const q = f.trim().toLowerCase();
    const shown = S.charts.filter((c) => popOk(c.p) && (kind === "all" || c.kind === kind) && (!q || (c.p.title + " " + c.sub + " " + c.where).toLowerCase().includes(q)));
    const out = CHART_KINDS.map(([k, label, desc]) => {
      const cs = shown.filter((c) => c.kind === k); if (!cs.length) return null;
      if (k === "algo") return el("section", { class: "sec" }, el("h2", { class: "sec-h", text: label }), el("p", { class: "sec-desc", text: desc }), el("ul", { class: "list" }, cs.map(chartRow)));
      const sets = []; const seen = new Set();
      for (const c of cs) { if (seen.has(c.p)) continue; seen.add(c.p); sets.push([c, cs.filter((x) => x.p === c.p).length]); }
      return el("section", { class: "sec" }, el("h2", { class: "sec-h", text: label }), el("p", { class: "sec-desc", text: desc }),
        el("div", { class: "chart-grid" + (k === "edu" ? " chart-grid-sm" : "") }, sets.map(([c, n]) => chartCard(c, n))));
    }).filter(Boolean);
    holder.replaceChildren(...(out.length ? out : [emptyState("No matching charts", q ? "Try another word, or clear the filter." : "Switch to All to include every population.")]));
  };
  paintSeg(); paint();
  mount(largeTitle("Flowcharts", "Pathways, algorithms and reference charts from the guidelines."),
    searchField("Search charts", f, (v) => { f = v; paint(); history.replaceState(null, "", "#/charts" + (v ? "?f=" + enc(v) : "")); }),
    el("div", { class: "hscroll kind-scroll" }, seg), popSwitch(() => viewCharts(new URLSearchParams({ ...(f ? { f } : {}), ...(kind !== "all" ? { k: kind } : {}) }))),
    holder, offlinePanel());
}
// Full-screen zoom for a chart image: buttons and double-tap zoom, pan by scrolling; works offline once the image is stored.
function openZoom(src, label) {
  let z = 1;
  const img = el("img", { src, alt: label, class: "zoom-img", draggable: "false" });
  const pane = el("div", { class: "zoom-pane" }, img);
  const set = (nz, cx, cy) => {
    const r = pane.getBoundingClientRect(), fx = (pane.scrollLeft + (cx ?? r.width / 2)) / pane.scrollWidth, fy = (pane.scrollTop + (cy ?? r.height / 2)) / pane.scrollHeight;
    z = Math.min(5, Math.max(1, nz)); img.style.width = z * 100 + "%"; lab.textContent = Math.round(z * 100) + "%";
    requestAnimationFrame(() => { pane.scrollLeft = fx * pane.scrollWidth - (cx ?? r.width / 2); pane.scrollTop = fy * pane.scrollHeight - (cy ?? r.height / 2); });
  };
  const lab = el("span", { class: "zoom-lab", text: "100%" });
  const close = () => { ov.remove(); document.removeEventListener("keydown", key); document.body.classList.remove("zoom-open"); };
  const key = (e) => { if (e.key === "Escape") close(); if (e.key === "+" || e.key === "=") set(z * 1.5); if (e.key === "-") set(z / 1.5); };
  img.addEventListener("dblclick", (e) => { const r = pane.getBoundingClientRect(); set(z > 1 ? 1 : 2.5, e.clientX - r.left, e.clientY - r.top); });
  const ov = el("div", { class: "zoom", role: "dialog", "aria-modal": "true", "aria-label": label },
    el("div", { class: "zoom-bar" },
      el("button", { type: "button", class: "zoom-btn", "aria-label": "Zoom out", onclick: () => set(z / 1.5) }, "−"), lab,
      el("button", { type: "button", class: "zoom-btn", "aria-label": "Zoom in", onclick: () => set(z * 1.5) }, "+"),
      el("button", { type: "button", class: "zoom-btn zoom-fit", onclick: () => set(1) }, "Fit"),
      el("button", { type: "button", class: "zoom-btn zoom-x", "aria-label": "Close", onclick: close }, "✕")),
    pane, el("p", { class: "zoom-hint", text: "Double-tap or use + to zoom. Drag to move around." }));
  document.body.append(ov); document.body.classList.add("zoom-open"); document.addEventListener("keydown", key);
  ov.querySelector(".zoom-x").focus();
}
function viewChart(pid, gi) {
  const p = S.byId.get(pid); const c = (S.charts || []).find((x) => x.p === p && String(x.gi) === String(gi));
  if (!p || !c) return viewMissing();
  setBar("Flowchart", { back: true, save: p.id }); setTab("charts");
  pushRecent(p.id);
  const g = p.guide; S.current = p;
  const idx = new Map(p._units.map((u, i) => [u.ri != null ? `${u.gi}:${u.ri}` : `${u.gi}`, i]));
  const unitOf = (a, r) => idx.get(r != null ? `${a}:${r}` : `${a}`);
  const b = g.blocks[c.gi];
  const set = chartSet(c), at = set.indexOf(c);
  const jump = unitOf(c.gi, 0) ?? unitOf(c.gi);
  // Views: the chart image, its step-by-step pathway text, and/or the chart's own text lines.
  let steps = null, text = null;
  if (b.t === "flow") {
    steps = flowEl(b, c.gi, unitOf, [], p);
    steps.querySelector("details.textver")?.remove();          // the image is shown in the Chart view
    steps.querySelector(".flow-top")?.remove();
  } else {
    const ft = g.blocks[c.gi + 1]?.t === "figtext" ? g.blocks[c.gi + 1] : null;
    if (ft) text = el("div", { class: "rd-body fig-text" }, ft.lines.map((l, ri) => el("p", { "data-u": unitOf(c.gi + 1, ri) }, l)));
  }
  const img = c.img;
  const chartView = img ? el("figure", { class: "chart-frame" },
    el("button", { type: "button", class: "chart-zoom", onclick: () => openZoom(img, `${p.title}, page ${c.pg}`), "aria-label": "Open the chart full screen to zoom" },
      el("img", { src: img, alt: `${p.title}, chart on page ${c.pg} of the original`, loading: "eager" }),
      el("span", { class: "zoom-cue", "aria-hidden": "true" }, "Tap to zoom")),
    el("figcaption", {}, `Original chart · page ${c.pg} of the PDF`)) : null;
  const views = [["chart", "Chart", chartView], ["steps", "Steps", steps], ["text", "Chart text", text]].filter(([, , n]) => n);
  let mode = store.get("chartView", "chart"); if (!views.some(([k]) => k === mode)) mode = views[0][0];
  const panes = el("div", { class: "chart-panes" });
  const tabs = el("div", { class: "seg view-seg", role: "tablist", "aria-label": "Chart view" });
  const show = () => {
    tabs.replaceChildren(...views.map(([k, label]) => el("button", { type: "button", role: "tab", class: "seg-btn", "aria-selected": String(mode === k),
      onclick: () => { mode = k; store.set("chartView", k); show(); } }, label)));
    panes.replaceChildren(views.find(([k]) => k === mode)[2]);
  };
  show();
  const pager = set.length > 1 ? el("nav", { class: "pager", "aria-label": "Chart pages in this guideline" },
    el("a", { class: "pager-btn", href: at > 0 ? chartHref(set[at - 1]) : null, "aria-disabled": at > 0 ? null : "true", "aria-label": "Previous chart page" }, "‹"),
    el("div", { class: "pager-pages hscroll" }, set.map((x) => el("a", { class: "pager-pg", href: chartHref(x), "aria-current": x === c ? "page" : null, text: "p" + x.pg }))),
    el("a", { class: "pager-btn", href: at < set.length - 1 ? chartHref(set[at + 1]) : null, "aria-disabled": at < set.length - 1 ? null : "true", "aria-label": "Next chart page" }, "›")) : null;
  const related = (S.charts || []).filter((x) => x.p !== p && x.gi != null && ((p.cond && x.p.cond === p.cond) || (!p.cond && x.kind === c.kind)) && popOk(x.p));
  const rs = []; const seen = new Set(); for (const x of related) if (!seen.has(x.p)) { seen.add(x.p); rs.push(x); }
  mount(el("article", { class: "chart-view" },
    el("nav", { class: "breadcrumbs", "aria-label": "Breadcrumb" }, el("a", { href: "#/charts?k=" + c.kind, text: CHART_KINDS.find(([k]) => k === c.kind)[1] })),
    el("h1", { class: "rd-title", text: p.title }),
    el("p", { class: "rd-sub" }, `Page ${c.pg} of the original`, c.sub ? el("span", { class: "chart-subline", text: c.sub }) : null),
    pager,
    views.length > 1 ? tabs : null,
    panes,
    el("div", { class: "chart-actions" },
      el("a", { class: "act", href: `#/p/${enc(p.id)}${jump != null ? "?b=" + jump : ""}` }, icon("doc"), el("span", { text: "Open in guideline" })),
      img ? el("button", { type: "button", class: "act", onclick: () => openZoom(img, `${p.title}, page ${c.pg}`) }, icon("expand"), el("span", { text: "Full screen" })) : null,
      el("a", { class: "act", href: pdfHref(p, c.pg), target: "_blank", rel: "noopener" }, icon("pdf"), el("span", { text: "Original PDF" }))),
    img ? el("p", { class: "chart-off" }, offlineBadge(img)) : null,
    rs.length ? section(p.cond ? "More charts for " + S.cond.get(p.cond).name : "More " + CHART_KINDS.find(([k]) => k === c.kind)[1].toLowerCase(), el("div", { class: "chart-grid" }, rs.slice(0, 6).map((x) => chartCard(x, chartSet(x).filter((y) => y.kind === x.kind).length)))) : null,
    el("footer", { class: "rd-foot" }, el("a", { class: "btn btn-secondary", href: `#/p/${enc(p.id)}`, text: "← Back to " + p.title }))));
}
function chartLinks(p) {
  const cs = (S.charts || []).filter((c) => c.p === p && c.gi != null);
  if (!cs.length) return null;
  return el("div", { class: "chart-links" }, el("span", { class: "chart-links-h", text: `Charts in this guideline (${cs.length})` }),
    el("div", { class: "chart-strip hscroll" }, cs.map((c) => el("a", { class: "strip-card", href: chartHref(c) },
      c.img ? el("img", { src: thumbOf(c.img), alt: "", loading: "lazy", width: 480, height: 326 }) : null, el("span", { text: "Page " + c.pg })))));
}

/* ---------- text size ---------- */
const SIZES = [0.94, 1, 1.12, 1.25];
function applySize() { document.documentElement.style.setProperty("--rd-scale", SIZES[S.size] ?? 1); }

/* Presentation adapters. Source JSON is read-only; original runs are rendered verbatim. */
/* ---------- organisms ---------- */
// The organism index lists only organisms that the captured guidelines mention. Categories are standard Gram-stain and
// morphology groups (the same top-level groups the bloodstream-infection guideline uses). Every passage shown is
// guideline text quoted verbatim, linked to its place in the guideline; counts are counts of those passages.
const ORG_ROMAN = new Set(["gas", "gbs", "viridans", "cons", "hacek", "anaerobes", "ntm", "mdr"]);
function orgName(o, cls) {
  if (["virus", "res"].includes(o.cat) || ORG_ROMAN.has(o.id)) return el("span", { class: cls, text: o.name });
  // genus and species names are italic; connecting words and parenthetical common names are not
  const parts = o.name.split(/( \(.*\)| & )/).filter(Boolean);
  return el("span", { class: cls }, parts.map((t) => /^( \(| & )/.test(t) ? t : el("i", { text: t })));
}
const orgCatName = (id) => S.orgCats.find((c) => c.id === id)?.name || "";
function indexOrganisms() {
  const pats = S.orgs.map((o) => ({ o, res: [o.re ? new RegExp(o.re, "i") : null, o.cs ? new RegExp(o.cs) : null].filter(Boolean) }));
  const any = new RegExp(S.orgs.map((o) => o.re).filter(Boolean).join("|"), "i");
  const anyCs = new RegExp(S.orgs.map((o) => o.cs).filter(Boolean).join("|") || "$^");
  for (const o of S.orgs) S.orgHits.set(o.id, new Map());
  for (const p of S.pages) {
    if (p.kind === "section") continue;
    [p.title, ...p._text].forEach((txt, i) => {
      if (!any.test(txt) && !anyCs.test(txt)) return;
      for (const { o, res } of pats) {
        let m = null;
        for (const r of res) { m = txt.match(r); if (m) break; }
        if (!m) continue;
        const hits = S.orgHits.get(o.id);
        if (!hits.has(p.id)) hits.set(p.id, { inTitle: false, blocks: [] });
        const h = hits.get(p.id);
        if (i === 0) { h.inTitle = true; continue; }
        h.blocks.push({ b: i - 1, term: m[0] });
        const k = p.id + ":" + (i - 1); if (!S.unitOrgs.has(k)) S.unitOrgs.set(k, new Set()); S.unitOrgs.get(k).add(o.id);
      }
    });
  }
  S.orgs = S.orgs.filter((o) => S.orgHits.get(o.id).size);
}
const orgPagesFor = (o) => [...S.orgHits.get(o.id)].map(([id, h]) => [S.byId.get(id), h]).filter(([p]) => popOk(p));
const orgCount = (o) => orgPagesFor(o).length;
// Charts whose own text (pathway boxes or chart text) contains one of the given passages.
function chartsForHits(hits) {
  const out = new Set();
  for (const [p, h] of hits) for (const x of h.blocks) {
    const u = p._units?.[x.b]; if (!u) continue;
    const c = (S.charts || []).find((c) => c.p === p && c.gi != null && (c.gi === u.gi || (p.guide.blocks[u.gi]?.t === "figtext" && c.gi === u.gi - 1)));
    if (c) out.add(c);
  }
  return [...out];
}
function tally(hits, map) {   // how many quoted passages name each co-mentioned item
  const n = new Map();
  for (const [p, h] of hits) for (const x of h.blocks) for (const k of map.get(p.id + ":" + x.b) || []) n.set(k, (n.get(k) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]);
}
function statTiles(items) {
  return el("div", { class: "stat-row" }, items.filter(Boolean).map(([n, label, href]) =>
    el(href ? "a" : "div", { class: "stat", href }, el("span", { class: "stat-n", text: String(n) }), el("span", { class: "stat-l", text: label }))));
}
function chipRow(label, chips, more) {
  if (!chips.length) return null;
  return el("div", { class: "syn-row" }, el("div", { class: "syn-k", text: label }), el("div", { class: "chips" }, chips, more || null));
}
// Hits grouped by condition (in body-system order), then resources; each group expands to its quoted passages.
function hitGroups(hits, term) {
  const conds = new Map(), res = [];
  for (const [p, h] of hits) {
    if (p.kind === "cond") { if (!conds.has(p.cond)) conds.set(p.cond, []); conds.get(p.cond).push([p, h]); }
    else res.push([p, h]);
  }
  const groupRow = (title, sub, ph, id) => el("li", {}, el("details", { class: "exp", id },
    el("summary", { class: "row" }, el("span", { class: "row-main" }, el("span", { class: "row-title", text: title }),
      el("span", { class: "row-sub", text: sub })), popBadges(ph.map(([p]) => p)), el("span", { class: "chev chev-d", "aria-hidden": "true" })),
    el("div", { class: "exp-body" }, ph.map(([p, h]) => el("div", { class: "exp-page" },
      el("a", { class: "exp-title", href: `#/p/${enc(p.id)}?q=${enc(h.blocks[0]?.term || term)}${h.blocks[0] ? "&b=" + h.blocks[0].b : ""}` }, `${p.title} · ${versionLabel(p)}`),
      passages(p, h, 3),
      h.blocks.length > 3 ? el("a", { class: "psg-more", href: `#/p/${enc(p.id)}?q=${enc(h.blocks[0].term)}` }, `${h.blocks.length - 3} more in this guideline →`) : null)))));
  const mentions = (ph) => plural(ph.reduce((s, [, h]) => s + h.blocks.length, 0), "passage");
  const sys = S.tax.systems.map((sy) => {
    const items = [...conds].filter(([cid]) => S.cond.get(cid).system === sy.id).sort((a, b) => S.cond.get(a[0]).name.localeCompare(S.cond.get(b[0]).name));
    return items.length ? section(sy.name, el("ul", { class: "list" }, items.map(([cid, ph]) => groupRow(S.cond.get(cid).name,
      `${[...new Set(ph.map(([p]) => versionLabel(p)))].join(" · ")} · ${mentions(ph)}`, ph, "cond-" + cid)))) : null;
  });
  const byRes = new Map();
  for (const [p, h] of res) { const k = p.res ? S.res.get(p.res).name : p.category || "Other"; if (!byRes.has(k)) byRes.set(k, []); byRes.get(k).push([p, h]); }
  return { sys, res: byRes.size ? section("Dosing, resources & education", el("ul", { class: "list" },
    [...byRes].map(([k, ph]) => groupRow(k, `${plural(ph.length, "page")} · ${mentions(ph)}`, ph)))) : null, nConds: conds.size };
}
function viewOrganisms(params = new URLSearchParams()) {
  setBar("Organisms"); setTab("cond");
  let f = params.get("f") || "";
  const holder = el("div");
  const paint = () => {
    const q = f.trim().toLowerCase();
    const match = (o) => !q || [o.name, ...o.aka].some((x) => x.toLowerCase().includes(q));
    const groups = S.orgCats.map((c) => [c, S.orgs.filter((o) => o.cat === c.id && match(o) && orgCount(o)).sort((a, b) => orgCount(b) - orgCount(a) || a.name.localeCompare(b.name))]).filter(([, os]) => os.length);
    const top = q ? [] : S.orgs.filter((o) => orgCount(o)).sort((a, b) => orgCount(b) - orgCount(a)).slice(0, 8);
    holder.replaceChildren(
      top.length ? section("Most referenced", el("div", { class: "org-tiles" }, top.map((o) => el("a", { class: "org-tile", href: `#/o/${o.id}`, "data-cat": o.cat },
        orgName(o, "org-tile-name"), el("span", { class: "org-tile-n", text: plural(orgCount(o), "guideline") }))))) : null,
      !q ? el("nav", { class: "cat-jump", "aria-label": "Jump to group" }, el("div", { class: "hscroll" }, groups.map(([c]) =>
        el("button", { type: "button", class: "chip cat-chip", "data-cat": c.id, onclick: () => $("cat-" + c.id)?.scrollIntoView({ behavior: "smooth", block: "start" }) }, c.name)))) : null,
      ...(groups.length ? groups.map(([c, os]) => el("section", { class: "sec org-sec", id: "cat-" + c.id, "data-cat": c.id },
        el("h2", { class: "sec-h org-sec-h" }, el("span", { class: "org-dot", "aria-hidden": "true" }), c.name, el("span", { class: "org-sec-n", text: String(os.length) })),
        list(...os.map((o) => el("li", {}, el("a", { class: "row", href: `#/o/${o.id}` },
          el("span", { class: "row-main" }, orgName(o, "row-title"), o.aka.length ? el("span", { class: "row-sub", text: o.aka.join(" · ") }) : null),
          el("span", { class: "count", text: String(orgCount(o)) }), chev()))))))
        : [emptyState("No matching organisms", "Try a genus, species or abbreviation, e.g. Klebsiella, MRSA or CMV.")]));
  };
  paint();
  const cat = params.get("cat");
  if (cat) requestAnimationFrame(() => $("cat-" + cat)?.scrollIntoView({ block: "start" }));
  mount(largeTitle("Organisms", `${S.orgs.length} organisms named in the guidelines, grouped by Gram stain and morphology.`), browseSwitch("organisms"),
    searchField("Find an organism", f, (v) => { f = v; paint(); history.replaceState(null, "", "#/organisms" + (v ? "?f=" + enc(v) : "")); }),
    popSwitch(() => viewOrganisms(new URLSearchParams(f ? "f=" + f : ""))), holder,
    el("p", { class: "hint", text: "Number = guidelines that mention the organism. Groups follow standard Gram-stain and morphology classification; they are a browsing aid, not guideline text." }));
}
function viewOrganism(id, condition) {
  const o = S.orgs.find((x) => x.id === id); if (!o) return viewMissing();
  setBar(orgCatName(o.cat), { back: true, save: "org:" + o.id }); setTab("cond");
  pushRecent("org:" + o.id);
  let hits = orgPagesFor(o);
  if (condition) { if (!S.cond.get(condition)) return viewMissing(); hits = hits.filter(([p]) => p.cond === condition); }
  hits.sort((a, b) => b[1].inTitle - a[1].inTitle || b[1].blocks.length - a[1].blocks.length);
  const nPass = hits.reduce((s, [, h]) => s + h.blocks.length, 0);
  const g = hitGroups(hits, o.name);
  const drugs = tally(hits, S.unitDrugs).slice(0, 12);
  const charts = chartsForHits(hits);
  const conds = [...new Set(hits.filter(([p]) => p.kind === "cond").map(([p]) => p.cond))];
  const kin = S.orgs.filter((x) => x.cat === o.cat && x !== o && orgCount(x)).sort((a, b) => orgCount(b) - orgCount(a)).slice(0, 8);
  const synopsis = el("section", { class: "synopsis", "data-cat": o.cat, "aria-label": "Synopsis" },
    el("div", { class: "syn-head" }, el("span", { class: "org-dot", "aria-hidden": "true" }), el("span", { class: "syn-cat", text: orgCatName(o.cat) })),
    statTiles([[hits.length, hits.length === 1 ? "guideline" : "guidelines"], [g.nConds, g.nConds === 1 ? "condition" : "conditions", g.nConds ? "#where" : null], [nPass, nPass === 1 ? "passage" : "passages"], charts.length ? [charts.length, charts.length === 1 ? "chart" : "charts", "#org-charts"] : null]),
    chipRow("Covered in", conds.map((cid) => el("a", { class: "chip", href: `#/o/${o.id}/${cid}`, text: S.cond.get(cid).name }))),
    chipRow("Antibiotics named with it", drugs.map(([n, k]) => el("a", { class: "chip chip-count", href: `#/d/${enc(n)}` }, el("span", { text: n }), el("span", { class: "chip-n", text: String(k) })))),
    el("p", { class: "syn-note", text: "Counts are guideline passages that name both. Open a passage to read the recommendation in full." }));
  mount(el("nav", { class: "breadcrumbs", "aria-label": "Breadcrumb" }, el("a", { href: "#/organisms", text: "Organisms" }), el("span", { text: "/" }),
      condition ? el("a", { href: `#/o/${o.id}` }, orgName(o)) : el("a", { href: `#/organisms?cat=${o.cat}`, text: orgCatName(o.cat) })),
    el("header", { class: "large" }, el("h1", {}, condition ? S.cond.get(condition).name : orgName(o)),
      el("p", { class: "large-sub" }, condition ? orgName(o) : o.aka.length ? "Also: " + o.aka.join(", ") : null)),
    popSwitch(() => viewOrganism(id, condition)),
    !hits.length ? emptyState("Not mentioned for this population", "Switch to All to see every guideline.") : [
      condition ? null : synopsis,
      el("h2", { class: "group-h", id: "where", text: condition ? "Guidelines" : `Where it appears · ${plural(g.nConds, "condition")}` }),
      g.sys, g.res,
      charts.length && !condition ? section("Flowcharts that name it", el("div", { class: "chart-grid", id: "org-charts" }, charts.map(chartCard))) : null,
      kin.length && !condition ? section("Related in " + orgCatName(o.cat), el("div", { class: "chips" }, kin.map((x) => el("a", { class: "chip", href: `#/o/${x.id}` }, orgName(x))))) : null]);
  if (hits.length === 1 || condition) document.querySelector("#view details.exp")?.setAttribute("open", "");
}

function browseSwitch(active) {
  return el('nav', {class:'browse-switch', 'aria-label':'Browse guidelines by'},
    el('a', {href:'#/conditions', 'aria-current':active==='conditions'?'page':null}, 'By condition'),
    el('a', {href:'#/organisms', 'aria-current':active==='organisms'?'page':null}, 'By organism'));
}
function sourceParagraphs(cell, terms) {
  return (cell||[]).map(r=>{
    const text=plainRuns(r), trimmed=text.trim();
    const cls=/^(OR|AND|AND\/OR|PLUS|\+)$/i.test(trimmed)?'conj':/^[•▪]/.test(trimmed)?'source-bullet':/^o\s/.test(trimmed)?'source-bullet source-nested':
      trimmed.length<100 && (/:$/.test(trimmed) || r.every(x=>!x[0].trim()||(x[1]||'').includes('b')))?'lbl':null;
    return el('p',{class:cls},runsEl(r,terms));
  });
}
function clinicalTable(b,gi,unitOf,terms) {
  const head=b.head||[], cols=Math.max(head.length,...b.rows.map(r=>r.length));
  const grid=isGrid(b), complex=b.rows.some(row=>row.some(c=>parasText(c).length>1500));
  const result = el('section',{class:'clinical-table '+(grid||complex?'table-scroll':'table-responsive')+(b.layout?' '+b.layout:''),id:`g${gi}`},
    b.caption?el('h3',{class:'tb-cap'},highlight(b.caption,terms)):null,
    (b.shared||[]).length?el('div',{class:'shared-note'},el('div',{class:'shared-h',text:'Applies to every row of this table'}),
      b.shared.map((sh,si)=>el('div',{class:'shared-item','data-u':unitOf(gi,'s'+si)},sh.label?el('div',{class:'shared-label',text:sh.label}):null,sourceParagraphs(sh.p,terms)))):null,
    grid||complex?el('p',{class:'table-hint',text:'Scroll within the table to view all columns.'}):null,
    el('div',{class:'table-viewport',tabindex:'0',role:'region','aria-label':(b.caption||'Guideline table')+', horizontally scrollable'},
      el('table',{},head.length?el('thead',{},el('tr',{},Array.from({length:cols},(_,ci)=>el('th',{scope:'col'},highlight(head[ci]||'',terms))))):null,
        el('tbody',{},b.rows.map((row,ri)=>el('tr',{'data-u':unitOf(gi,ri)},Array.from({length:cols},(_,ci)=>{
          const tag=ci===0?'th':'td';
          return el(tag,{scope:ci===0?'row':null,'data-label':head[ci]||null},sourceParagraphs(row[ci],terms));
        })))))));
  if(head.some(h=>/^(References|Revision history)$/i.test(h?.trim()||''))) { result.removeAttribute('id'); return el('details',{class:'extra source-references',id:`g${gi}`},el('summary',{},head.filter(Boolean).join(' · ')),result); }
  return result;
}
// An explicit layout for the supplied adult GAS example. It consumes the original runs
// in their original sequence and falls back to the generic reader if the shape changes.
function gasPresentation(p, terms) {
  if(p.id!=='guidelines~outpatient~GAS-adult') return null;
  const bs=p.guide.blocks, b=bs[2], full=(b?.rows?.[0]||[]).map((c,i)=>[c,i]).filter(([c])=>c&&c.length), a=full[0]?.[0], d=full[1]?.[0];
  const headFor=(i)=>b?.head?.[i]||'';
  if(a?.length!==22 || d?.length!==28 || plainRuns(a[1])!=='Penicillin V' || plainRuns(d[25])!=='Comments') return null;
  const unit=p._units.findIndex(u=>u.gi===2&&u.ri===0);
  const para=(r)=>el('p',{},runsEl(r,terms));
  const heading=(id,r)=>el('h2',{id,class:'rd-h'},runsEl(r,terms));
  const regimen=(label,body)=>el('tr',{},el('th',{scope:'row'},runsEl(label,terms)),el('td',{},sourceParagraphs(body,terms)));
  const alternative=(r)=>el('tr',{class:'regimen-or'},el('td',{colspan:'2'},runsEl(r,terms)));
  const out=[el('section',{class:'scope-panel',id:'gas-scope','data-u':0},el('div',{class:'eyebrow',text:'Guideline scope'}),para(bs[0].r)),
    el('aside',{class:'clinical-note','data-u':1},para(bs[1].r)),
    el('section',{class:'gas-treatment',id:'g2','data-u':unit},
      el('h2',{class:'rd-h',id:'gas-treatment',text:headFor(full[0][1])||b.head.find(Boolean)}),
      el('h3',{class:'treatment-group'},runsEl(a[0],terms)),
      el('div',{class:'clinical-table regimen-table table-responsive'},el('div',{class:'table-viewport'},el('table',{},
        el('thead',{},el('tr',{},el('th',{scope:'col',text:'Medication'}),el('th',{scope:'col',text:'Regimen'}))),
        el('tbody',{},regimen(a[1],a.slice(2,8)),alternative(a[8]),regimen(a[9],a.slice(10,14)),alternative(a[14]),regimen(a[15],a.slice(16,17)))))),
      el('section',{class:'allergy-regimens'},el('h3',{class:'treatment-group'},runsEl(a[17],terms)),para(a[18])),
      el('section',{class:'allergy-regimens'},el('h3',{class:'treatment-group'},runsEl(a[19].slice(0,3),terms)),para(a[19].slice(3)),para(a[20]),para(a[21])),
      el('div',{class:'eyebrow source-column-title',text:headFor(full[1][1])}),
      heading('gas-duration',d[0]),para(d[1]),
      el('section',{class:'guidance-panel'},el('h3',{},runsEl(d[2],terms)),sourceParagraphs(d.slice(3,8),terms)),
      el('section',{class:'guidance-panel'},el('h3',{},runsEl(d[8],terms)),sourceParagraphs(d.slice(9,25),terms)),
      el('section',{class:'comments-panel'},heading('gas-comments',d[25]),sourceParagraphs(d.slice(26),terms)))];
  // All remaining blocks, footnotes, references, and revision information still use the shared reader.
  out.push(...renderGuide({...p,guide:{...p.guide,blocks:bs.map((x,i)=>i<3?{t:'skip'}:x)}},terms,true));
  return out;
}
function readerContents(article) {
  const versions=article.querySelector('.versions'), agents=[...article.querySelectorAll('.agents')];
  if(versions || agents.length) { const tools=el('div',{class:'reader-tools'}); const first=versions||agents[0]; first.before(tools); if(versions) tools.append(versions); agents.forEach(a=>tools.append(a)); }
  const nav=article.querySelector('.toc');
  if(nav) nav.remove();
  const headings=[...article.querySelectorAll('.rd-body h2[id],.rd-body h3[id],.rd-body .tb-cap')].filter(n=>n.textContent.length<160);
  if(!headings.length) return;
  headings.forEach((n,i)=>{if(!n.id)n.id='section-'+i;});
  const contents=el('details',{class:'reader-contents'},el('summary',{},`On this page · ${plural(headings.length,'section')}`),
    el('nav',{'aria-label':'On this page'},headings.map(n=>el('button',{type:'button',onclick:()=>{let d=n.parentElement;while(d){if(d.tagName==='DETAILS')d.open=true;d=d.parentElement;}n.scrollIntoView({behavior:'smooth',block:'start'});}},n.textContent))));
  article.querySelector('.rd-body').before(contents);
}
function applyTheme(theme=store.get('theme','system')) {
  document.documentElement.dataset.theme=theme;
}
function appearanceControl() {
  const wrap=el('div',{class:'appearance-control',role:'group','aria-label':'Appearance'});
  ['system','light','dark'].forEach(t=>wrap.append(el('button',{type:'button','aria-pressed':String((store.get('theme','system'))===t),onclick:()=>{store.set('theme',t);applyTheme(t);wrap.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.textContent.toLowerCase()===t)));}},t[0].toUpperCase()+t.slice(1))));
  return wrap;
}

/* ---------- router ---------- */
function route(requestedHash) {
  const currentHash = typeof requestedHash === "string" ? requestedHash : location.hash;
  const [path, qs] = (currentHash.slice(1) || "/").split("?");
  const params = new URLSearchParams(qs || "");
  const [, a, b, c] = path.split("/").map((x) => x && decodeURIComponent(x));
  const keep = a === "p" && params.get("b");
  if (!keep) window.scrollTo(0, 0);
  ({ "": viewHome, undefined: viewHome, conditions: () => viewConditions(params), organisms: () => viewOrganisms(params), o: () => viewOrganism(b, c), c: () => viewCondition(b), p: () => viewPage(b, params),
    drugs: () => viewDrugs(params), d: () => viewDrug(b), res: viewResources, r: () => viewResource(b), files: () => viewLinks("files"),
    staff: () => viewLinks("staff"), search: () => viewSearch(params), saved: viewSaved, about: viewAbout,
    charts: () => viewCharts(params), chart: () => viewChart(b, c) }[a] || viewMissing)();
  $("view").focus({ preventScroll: true });
  document.title = (document.querySelector("#view h1")?.textContent || $("bar-title").textContent || "ASP Guide") + " · ASP Guide";
  syncSavedBtn();
  window.dispatchEvent(new Event("asp:route"));
}

$("back").addEventListener("click", () => (history.length > 1 ? history.back() : (location.hash = "#/")));
$("aa").addEventListener("click", () => { S.size = (S.size + 1) % SIZES.length; store.set("size", S.size); applySize(); toast(["Small", "Default", "Large", "Extra large"][S.size] + " text"); });
$("searchbtn").addEventListener("click", () => (location.hash = "#/search"));

(async function start() {
  applySize();
  applyTheme(["light","dark"].includes(new URLSearchParams(location.search).get("theme")) ? new URLSearchParams(location.search).get("theme") : store.get("theme","system"));
  try { await load(); }
  catch (e) {
    mount(emptyState("Guidelines not loaded", "data/content.json is missing or unreadable. Run the capture script, or reconnect and reload."));
    console.error(e); return;
  }
  $("demo").hidden = !S.data.demo;
  window.addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
