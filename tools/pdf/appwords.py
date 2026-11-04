"""Words in the app's text for a guideline that never occur in that guideline's PDF (candidate transcription errors)."""
import json, re, collections, sys, pypdfium2 as pdfium
sys.path.insert(0, "/home/claude/pdfwork")
from textdiff import text
d = json.load(open(sys.argv[1], encoding="utf-8"))
res = {}
for p in d["pages"]:
    g = p.get("guide")
    if not g: continue
    pdf = pdfium.PdfDocument(f"/home/claude/pdfwork/in/pdfs/{p['id']}.pdf")
    raw = " ".join(pdf[i].get_textpage().get_text_range() for i in range(len(pdf)))
    rawl = re.sub(r"[^a-z]", "", raw.lower())
    rawset = set(re.findall(r"[a-z]+", raw.lower()))
    app = text(g)
    bad = sorted({w for w in re.findall(r"[A-Za-z]{3,}", app) if w.lower() not in rawset and w.lower() not in rawl})
    if bad: res[p["id"]] = bad
print("guides with words not found anywhere in their PDF:", len(res))
for k, v in res.items(): print(" ", k.split("~", 1)[1][:45], v[:12])
