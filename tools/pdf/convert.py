"""PDF -> structured blocks, verbatim. Blocks: h (heading), p, li (bullet, depth), table (rows of cells).
Text is kept as runs with bold/italic/underline flags so drug names stay bold."""
import re, statistics, unicodedata, pdfplumber
LIGS = {"\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl", "\ufb05": "st", "\ufb06": "st",
        "\ufffe": "-", "\u00ad": "", "\u2010": "-", "\u2011": "-", "\uf0b7": "•", "\uf0a7": "▪", "\uf0a8": "▪", "\uf0d8": "➢", "\uf0fc": "✓"}
def clean_chars(t):
    for a, b in LIGS.items(): t = t.replace(a, b)
    return t

BULLETS = "•▪●◦○■□➢➤►✓✔-–o§"
def is_bold(fn): return bool(re.search(r"bold|black|heavy|semibold", fn or "", re.I))
def is_ital(fn): return bool(re.search(r"italic|oblique", fn or "", re.I))

def chars_to_lines(chars, split_gaps=False):
    """Cluster characters into lines by vertical overlap (robust to bullet glyphs and superscripts)."""
    cs = []
    for c in chars:
        if c["text"] in ("\u200b", "\ufeff"): continue
        if c["text"] in LIGS or ord(c["text"][:1] or " ") > 0xf000: c = dict(c, text=clean_chars(c["text"]))
        cs.append(c)
    vertical = [c for c in cs if not c.get("upright", True)]
    cs = [c for c in cs if c.get("upright", True)]
    cs = sorted(cs, key=lambda c: (c["top"], c["x0"]))
    lines = []
    SYMS = "•▪●◦○■□➢➤►✓✔§"
    glyphs = [c for c in cs if len(c["text"].strip()) == 1 and (c["text"].strip() in SYMS or
              (c["text"].strip() in "o-–" and re.search(r"symbol|wingding|courier", c.get("fontname", ""), re.I)))]
    gl_ids = {id(c) for c in glyphs}
    for c in cs:
        if id(c) in gl_ids: continue
        best, bestd = None, 1e9
        for L in reversed(lines):
            if L["top"] < c["top"] - 3 * max(c["size"], L["size"]): break
            tol = max(1.2, .3 * min(c["size"], L["size"]))
            if not c["text"].strip(): tol = max(tol, .5 * L["size"])
            d = abs(c["bottom"] - L["base"])
            small = c["size"] < L["size"] * .82
            sup_ok = small and L["base"] - L["size"] - 1 <= c["top"] and c["bottom"] <= L["base"] + 1
            if (d <= tol or sup_ok) and d < bestd:
                best, bestd = L, d
        if best is None:
            lines.append({"chars": [c], "top": c["top"], "bottom": c["bottom"], "size": c["size"], "base": c["bottom"]})
        else:
            best["chars"].append(c)
            if c["size"] >= best["size"] * .82 and c["text"].strip():
                best["top"] = min(best["top"], c["top"]); best["bottom"] = max(best["bottom"], c["bottom"]); best["size"] = max(best["size"], c["size"])
    # superscripts/subscripts that formed their own tiny line: fold into the full-size line they sit on
    keep = []
    for L in sorted(lines, key=lambda l: l["size"]):
        vis = [c for c in L["chars"] if c["text"].strip()]
        if vis and len(vis) <= 8:
            host = None
            for M in lines:
                if M is L or M["size"] < L["size"] / .82 or not any(c["text"].strip() for c in M["chars"]): continue
                if M["top"] - 2 <= (L["top"] + L["bottom"]) / 2 <= M["bottom"] + 1:
                    mx0 = min(c["x0"] for c in M["chars"]); mx1 = max(c["x1"] for c in M["chars"])
                    lx0 = min(c["x0"] for c in vis); lx1 = max(c["x1"] for c in vis)
                    if mx0 - 6 <= lx0 and lx1 <= mx1 + 25: host = M; break
            if host is not None:
                host["chars"].extend(L["chars"]); L["chars"] = []; continue
        keep.append(L)
    lines = [L for L in lines if L["chars"]]
    # bullets: attach to the line that starts just to their right, on (nearly) the same baseline
    for g in glyphs:
        best, bestd = None, 1e9
        for L in lines:
            vis = [c for c in L["chars"] if c["text"].strip()]
            if not vis: continue
            x0 = min(c["x0"] for c in vis)
            if not (g["x1"] - 1 <= x0 <= g["x1"] + 5 * L["size"]): continue
            mid_g = (g["top"] + g["bottom"]) / 2
            if not (L["top"] - 2 <= mid_g <= L["bottom"] + 2): continue
            d = abs(mid_g - (L["top"] + L["bottom"]) / 2)
            if d < bestd: best, bestd = L, d
        if best: best["chars"].append(g)
        else: lines.append({"chars": [g], "top": g["top"], "bottom": g["bottom"], "size": g["size"], "base": g["bottom"]})
    out = vertical_lines(vertical)
    if split_gaps:   # split lines that cross between layout boxes in different columns
        boxes = split_gaps
        def box(c):
            kx, ky = round(c["x0"]), round(c["top"])
            for dx in (0, -1, 1):
                for dy in (0, -1, 1):
                    b = boxes.get((kx + dx, ky + dy))
                    if b: return b
            return None
        pieces = []
        for L in lines:
            cs2 = sorted(L["chars"], key=lambda c: c["x0"]); cur = [cs2[0]]
            for a, b in zip(cs2, cs2[1:]):
                ba, bb = box(a), box(b)
                lead = "".join(c["text"] for c in cur).strip()
                bullet_only = (lead in BULLETS or bool(re.fullmatch(r"\d{1,2}[.)]|[a-z][.)]|[ivx]+[.)]", lead))) and b["x0"] - a["x1"] < 4 * L["size"]
                if ba and bb and ba != bb and b["text"].strip() and not bullet_only and (ba[2] < bb[0] - 2 or bb[2] < ba[0] - 2):
                    pieces.append(dict(L, chars=cur)); cur = []
                cur.append(b)
            pieces.append(dict(L, chars=cur))
        lines = [dict(p, top=min(c["top"] for c in p["chars"]), bottom=max(c["bottom"] for c in p["chars"])) for p in pieces if any(c["text"].strip() for c in p["chars"])]
    for L in sorted(lines, key=lambda l: l["top"]):
        cs = sorted(L["chars"], key=lambda c: c["x0"])
        sizes = [c["size"] for c in cs if c["text"].strip()]
        if not sizes: continue
        size = statistics.median(sizes)
        runs, prev = [], None
        for c in cs:
            t = c["text"]
            sup = c["size"] < size * .82 and c["bottom"] < L["bottom"] - .8
            if prev is not None and c["x0"] - prev["x1"] > max(1.0, prev["size"] * .2) and not t.isspace():
                if not (runs and runs[-1]["t"].endswith(" ")): t = " " + t
            fl = {"b": is_bold(c["fontname"]), "i": is_ital(c["fontname"]), "sup": sup}
            if runs and all(runs[-1].get(k) == v for k, v in fl.items()): runs[-1]["t"] += t
            else: runs.append({"t": t, **fl})
            prev = c
        text = "".join(r["t"] for r in runs)
        if text.strip():
            vis = [c for c in cs if c["text"].strip()]
            out.append({"runs": runs, "text": " ".join(text.split()), "x0": vis[0]["x0"], "x1": vis[-1]["x1"],
                        "top": L["top"], "bottom": L["bottom"], "size": size,
                        "bold": sum(len(r["t"].strip()) for r in runs if r["b"]) > .6 * len(text.replace(" ", ""))})
    return out

def vertical_lines(chars):
    """Rotated text: group by column (x), read top-to-bottom or bottom-to-top per the text matrix."""
    cols = []
    for c in sorted(chars, key=lambda c: c["x0"]):
        for col in cols:
            if abs(col["x"] - c["x0"]) <= max(1.5, .35 * c["size"]): col["chars"].append(c); break
        else: cols.append({"x": c["x0"], "chars": [c]})
    out = []
    for col in cols:
        down = col["chars"][0]["matrix"][1] < 0          # matrix b < 0: text runs top-to-bottom
        cs = sorted(col["chars"], key=lambda c: c["top"], reverse=not down)
        runs = []
        for i, c in enumerate(cs):
            t = c["text"]
            if i:
                prev = cs[i - 1]; gap = (c["top"] - prev["bottom"]) if down else (prev["top"] - c["bottom"])
                if gap > .25 * c["size"] and not t.isspace() and not (runs and runs[-1]["t"].endswith(" ")): t = " " + t
            fl = {"b": is_bold(c["fontname"]), "i": is_ital(c["fontname"]), "sup": False}
            if runs and all(runs[-1].get(k) == v for k, v in fl.items()): runs[-1]["t"] += t
            else: runs.append({"t": t, **fl})
        text = " ".join("".join(r["t"] for r in runs).split())
        if text:
            top = min(c["top"] for c in cs); bot = max(c["bottom"] for c in cs)
            out.append({"runs": runs, "text": text, "x0": col["x"], "x1": col["x"] + cs[0]["size"], "top": top, "bottom": bot,
                        "size": statistics.median(c["size"] for c in cs), "bold": all(r["b"] for r in runs), "vertical": True})
    return out

def norm_runs(runs):
    """merge, strip, drop flag noise; superscript markers become ^n"""
    out = []
    for r in runs:
        t = r["t"]
        if not t: continue
        d = {"t": t.strip() if r.get("sup") else t}
        if r.get("b"): d["b"] = 1
        if r.get("i"): d["i"] = 1
        if r.get("sup"): d["s"] = 1
        if out and {k: v for k, v in out[-1].items() if k != "t"} == {k: v for k, v in d.items() if k != "t"}: out[-1]["t"] += d["t"]
        else: out.append(d)
    if out: out[0]["t"] = out[0]["t"].lstrip(); out[-1]["t"] = out[-1]["t"].rstrip()
    for r in out: r["t"] = re.sub(r"\s+", " ", r["t"])
    return [r for r in out if r["t"]]

def join_lines(lines):
    runs = []
    for i, L in enumerate(lines):
        if i: runs.append({"t": " "})
        runs.extend(L["runs"])
    return norm_runs(runs)

def runs_text(runs): return "".join(("^" + r["t"] if r.get("s") else r["t"]) for r in runs)

def strip_bullet(line):
    t = line["text"]
    m = re.match(rf"^([{re.escape(BULLETS)}]|\d{{1,2}}[.)]|[a-z][.)])\s+", t)
    if not m: return None
    n = len(m.group(0)); runs = [dict(r) for r in line["runs"]]
    while n > 0 and runs:
        lead = len(runs[0]["t"]) - len(runs[0]["t"].lstrip())
        take = min(len(runs[0]["t"]), n + lead); runs[0]["t"] = runs[0]["t"][take:]; n -= take - lead
        if not runs[0]["t"]: runs.pop(0)
    return m.group(1), runs

def cell_blocks(lines, width=None):
    """lines inside one table cell -> list of paragraphs (each a runs list), keeping line breaks where meaningful"""
    paras, cur = [], []
    widest = width or max((L["x1"] - L["x0"] for L in lines), default=1)
    for i, L in enumerate(lines):
        brk = False
        if cur:
            pw = cur[-1]["x1"] - cur[-1]["x0"]
            if pw < .62 * widest and L["text"][:1].isupper() and not re.search(r"[,(/-]$|\b(and|or|of|the|to|with|for|in)$", cur[-1]["text"]):
                brk = True
            gap = L["top"] - cur[-1]["bottom"]
            prev = cur[-1]["text"]
            if gap > L["size"] * .55: brk = True
            elif strip_bullet(L) or re.match(r"^(OR|AND|Preferred|Alternative|Alternatives|If |For |\*)", L["text"]): brk = True
            elif prev.endswith(":") or re.match(r"^(OR|AND)$", prev): brk = True
            elif L["bold"] != cur[-1]["bold"] and len(prev) < 60: brk = True
        if brk: paras.append(cur); cur = []
        cur.append(L)
    if cur: paras.append(cur)
    return [join_lines(p) for p in paras]

def cell_text(c): return " ".join(runs_text(p) for p in c).strip()

def tidy_table(rows):
    """Rebuild logical rows: fold vertically-merged sub-rows into the row above, drop horizontal-merge
    placeholders and columns that never hold text, fold wrapped header lines into the row above."""
    if not rows: return rows
    width = max(len(r["cells"]) for r in rows)
    for r in rows: r["cells"] += ["H"] * (width - len(r["cells"]))
    merged = []
    for r in rows:
        if not r["span"] and merged and not merged[-1]["span"] and any(c == "V" for c in r["cells"]):
            prev = merged[-1]
            for i, c in enumerate(r["cells"]):
                if isinstance(c, list) and c:
                    if isinstance(prev["cells"][i], list): prev["cells"][i] = prev["cells"][i] + c
                    else: prev["cells"][i] = c
            continue
        merged.append(r)
    keep = [i for i in range(width) if any(isinstance(r["cells"][i], list) and cell_text(r["cells"][i]) for r in merged if not r["span"])] or [0]
    out = []
    for r in merged:
        if r["span"]:
            r["cells"] = [next(c for c in r["cells"] if isinstance(c, list))]
        else:
            r["cells"] = [r["cells"][i] if isinstance(r["cells"][i], list) else [] for i in keep]
        t = cell_text(r["cells"][0]) if r["cells"] else ""
        if r["span"] and out and not out[-1]["span"]:
            pt = cell_text(out[-1]["cells"][0])
            if t.startswith("(") or t[:1].islower() or pt.count("(") > pt.count(")"):
                out[-1]["cells"][0] = out[-1]["cells"][0] + r["cells"][0]
                continue
        out.append(r)
    return out

def layout_boxes(page):
    """(x0, top) of each character -> bbox of the pdfminer text box it belongs to"""
    from pdfminer.layout import LTTextBox, LTChar, LAParams
    from pdfminer.layout import LTPage
    out = {}
    try:
        lay = page.layout
    except Exception:
        return out
    H = page.height
    def walk(o, bb):
        for x in getattr(o, "_objs", []) or []:
            if isinstance(x, LTChar):
                out[(round(x.x0), round(H - x.y1))] = bb
            else:
                walk(x, bb)
    for o in lay:
        if isinstance(o, LTTextBox):
            walk(o, (o.x0, H - o.y1, o.x1, H - o.y0))
    return out

def column_order(items, width):
    """Two-column layouts: read left column then right within each band between full-width items."""
    items = sorted(items, key=lambda x: x[1])
    lo, hi = .3 * width, .7 * width
    # find a gutter x that the most items do not cross
    xs = [x for x in range(int(lo), int(hi), 4)]
    def crossing(x): return [it for it in items if it[3][0] < x - 2 and it[3][2] > x + 2]
    best = min(xs, key=lambda x: len(crossing(x))) if xs else None
    if best is None: return items
    left = [it for it in items if it[3][2] <= best + 2]; right = [it for it in items if it[3][0] >= best - 2]
    if len(left) < 3 or len(right) < 3: return items
    out, band = [], []
    def flush():
        band.sort(key=lambda it: (0 if it[3][2] <= best + 2 else 1, it[1])); out.extend(band); band.clear()
    for it in items:
        if it[3][0] < best - 2 and it[3][2] > best + 2:   # full width: separator
            flush(); out.append(it)
        else:
            band.append(it)
    flush()
    return out

def page_blocks(page, body_size):
    # Close boxes whose top/bottom border is dotted or missing: cap every tall vertical border.
    vert = [e for e in page.edges if e["orientation"] == "v" and e["height"] > 30]
    groups = {}
    for e in vert:
        for y in (round(e["top"]), round(e["bottom"])):
            key = next((k for k in groups if abs(k - y) <= 2), y)
            groups.setdefault(key, []).append(e["x0"])
    caps = [{"x0": min(xs), "x1": max(xs), "top": y, "bottom": y, "width": max(xs) - min(xs), "height": 0, "orientation": "h", "object_type": "line"}
            for y, xs in groups.items() if len(xs) >= 2 and max(xs) - min(xs) > 60]
    settings = {"vertical_strategy": "lines", "horizontal_strategy": "lines", "snap_tolerance": 4, "intersection_tolerance": 4}
    tables = [t for t in page.find_tables(settings) if len(t.rows) >= 1]
    covered = lambda cp: any(t.bbox[1] - 3 <= cp["top"] <= t.bbox[3] + 3 and t.bbox[0] - 3 <= cp["x0"] and cp["x1"] <= t.bbox[2] + 3 for t in tables)
    if any(not covered(cp) for cp in caps):
        tables = [t for t in page.find_tables({**settings, "explicit_horizontal_lines": caps}) if len(t.rows) >= 1]
    tables = [t for t in tables if (t.bbox[2] - t.bbox[0]) > 120 and (t.bbox[3] - t.bbox[1]) > 18]
    W, H = page.width, page.height
    def area(b): return (b[2] - b[0]) * (b[3] - b[1])
    def contains(a, b): return a[0] - 2 <= b[0] and a[1] - 2 <= b[1] and b[2] <= a[2] + 2 and b[3] <= a[3] + 2 and a != b
    # page frames and boxes that only wrap other tables are not tables
    def text_cells(t):
        n = 0
        for r in t.rows:
            for cb in r.cells:
                if cb and any(cb[0] - 1 <= (c["x0"] + c["x1"]) / 2 <= cb[2] + 1 and cb[1] - 1 <= (c["top"] + c["bottom"]) / 2 <= cb[3] + 1 and c["text"].strip() for c in page.chars):
                    n += 1
        return n
    tables = [t for t in tables if not (area(t.bbox) > .55 * W * H and text_cells(t) <= 1)]
    tables = [t for t in tables if not any(contains(o.bbox, t.bbox) for o in tables if o is not t)]  # nested: keep the outer
    cell_boxes = [cb for t in tables for r in t.rows for cb in r.cells if cb]
    def in_cell(c, cb): return cb[0] - 1 <= (c["x0"] + c["x1"]) / 2 <= cb[2] + 1 and cb[1] - 1 <= (c["top"] + c["bottom"]) / 2 <= cb[3] + 1
    def in_tables(c): return any(in_cell(c, cb) for cb in cell_boxes)
    chars = [c for c in page.chars if c["text"] not in ("​",)]
    free = chars_to_lines([c for c in chars if not in_tables(c)], split_gaps=layout_boxes(page) or None)
    items = [("line", L["top"], L, (L["x0"], L["top"], L["x1"], L["bottom"])) for L in free] + \
            [("table", t.bbox[1], t, t.bbox) for t in tables]
    items = column_order(items, page.width)
    blocks = []
    for kind, top, obj, _bb in items:
        if kind == "table":
            rows = []
            col_boxes = [c.bbox for c in obj.columns]
            for row in obj.rows:
                cells = []
                for ci, cb in enumerate(row.cells):
                    if cb is not None:
                        cells.append(cell_blocks(chars_to_lines([c for c in chars if in_cell(c, cb)]), cb[2] - cb[0] - 8))
                        continue
                    # None = merged. Horizontal if another cell in this row covers this column; else vertical.
                    cx = (col_boxes[ci][0] + col_boxes[ci][2]) / 2 if ci < len(col_boxes) else None
                    horiz = cx is not None and any(o and o[0] <= cx <= o[2] for o in row.cells)
                    cells.append("H" if horiz else "V")
                real = [c for c in cells if isinstance(c, list)]
                if not any(any(p for p in c) for c in real):
                    continue
                full = len(real) == 1 and all(c == "H" for c in cells if not isinstance(c, list))
                rows.append({"cells": cells, "span": full and len(cells) > 1})
            rows = tidy_table(rows)
            if rows and all(len(r["cells"]) == 1 for r in rows):
                for r in rows:            # a box, not a table: emit its contents as paragraphs and bullets
                    for para in r["cells"][0]:
                        txt = runs_text(para).strip()
                        m = re.match(rf"^([{re.escape(BULLETS)}]|\d{{1,2}}[.)])\s*", txt)
                        if m and len(txt) > len(m.group(0)):
                            p2 = [dict(x) for x in para]; n = len(m.group(0))
                            while n > 0 and p2:
                                take = min(len(p2[0]["t"]), n); p2[0]["t"] = p2[0]["t"][take:]; n -= take
                                if not p2[0]["t"]: p2.pop(0)
                            blocks.append({"t": "li", "d": 1 if m.group(1) in "o◦○" or m.group(1)[0].isdigit() else 0, "runs": norm_runs(p2), "pg": page.page_number})
                        else:
                            bold = para and all(x.get("b") for x in para if x["t"].strip())
                            blocks.append({"t": "h" if bold and len(txt) < 90 else "p", "l": 3, "runs": norm_runs(para), "pg": page.page_number})
                continue
            if rows: blocks.append({"t": "table", "rows": rows, "pg": page.page_number})
            continue
        L = obj
        b = strip_bullet(L)
        depth = 0 if L["x0"] < 90 else 1 if L["x0"] < 125 else 2
        if b:
            sym, runs = b
            forced = sym in "o◦○"
            if forced: depth = max(depth, 1)
            blocks.append({"t": "li", "d": depth, "d_forced": forced, "runs": norm_runs(runs), "x0": L["x0"], "x1": L["x1"], "top": L["top"], "bottom": L["bottom"], "size": L["size"], "pg": page.page_number}); continue
        heading = (L["size"] >= body_size * 1.18 or (L["bold"] and len(L["text"]) < 90 and not L["text"].endswith((".", ","))))
        blk = {"t": "h" if heading else "p", "runs": norm_runs(L["runs"]), "x0": L["x0"], "x1": L["x1"], "top": L["top"], "bottom": L["bottom"], "size": L["size"], "pg": page.page_number}
        if heading: blk["l"] = 1 if L["size"] >= body_size * 1.6 else 2 if L["size"] >= body_size * 1.18 else 3
        blocks.append(blk)
    return blocks

def merge_flow(blocks):
    """continuation lines -> previous paragraph / bullet"""
    out = []
    for b in blocks:
        prev = out[-1] if out else None
        if prev and b["t"] == "p" and prev["t"] in ("p", "li") and prev.get("pg") == b.get("pg") and "top" in prev and "top" in b:
            gap = b["top"] - prev["bottom"]; same_size = abs(b["size"] - prev["size"]) < .6
            indent_ok = b["x0"] >= prev["x0"] - 3 and b["x0"] < prev.get("x1", 1e9) - 5 and gap > -2
            if gap < b["size"] * .6 and same_size and indent_ok and not prev["runs"][-1]["t"].endswith(":"):
                prev["runs"] = norm_runs(prev["runs"] + [{"t": " "}] + b["runs"]); prev["bottom"] = b["bottom"]; prev["x1"] = max(prev.get("x1", 0), b.get("x1", 0)); continue
        if prev and b["t"] == "h" and prev["t"] == "h" and prev.get("pg") == b.get("pg") and "top" in prev and "top" in b and b["top"] - prev["bottom"] < b["size"] * .5 and abs(b["size"] - prev["size"]) < .6:
            prev["runs"] = norm_runs(prev["runs"] + [{"t": " "}] + b["runs"]); prev["bottom"] = b["bottom"]; continue
        out.append(b)
    # bullet depth relative to neighbouring bullets (columns start at depth 0)
    prev = None
    for b in out:
        if b["t"] != "li" or "x0" not in b:
            prev = None if b["t"] in ("h", "table") else prev; continue
        if prev is None or abs(b["x0"] - prev["x0"]) > 120: b["d"] = 0 if not b.get("d_forced") else b["d"]
        elif b["x0"] > prev["x0"] + 8: b["d"] = min(prev["d"] + 1, 3)
        elif b["x0"] < prev["x0"] - 8: b["d"] = max(prev["d"] - 1, 0)
        else: b["d"] = prev["d"]
        prev = b
    for b in out:
        for k in ("x0", "x1", "top", "bottom", "size", "d_forced"): b.pop(k, None)
    return out

JUNKLINE = re.compile(r"^(MICHIGAN MEDICINE|UNIVERSITY OF MICHIGAN|Page \d+( of \d+)?|\d{1,3})$", re.I)

def convert(path):
    with pdfplumber.open(path, laparams={"line_margin": 0.5, "char_margin": 2.0, "boxes_flow": None}) as pdf:
        sizes = [round(c["size"], 1) for p in pdf.pages[:4] for c in p.chars if c["text"].strip()]
        body = statistics.mode(sizes) if sizes else 10
        blocks = []
        for page in pdf.pages:
            blocks += page_blocks(page, body)
        blocks = merge_flow(blocks)
        blocks = [b for b in blocks if not (b["t"] in ("p", "h") and JUNKLINE.match(runs_text(b["runs"]).strip()))]
        return {"pages": len(pdf.pages), "blocks": blocks}

if __name__ == "__main__":
    import sys, json
    r = convert(sys.argv[1])
    for b in r["blocks"][:int(sys.argv[2]) if len(sys.argv) > 2 else 40]:
        if b["t"] == "table":
            print(f"[TABLE p{b['pg']}]")
            for row in b["rows"]:
                print("   |", " || ".join(" ¶ ".join(runs_text(p) for p in c) for c in row["cells"]), "(span)" if row["span"] else "")
        else:
            print(f"[{b['t']}{b.get('l', b.get('d', ''))} p{b['pg']}]", runs_text(b["runs"]))
