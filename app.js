"use strict";
// ASP Guide: offline phone reference built from a one-time capture.
// Captured text is only ever inserted with textContent (never innerHTML).

const $ = (id) => document.getElementById(id);
/* ---------- storage (never required) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("asp." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("asp." + k, JSON.stringify(v)); } catch {} },
};

const S = {
  data: null, drugs: [], tax: null, pages: [], byId: new Map(), byPath: new Map(),
  cond: new Map(), res: new Map(), sections: [], drugHits: new Map(), files: [], staff: [],
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
  const [data, drugs, tax] = await Promise.all([get("data/content.json"), get("data/drugs.json"), get("data/taxonomy.json")]);
  Object.assign(S, { data, drugs, tax, pages: data.pages || [] });
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
      }
    });
  }
}

const popOk = (p) => S.pop === "all" || p.pop === S.pop || p.kind === "section";
const popLabel = (p) => (p.pop === "peds" ? "Pediatric" : "Adult");
const versionLabel = (p) => p.setting === "Inpatient" ? `${popLabel(p)} inpatient` : `${popLabel(p)} ${p.setting.toLowerCase()}`;
const condPages = (c) => c.pages.filter(popOk);
const drugCount = (d) => [...S.drugHits.get(d.name).keys()].filter((id) => popOk(S.byId.get(id))).length;

function snippet(text, term, len = 140) {
  if (text.length <= len) return text;
  const i = Math.max(0, term ? text.toLowerCase().indexOf(term.toLowerCase()) : 0);
  const start = Math.max(0, Math.min(i - 45, text.length - len));
  return (start ? "…" : "") + text.slice(start, start + len).trim() + (start + len < text.length ? "…" : "");
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
  const p = S.byId.get(k); return p && { href: `#/p/${enc(p.id)}`, title: p.title, sub: versionLabel(p) };
}
const sysName = (id) => S.tax.systems.find((s) => s.id === id)?.name || "";

/* ---------- shared UI ---------- */
function setBar(title, { back = false, save = null, large = false, textSize = false } = {}) {
  $("bar-title").textContent = large ? "" : title;
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
function setTab(t) { document.querySelectorAll(".tabs a").forEach((a) => a.dataset.tab === t ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")); }
function mount(...n) { $("view").replaceChildren(...n.flat().filter(Boolean)); }
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
    largeTitle("ASP Guide", `Michigan Medicine stewardship guidelines · captured ${fmtDate(S.data.captured_at)}`),
    el("a", { class: "search fake", href: "#/search" }, "Search conditions, drugs, anything"),
    popSwitch(viewHome),
    alert ? el("a", { class: "alert", href: S.data.alert.path && S.byPath.get(S.data.alert.path.toLowerCase()) ? `#/p/${enc(S.byPath.get(S.data.alert.path.toLowerCase()).id)}` : "#/about" },
      el("strong", { text: "Site alert · " }), alert, S.data.alert.link ? el("span", { class: "alert-link", text: " " + S.data.alert.link + " ›" }) : null) : null,
    section("Quick access", el("div", { class: "qa-grid" }, qa)),
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
  mount(searchField("Filter conditions", f, (v) => { f = v; paint(); history.replaceState(null, "", "#/conditions" + (v ? "?f=" + enc(v) : "")); }),
    popSwitch(() => viewConditions(new URLSearchParams(f ? "f=" + f : ""))), holder);
}

function viewCondition(id) {
  const c = S.cond.get(id);
  if (!c) return viewMissing();
  const pages = condPages(c);
  if (pages.length === 1) { location.replace(`#/p/${enc(pages[0].id)}`); return; }
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
      : emptyState(`No ${S.pop === "peds" ? "pediatric" : "adult"} guideline`, "Switch to All to see every version."));
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
const parasText = (c) => (c || []).map(plainRuns).join(" ");

// Flatten guideline blocks into searchable units (one per paragraph, bullet, heading, table row).
function guideUnits(g) {
  const units = [];
  g.blocks.forEach((b, gi) => {
    if (b.t === "table") {
      b.rows.forEach((row, ri) => {
        const parts = row.map((c, ci) => { const t = parasText(c); return t && b.head && b.head[ci] ? `${b.head[ci]}: ${t}` : t; }).filter(Boolean);
        units.push({ t: "row", x: parts.join(" · "), gi, ri, cap: b.caption, hide: b.hide });
      });
    } else if (b.t === "flow") {
      let k = 0;
      b.cols.forEach((c) => c.nodes.forEach((n) => units.push({ t: "row", x: (c.head ? c.head + ": " : "") + parasText(n.p), gi, ri: k++, cap: c.head })));
    } else if (b.t === "rec") units.push({ t: "p", x: b.lines.join(" "), gi });
    else if (b.t !== "fig") units.push({ t: b.t, x: plainRuns(b.r), gi, hide: b.hide });
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

function tableEl(b, gi, unitOf, terms) {
  const cap = b.caption ? el("h3", { class: "tb-cap", id: `g${gi}` }, highlight(b.caption, terms)) : null;
  if (isGrid(b)) {
    return el("div", { class: "tb-wrap" }, cap, el("div", { class: "rd-table", tabindex: "0", role: "region", "aria-label": (b.caption || "Table") + ", scrolls sideways" },
      el("table", {}, b.head ? el("thead", {}, el("tr", {}, b.head.map((h) => el("th", {}, highlight(h, terms))))) : null,
        el("tbody", {}, b.rows.map((r, ri) => el("tr", { "data-u": unitOf(gi, ri) }, r.map((c, ci) => (ci === 0 ? el("th", { scope: "row" }, paras(c, terms)) : el("td", {}, paras(c, terms))))))))));
  }
  // Cards: one per row. First column is the card title when there is a header; other columns get labels.
  const head = b.head || [];
  const cards = b.rows.map((r, ri) => {
    const filled = r.map((c, ci) => [c, ci]).filter(([c]) => parasText(c).trim());
    if (!filled.length) return null;
    const titled = head.length && r.length > 1;
    const [first, ...rest] = titled ? filled : [[null, -1], ...filled];
    return el("div", { class: "card-row", "data-u": unitOf(gi, ri) },
      titled && first[0] ? el("div", { class: "card-title" }, paras(first[0], terms)) : null,
      rest.map(([c, ci]) => el("div", { class: "card-cell" },
        head[ci] ? el("div", { class: "card-label", text: head[ci] }) : null,
        el("div", { class: "card-val" }, paras(c, terms)))));
  });
  return el("section", { class: "tb-cards" }, cap, cards);
}

function renderGuide(p, terms) {
  const g = p.guide, out = [];
  let ul = null, hiddenPg = null, hiddenBox = null;
  const units = p._units, idx = new Map(units.map((u, i) => [u.ri != null ? `${u.gi}:${u.ri}` : `${u.gi}`, i]));
  const unitOf = (gi, ri) => idx.get(ri != null ? `${gi}:${ri}` : `${gi}`);
  g.blocks.forEach((b, gi) => {
    if (b.t !== "li") ul = null;
    let node = null;
    if (b.t === "fig") {
      hiddenPg = b.pg; hiddenBox = el("div", { class: "rd-body" });
      out.push(el("figure", { class: "fig", id: `g${gi}` },
        el("img", { src: b.img, width: b.w, height: b.h, loading: "lazy", decoding: "async", alt: `Chart or flowchart from page ${b.pg} of the original guideline` }),
        el("figcaption", {}, "Chart from the original guideline (page " + b.pg + "). Pinch to zoom."),
        el("details", { class: "textver" }, el("summary", {}, "Text in this chart"), hiddenBox)));
      return;
    }
    if (b.t === "flow") { out.push(flowEl(b, gi, unitOf, terms)); return; }
    if (b.t === "rec") {
      out.push(el("aside", { class: "rec", "data-u": unitOf(gi) }, el("div", { class: "rec-h", text: `More text from page ${b.pg} of the original` }),
        b.lines.map((l) => el("p", {}, highlight(l, terms))))); return;
    }
    const target = b.hide && hiddenBox ? hiddenBox : null;
    if (b.t === "h") node = el(`h${b.l || 3}`, { class: "rd-h", id: `g${gi}`, "data-u": unitOf(gi) }, runsEl(b.r, terms));
    else if (b.t === "p") node = el("p", { "data-u": unitOf(gi) }, runsEl(b.r, terms));
    else if (b.t === "li") {
      const li = el("li", { class: b.d ? `d${Math.min(b.d, 3)}` : null, "data-u": unitOf(gi) }, runsEl(b.r, terms));
      const host = target ? "fig" + hiddenPg : "main";
      if (!ul || ul._host !== host) { ul = el("ul", { class: "rd-ul" }); ul._host = host; if (target) target.append(ul); else out.push(ul); }
      ul.append(li); return;
    } else if (b.t === "table") node = tableEl(b, gi, unitOf, terms);
    if (!node) return;
    if (target) target.append(node); else out.push(node);
  });
  return out;
}

// Flowchart as a pathway: each node card nests its matching nodes from the final column.
function flowEl(b, gi, unitOf, terms) {
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
    el("div", { class: "flow-top" }, el("span", { class: "flow-tag", text: "Pathway · page " + b.pg })),
    parts, (b.notes || []).map((nt) => el("div", { class: "flow-note" }, paras(nt, terms))),
    b.fig ? el("details", { class: "textver" }, el("summary", {}, "Original chart"),
      el("img", { src: b.fig.img, width: b.fig.w, height: b.fig.h, loading: "lazy", alt: "Original flowchart, page " + b.pg, class: "flow-img" })) : null);
}

function guideMeta(p) {
  const g = p.guide;
  return el("p", { class: "rd-meta" },
    g.revised ? el("span", { class: "pill pill-q", text: "Last revised " + g.revised }) : null,
    el("a", { href: safeUrl(p.url), target: "_blank", rel: "noopener noreferrer", text: "Source ↗" }));
}

function guideExtras(p) {
  const g = p.guide;
  return [
    g.refs && g.refs.length ? el("details", { class: "extra" }, el("summary", {}, `References (${g.refs.length})`),
      el("ol", { class: "refs" }, g.refs.map((r) => el("li", { text: r.replace(/^\d+\s+/, "") })))) : null,
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
    el("h1", { class: "rd-title", text: p.title }),
    sub ? el("p", { class: "rd-sub", text: sub }) : null,
    p.guide ? guideMeta(p) : null,
    siblings.length ? el("div", { class: "versions" }, el("span", { class: "versions-label", text: "Other versions" }),
      el("div", { class: "hscroll" }, siblings.map((s) => el("a", { class: "chip chip-out", href: `#/p/${enc(s.id)}` },
        el("span", { class: "chip-k", text: versionLabel(s) }), el("span", { text: s.title }))))) : null,
    toc.length >= 3 ? el("nav", { class: "toc", "aria-label": "On this page" }, el("div", { class: "hscroll" },
      toc.map(([b, i]) => el("button", { type: "button", class: "chip", onclick: () => $(p.guide ? `g${i}` : `b${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }) }, tocLabel(b).slice(0, 48))))) : null,
    agents.length ? el("details", { class: "agents" }, el("summary", {}, `Agents mentioned (${agents.length})`),
      el("div", { class: "chips" }, agents.map((d) => el("a", { class: "chip", href: `#/d/${enc(d.name)}`, text: d.name })))) : null,
    el("div", { class: "rd-body" }, p.guide ? renderGuide(p, terms) : renderBlocks(p, terms)),
    p.guide ? guideExtras(p) : null,
    !p.guide && !p.blocks.length ? el("p", { class: "muted", text: "No content was captured for this page. Open the source page below." }) : null,
    files.length ? section("Files & calculators", list(...files.map((l) => row({ href: safeUrl(l.href), title: l.text, sub: "Opens in Google Drive", external: true })))) : null,
    staff.length ? section("Staff-only links", list(...staff.map((l) => row({ href: safeUrl(l.href), title: l.text, sub: "Michigan Medicine login required", external: true })))) : null,
    el("footer", { class: "rd-foot" },
      el("p", { class: "muted", text: "Unofficial copy captured " + fmtDate(S.data.captured_at) + ". Guidance changes: confirm on the source before acting." }),
      el("a", { class: "btn", href: safeUrl(p.url), target: "_blank", rel: "noopener noreferrer", text: "Open original on source site ↗" }))));

  const b = params.get("b");
  let target = b != null ? document.querySelector(`[data-u="${CSS.escape(b)}"]`) : null;
  if (target) { const det = target.closest("details"); if (det) det.open = true; }
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
  mount(searchField("Find an antibiotic or class", f, (v) => { f = v; paint(); history.replaceState(null, "", "#/drugs" + (v ? "?f=" + enc(v) : "")); }),
    popSwitch(() => viewDrugs(new URLSearchParams(f ? "f=" + f : ""))),
    el("p", { class: "hint", text: "Number = guideline pages that mention the agent." }), holder);
}

function passages(p, h, limit = 2) {
  return h.blocks.slice(0, limit).map((x) => el("a", { class: "psg", href: `#/p/${enc(p.id)}?q=${enc(x.term)}&b=${x.b}` },
    highlight(snippet(p._text[x.b], x.term), [x.term])));
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

  mount(largeTitle(d.name, d.aliases.length ? "Also: " + d.aliases.join(", ") : null),
    popSwitch(() => viewDrug(name)),
    !hits.length ? emptyState("No mentions", S.pop === "all" ? "This agent isn't mentioned in the captured guidelines." : "Switch to All to include every population.") : null,
    restricted.length ? el("div", { class: "notice" }, el("strong", { text: "Restricted · " }), "Appears on ",
      restricted.map(([p], i) => [i ? ", " : "", el("a", { href: `#/p/${enc(p.id)}?q=${enc(d.name)}`, text: p.title })]), ". Check the criteria before ordering.") : null,
    dosing.length ? section("Dosing & monitoring", dosingRows(dosing)) : null,
    conds.size ? el("h2", { class: "group-h", text: `Used for · ${plural(conds.size, "condition")}` }) : null,
    condSection,
    other.length ? section("Other resources", dosingRows(other)) : null);
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
  const titles = [], text = [];
  for (const p of S.pages) {
    if (!popOk(p) || p.kind === "section") continue;
    if (all(p.title)) { titles.push(p); continue; }
    const i = p._text.findIndex((t) => all(t));
    if (i >= 0) text.push({ p, i, n: p._text.filter((t) => all(t)).length });
  }
  text.sort((a, b) => b.n - a.n);
  return { conds, drugs, titles, text: text.slice(0, 50), more: text.length > 50 };
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
        section("Try", el("div", { class: "chips" }, ["MRSA", "pyelonephritis", "cefazolin", "penicillin allergy", "Zosyn", "neutropenia"].map((t) =>
          el("button", { type: "button", class: "chip", onclick: () => { holder.previousSibling.previousSibling.querySelector("input").value = t; paint(t); } }, t)))));
      return;
    }
    const kids = [];
    if (r.conds.length) kids.push(section("Conditions", list(...r.conds.map((c) => row({ href: `#/c/${c.id}`, title: c.name, sub: sysName(c.system), terms: [first], right: popBadges(condPages(c)) })))));
    if (r.drugs.length) kids.push(section("Antibiotics", list(...r.drugs.slice(0, 8).map((d) => row({ href: `#/d/${enc(d.name)}`, title: d.name, sub: d.class, terms: [first], right: el("span", { class: "count", text: String(drugCount(d)) }) })))));
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
  setBar("Saved"); setTab("saved");
  const saved = [...S.saved].map(keyItem).filter(Boolean);
  const recent = S.recent.map(keyItem).filter(Boolean);
  mount(saved.length ? section("Saved", list(...saved.map((i) => row(i))))
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
    const queue = [...imgs];
    const worker = async () => { while (queue.length) { const u = queue.shift(); try { const r = await fetch(u); if (!r.ok) failed++; } catch { failed++; } done++; btn.textContent = `Downloading… ${done} / ${imgs.length}`; } };
    await Promise.all([worker(), worker(), worker(), worker()]);
    btn.textContent = failed ? `Done, ${failed} failed. Tap to retry.` : "All pages saved for offline";
    btn.disabled = !failed;
  });
  return btn;
}
function viewMissing() { setBar("Not found", { back: true }); mount(emptyState("Not in this capture", "Go back and try another page.")); }

/* ---------- text size ---------- */
const SIZES = [0.94, 1, 1.12, 1.25];
function applySize() { document.documentElement.style.setProperty("--rd-scale", SIZES[S.size] ?? 1); }

/* ---------- router ---------- */
function route() {
  const [path, qs] = (location.hash.slice(1) || "/").split("?");
  const params = new URLSearchParams(qs || "");
  const [, a, b] = path.split("/").map((x) => x && decodeURIComponent(x));
  const keep = a === "p" && params.get("b");
  if (!keep) window.scrollTo(0, 0);
  ({ "": viewHome, undefined: viewHome, conditions: () => viewConditions(params), c: () => viewCondition(b), p: () => viewPage(b, params),
    drugs: () => viewDrugs(params), d: () => viewDrug(b), res: viewResources, r: () => viewResource(b), files: () => viewLinks("files"),
    staff: () => viewLinks("staff"), search: () => viewSearch(params), saved: viewSaved, about: viewAbout }[a] || viewMissing)();
  $("view").focus({ preventScroll: true });
}

$("back").addEventListener("click", () => (history.length > 1 ? history.back() : (location.hash = "#/")));
$("aa").addEventListener("click", () => { S.size = (S.size + 1) % SIZES.length; store.set("size", S.size); applySize(); toast(["Small", "Default", "Large", "Extra large"][S.size] + " text"); });
$("searchbtn").addEventListener("click", () => (location.hash = "#/search"));

(async function start() {
  applySize();
  try { await load(); }
  catch (e) {
    mount(emptyState("Guidelines not loaded", "data/content.json is missing or unreadable. Run the capture script, or reconnect and reload."));
    console.error(e); return;
  }
  $("demo").hidden = !S.data.demo;
  window.addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
