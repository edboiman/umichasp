"""Decide which PDF pages must be shown as figures: meaningful words lost in conversion, or flowchart-like drawings."""
import json, re, collections, pdfplumber, pypdfium2 as pdfium, sys
sys.path.insert(0, ".")
from coverage3 import toks, page_text
conv = json.load(open("converted.json"))
STOP = set("the and for with that this from are was were have has not but all any can may should will into than then".split())
res = {}
for k, v in conv.items():
    pdf = pdfium.PdfDocument(f"in/pdfs/{k}.pdf")
    with pdfplumber.open(f"in/pdfs/{k}.pdf") as P:
        for i, page in enumerate(P.pages):
            raw = toks(pdf[i].get_textpage().get_text_range()); got = toks(page_text(v, i + 1))
            gotset = set(got)
            lost = []
            for t, n in (raw - got).items():
                if not t.isalpha() or len(t) < 4 or t in STOP: continue
                if any(t.startswith(a) and t[len(a):] in gotset for a in gotset if 2 <= len(a) < len(t) - 1): continue
                if t[:-1] in gotset or t[:-2] in gotset: continue
                lost.append(t)
            # flowchart signal: many filled/stroked boxes or curves holding text outside ruled tables
            shapes = len([r for r in page.rects if r["width"] > 25 and r["height"] > 12]) + len(page.curves) // 8
            arrows = len([l for l in page.lines]) + len([c for c in page.curves if len(c.get("pts", [])) <= 4])
            if len(lost) >= 2 or (shapes >= 10 and arrows >= 6):
                res.setdefault(k, []).append({"pg": i + 1, "lost": lost[:10], "shapes": shapes, "arrows": arrows})
json.dump(res, open("figure_pages.json", "w"), indent=1)
print("docs:", len(res), "pages:", sum(len(v) for v in res.values()))
for k, v in res.items(): print(k, [(p["pg"], len(p["lost"]), p["shapes"], p["arrows"]) for p in v])
