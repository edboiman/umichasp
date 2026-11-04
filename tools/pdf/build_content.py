"""Merge converted PDFs into the app's content.json, with figures for chart/flowchart pages."""
import json, re, sys, pathlib
import pypdfium2 as pdfium, pdfplumber
import flow as FL
sys.path.insert(0, ".")
from convert import runs_text

IN = pathlib.Path("in")
APP = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/home/claude/umichasp")
FIG = APP / "data" / "fig"
src = json.load(open(IN / "content.json", encoding="utf-8"))
conv = json.load(open("converted.json"))
figs = json.load(open("figure_pages.json"))

DISCLAIMER = re.compile(r"^The recommendations in this guide are meant to serve", re.I)
DRUGW = {w.lower() for d in json.load(open(APP / "data" / "drugs.json", encoding="utf-8")) for n in [d["name"], *d["aliases"]] for w in re.findall(r"[A-Za-z]{4,}", n)}


def R(runs):
    """compact runs: [text, flags]  flags: b=bold i=italic s=superscript"""
    out = []
    for r in runs:
        f = ("b" if r.get("b") else "") + ("i" if r.get("i") else "") + ("s" if r.get("s") else "")
        if out and out[-1][1] == f: out[-1][0] += r["t"]
        else: out.append([r["t"], f])
    return [x if x[1] else [x[0]] for x in out]


def cell_paras(cell): return [R(p) for p in cell if runs_text(p).strip()]
def ctext(cell): return " ".join(runs_text(p) for p in cell).strip()
def all_bold(cell): return bool(cell) and all(all(r.get("b") for r in p if r["t"].strip()) for p in cell if runs_text(p).strip())


def structure_table(rows, meta):
    """-> list of blocks: table segments with caption/head/rows; references and history go to meta."""
    out, seg = [], None
    mode = None
    def new_seg(caption=None):
        nonlocal seg
        seg = {"t": "table", "caption": caption, "head": None, "rows": []}
        out.append(seg)
    for r in rows:
        cells = r["cells"]
        texts = [ctext(c) for c in cells]
        joined = " ".join(texts)
        m = re.search(r"Last revised:?\s*([\d/]+)", joined, re.I)
        if m:
            meta["revised"] = m.group(1); mode = None
            continue
        if r["span"]:
            t = texts[0]
            if re.fullmatch(r"references?", t, re.I): mode = "refs"; continue
            if re.fullmatch(r"revision history", t, re.I): mode = "hist"; continue
            if re.fullmatch(r"footnotes?", t, re.I): mode = None; new_seg("Footnotes"); continue
            mode = None
            span_paras = [p for p in cells[0] if runs_text(p).strip()]
            if len(t) > 110 or len(span_paras) > 1 and len(t) > 60:
                # a full-width row holding content, not a caption: keep it as text
                for p in span_paras:
                    out.append({"t": "p", "r": R(p)})
                seg = None
                continue
            if seg is None or seg["rows"] or seg["caption"]:
                new_seg(t)
            else:
                seg["caption"] = t
            continue
        if mode == "refs":
            if re.fullmatch(r"\s*(citation)?\s*", " ".join(texts[1:]) if len(texts) > 1 else texts[0], re.I) and not texts[0].strip().isdigit():
                continue
            meta.setdefault("refs", []).append(" ".join(t for t in texts if t).strip()); continue
        if mode == "hist":
            if [t.lower() for t in texts[:2]] == ["date", "revision"]: continue
            meta.setdefault("history", []).append([t for t in texts if t]); continue
        if seg is None: new_seg()
        is_head = (seg["head"] is None and not seg["rows"] and len(cells) > 1 and all(all_bold(c) or not ctext(c) for c in cells)
                   and all(len(t) < 140 for t in texts))
        head_like = (len(cells) > 1 and all(all_bold(c) or not ctext(c) for c in cells) and all(len(t) < 140 for t in texts))
        if is_head:
            seg["head"] = [head_text(c) for c in cells]
            seg["_hrows"] = [[cell_paras(c) for c in cells]]
        elif head_like and seg["head"] is not None and not seg["rows"] and len(cells) == len(seg["head"]):
            # second line of a two-row header: join onto the first (undone below if the table turns out to have no body rows)
            seg["head"] = [" ".join(x for x in (h, head_text(c)) if x).strip() for h, c in zip(seg["head"], cells)]
            seg.setdefault("_hrows", []).append([cell_paras(c) for c in cells])
        else:
            seg["rows"].append([cell_paras(c) for c in cells])
            seg.setdefault("_v", []).append(set(r.get("v", [])))
    res = []
    for s in out:
        if s["t"] != "table": res.append(s); continue
        hrows = s.pop("_hrows", None)
        if not s["rows"] and hrows and len(hrows) > 1:
            # all-bold grid with no body (e.g. a contents grid): keep each source row as its own row instead of one merged header
            s["head"] = None; s["rows"] = hrows; s["_v"] = [set() for _ in hrows]
        if not (s["rows"] or s["head"]):
            if s.get("caption"): res.append({"t": "h", "l": 3, "r": [[s["caption"], "b"]]})
            continue
        n = max([len(r) for r in s["rows"]] + [len(s["head"] or [])])
        def has(i): return (s["head"] and i < len(s["head"]) and s["head"][i]) or any(i < len(r) and r[i] for r in s["rows"])
        keep = [i for i in range(n) if has(i)]
        if s["head"]: s["head"] = [s["head"][i] if i < len(s["head"]) else "" for i in keep]
        s["rows"] = [[r[i] if i < len(r) else [] for i in keep] for r in s["rows"]]
        # A column filled only in the first row and inherited (row-spanning) by every later row applies to all rows.
        vs = s.pop("_v", [])
        if len(s["rows"]) > 1 and len(vs) == len(s["rows"]):
            for i in range(len(keep)):
                src_i = keep[i]
                if s["rows"][0][i] and all(not r[i] for r in s["rows"][1:]) and all(src_i in v for v in vs[1:]):
                    s.setdefault("shared", []).append({"label": s["head"][i] if s["head"] else "", "p": s["rows"][0][i]})
                    s["rows"][0][i] = []
            if s.get("shared"):
                emptycols = [i for i in range(len(keep)) if all(not r[i] for r in s["rows"])]
                if s["head"]: s["head"] = [h for i, h in enumerate(s["head"]) if i not in emptycols]
                s["rows"] = [[c for i, c in enumerate(r) if i not in emptycols] for r in s["rows"]]
        res.append(s)
    return res


def render_fig(key, pg, w=1200):
    FIG.mkdir(parents=True, exist_ok=True)
    pdf = pdfium.PdfDocument(str(IN / "pdfs" / f"{key}.pdf"))
    page = pdf[pg - 1]
    pw, ph = page.get_size()
    img = page.render(scale=w / pw).to_pil().convert("RGB")
    name = f"{key.replace('~', '-')}-p{pg}.webp"
    img.save(FIG / name, "WEBP", quality=82, method=5)
    return {"img": f"data/fig/{name}", "w": img.width, "h": img.height}


def is_flow_page(info): return info["shapes"] >= 10 and info["arrows"] >= 6
def is_fig_page(info): return len(info["lost"]) >= 4 or is_flow_page(info)

SUP = str.maketrans("0123456789-+", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺")   # a superscript comma stays a plain comma ("³,⁴")
def head_text(cell):
    return " ".join("".join(r["t"].translate(SUP) if r.get("s") else r["t"] for r in p) for p in cell).strip()


pages_out = []
stats = {"docs": 0, "figs": 0, "blocks": 0}
for p in src["pages"]:
    p = dict(p)
    p["blocks"] = [b for b in p.get("blocks", []) if b.get("t") != "p" or not re.search(r"\.(pdf|docx?)$", b.get("x", ""), re.I)]
    key = p["id"]
    if key in conv and "error" not in conv[key]:
        c = conv[key]
        meta = {"pages": c["pages"]}
        fig_pages = {f["pg"]: f for f in figs.get(key, []) if is_fig_page(f)}
        blocks, seen_fig, title = [], set(), None
        for b in c["blocks"]:
            pg = b.get("pg")
            if pg in fig_pages and pg not in seen_fig:
                seen_fig.add(pg)
                fig = {"t": "fig", "pg": pg, **render_fig(key, pg)}
                if is_flow_page(fig_pages[pg]):
                    with pdfplumber.open(str(IN / "pdfs" / f"{key}.pdf"), laparams=FL.LAP) as P:
                        fp = FL.flow_page(P.pages[pg - 1])
                    if fp and sum(len(c["nodes"]) for c in fp["cols"]) >= 3:
                        fb = FL.to_block(fp, pg)
                        for c in fb["cols"]:
                            for n in c["nodes"]: n["p"] = [R(x) for x in n["p"]]
                        fb["notes"] = [[R(x) for x in n] for n in fb["notes"]]
                        fb["fig"] = {k: fig[k] for k in ("img", "w", "h")}
                        blocks.append(fb); stats["flows"] = stats.get("flows", 0) + 1
                        fig = None
                if fig: blocks.append(fig); stats["figs"] += 1
            if pg in fig_pages and any(x["t"] == "flow" and x["pg"] == pg for x in blocks):
                continue                    # flow block replaces this page's raw text
            hidden = pg in fig_pages
            if b["t"] == "table":
                for tb in structure_table(b["rows"], meta):
                    tb["pg"] = pg
                    if hidden: tb["hide"] = 1
                    blocks.append(tb)
                continue
            txt = runs_text(b["runs"]).strip()
            if not txt or DISCLAIMER.match(txt) or re.fullmatch(r"(page \d+( of \d+)?|\d+)", txt, re.I):
                continue
            if title is None and b["t"] == "h":
                title = txt; continue
            nb = {"t": b["t"], "r": R(b["runs"]), "pg": pg}
            if b["t"] == "h": nb["l"] = min(max(b.get("l", 2), 2), 4)
            if b["t"] == "li": nb["d"] = b.get("d", 0)
            if hidden: nb["hide"] = 1
            blocks.append(nb)
        # Safety net: PDF lines whose drug names or numbers are missing from this page's app content are added verbatim.
        pdfd = pdfium.PdfDocument(str(IN / "pdfs" / f"{key}.pdf"))
        def page_app_text(pg):
            parts = list(meta.get("refs") or []) + [" ".join(h) for h in meta.get("history") or []]
            for x in blocks:
                if x.get("pg") not in (pg - 1, pg, pg + 1) or x["t"] == "rec": continue
                if x["t"] == "table":
                    parts += (x.get("head") or []) + [x.get("caption") or ""] + [" ".join("".join(q[0] for q in para) for para in c) for r in x["rows"] for c in r]
                    parts += [s.get("label", "") + " " + " ".join("".join(q[0] for q in para) for para in s["p"]) for s in x.get("shared", [])]
                elif x["t"] == "flow":
                    parts += [(c.get("head") or "") + " " + " ".join("".join(q[0] for q in para) for para in n["p"]) for c in x["cols"] for n in c["nodes"]]
                elif "r" in x: parts.append("".join(q[0] for q in x["r"]))
            if pg == 1: parts.append(title or "")
            return " ".join(parts)
        SUPN = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
        def tk(s): return set(t.lower() for t in re.findall(r"[A-Za-z]{4,}|\d+(?:[.,]\d+)*", re.sub(r"([A-Za-z])(\d{1,2})\b", r"\1 \2", s.translate(SUPN))))
        added = 0
        def alnum(s): return re.sub(r"[^a-z0-9]", "", s.translate(SUPN).lower())
        doc_alnum = alnum(" ".join(page_app_text(q) for q in range(1, len(pdfd) + 1)))
        for pg in range(1, len(pdfd) + 1):
            if pg in fig_pages and any(x["t"] == "fig" and x["pg"] == pg for x in blocks): continue
            have = tk(page_app_text(pg))
            recovered = []
            for line in pdfd[pg - 1].get_textpage().get_text_range().splitlines():
                line = " ".join(line.split())
                if not line or DISCLAIMER.match(line) or re.search(r"(?i)page \d+ of \d+|meant to serve|call 911|last revised|subcommittee", line): continue
                if re.fullmatch(r"[-–\d.,%/ ]+", line) or re.fullmatch(r"(?i)[\d\-–<>= ]*\s*m?l/min\s*crcl\s*\d*", line): continue
                lt = tk(line)
                important = {t for t in lt if t in DRUGW or (re.fullmatch(r"\d+(?:[.,]\d+)*", t) and len(t) >= 2)}
                if important - have and alnum(line) not in doc_alnum:
                    recovered.append(line); have |= lt
            if recovered:
                at = max([i for i, x in enumerate(blocks) if x.get("pg") == pg] or [len(blocks) - 1]) + 1
                blocks[at:at] = [{"t": "rec", "pg": pg, "lines": recovered}]
                added += len(recovered)
        stats["recovered_lines"] = stats.get("recovered_lines", 0) + added
        # merge consecutive table segments split by a page break (same head)
        merged = []
        for b in blocks:
            if (b["t"] == "table" and merged and merged[-1]["t"] == "table" and not b.get("caption")
                    and json.dumps(b.get("shared")) == json.dumps(merged[-1].get("shared"))
                    and (b.get("head") is None or b.get("head") == merged[-1].get("head"))
                    and len(b["rows"][0]) == len(merged[-1]["rows"][0] if merged[-1]["rows"] else merged[-1]["head"] or [])):
                merged[-1]["rows"] += b["rows"]; continue
            merged.append(b)
        p["guide"] = {"title": title, **meta, "blocks": merged}
        p["blocks"] = []          # site-page text is replaced by the guideline content
        stats["docs"] += 1; stats["blocks"] += len(merged)
    p.pop("docs", None)
    pages_out.append(p)

out = dict(src, pages=pages_out)
out.pop("demo", None)
(APP / "data").mkdir(parents=True, exist_ok=True)
(APP / "data" / "content.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
size = (APP / "data" / "content.json").stat().st_size // 1024
print(stats, f"content.json {size} KB", f"figures {sum(f.stat().st_size for f in FIG.glob('*.webp')) // 1024} KB" if FIG.exists() else "")
