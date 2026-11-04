"""Flowchart pages -> columns of nodes, with nodes paired to the next column by vertical overlap."""
import re, statistics, pdfplumber
from pdfminer.layout import LTTextBox, LTChar
import convert as C

LAP = {"line_margin": 0.5, "char_margin": 2.0, "boxes_flow": None}


def node_boxes(page):
    H = page.height
    boxes = []
    for o in page.layout:
        if isinstance(o, LTTextBox):
            keys = set()
            def walk(x):
                for y in getattr(x, "_objs", []) or []:
                    if isinstance(y, LTChar): keys.add((round(y.x0), round(H - y.y1)))
                    else: walk(y)
            walk(o)
            boxes.append({"bb": (o.x0, H - o.y1, o.x1, H - o.y0), "keys": keys})
    # attach pdfplumber chars (with fonts) to boxes
    for b in boxes: b["chars"] = []
    for c in page.chars:
        k = (round(c["x0"]), round(c["top"]))
        for b in boxes:
            if k in b["keys"] or any((k[0] + dx, k[1] + dy) in b["keys"] for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                b["chars"].append(c); break
    out = []
    for b in boxes:
        lines = C.chars_to_lines(b["chars"])
        if not lines: continue
        paras = [p for p in C.cell_blocks(lines, b["bb"][2] - b["bb"][0]) if C.runs_text(p).strip()]
        text = " ".join(C.runs_text(p) for p in paras)
        if not text.strip() or re.fullmatch(r"(\d+ of \d+|page \d+( of \d+)?|adults?|pediatrics?|peds)", text.strip(), re.I): continue
        out.append({"bb": b["bb"], "paras": paras, "text": text})
    return out


def merge_close(nodes):
    """pdfminer often splits one drawn box into several text boxes; merge vertically adjacent ones in the same column."""
    nodes = sorted(nodes, key=lambda n: (round(n["bb"][0] / 30), n["bb"][1]))
    out = []
    for n in nodes:
        p = out[-1] if out else None
        if p and abs(p["bb"][0] - n["bb"][0]) < 40 and 0 <= n["bb"][1] - p["bb"][3] < 14 and not is_head(n) and not is_head(p):
            p["paras"] += n["paras"]; p["text"] += " " + n["text"]
            p["bb"] = (min(p["bb"][0], n["bb"][0]), p["bb"][1], max(p["bb"][2], n["bb"][2]), n["bb"][3]); continue
        out.append(dict(n))
    return out


def is_head(n):
    t = n["text"].strip()
    return len(t) < 40 and t.upper() == t and any(ch.isalpha() for ch in t)


def flow_page(page):
    nodes = merge_close(node_boxes(page))
    if not nodes: return None
    # columns by x-center clustering
    nodes.sort(key=lambda n: (n["bb"][0] + n["bb"][2]) / 2)
    cols = []
    for n in nodes:
        cx = (n["bb"][0] + n["bb"][2]) / 2
        if cols and abs(cx - cols[-1]["cx"]) < 60: cols[-1]["nodes"].append(n); cols[-1]["cx"] = statistics.mean([(m["bb"][0] + m["bb"][2]) / 2 for m in cols[-1]["nodes"]])
        else: cols.append({"cx": cx, "nodes": [n]})
    # full-width nodes (titles, notes) are kept separately
    W = page.width
    full = [n for n in nodes if n["bb"][2] - n["bb"][0] > .6 * W]
    for c in cols:
        c["nodes"] = sorted([n for n in c["nodes"] if n not in full], key=lambda n: n["bb"][1])
        heads = [n for n in c["nodes"] if is_head(n)]
        c["head"] = heads[0]["text"].strip() if heads else None
        c["nodes"] = [n for n in c["nodes"] if n not in heads[:1]]
    cols = [c for c in cols if c["nodes"] or c["head"]]
    # merge columns with identical headings (shadow text) and drop empty
    return {"cols": cols, "full": sorted(full, key=lambda n: n["bb"][1])}


def to_block(fp, pg):
    """App block: list of columns; each node lists the indexes of overlapping nodes in the next column."""
    cols = fp["cols"]
    out_cols = []
    for ci, c in enumerate(cols):
        nxt = cols[ci + 1]["nodes"] if ci + 1 < len(cols) else []
        nodes = []
        for n in c["nodes"]:
            links = [j for j, m in enumerate(nxt) if min(n["bb"][3], m["bb"][3]) - max(n["bb"][1], m["bb"][1]) > 4]
            nodes.append({"p": n["paras"], "next": links})
        out_cols.append({"head": c["head"], "nodes": nodes})
    return {"t": "flow", "pg": pg, "cols": out_cols, "notes": [n["paras"] for n in fp["full"]]}


if __name__ == "__main__":
    import sys
    with pdfplumber.open(sys.argv[1], laparams=LAP) as pdf:
        fp = flow_page(pdf.pages[int(sys.argv[2]) - 1])
        for c in fp["cols"]:
            print("== COLUMN:", c["head"])
            for n in c["nodes"]: print("   •", n["text"][:150])
        for n in fp["full"]: print("== FULL:", n["text"][:150])
