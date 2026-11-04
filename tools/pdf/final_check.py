"""Final safety check on the app's content.json: every number and drug/clinical word in each PDF must appear
in that guideline's app content (text, tables, pathways, references, or a chart page's text)."""
import json, re, collections, pypdfium2 as pdfium, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
drugs = json.load(open(sys.argv[2], encoding="utf-8"))
drug_words = {w.lower() for x in drugs for n in [x["name"], *x["aliases"]] for w in re.findall(r"[A-Za-z]{5,}", n)}
def runs(r): return "".join(x[0] for x in r or [])
def paras(c): return " ".join(runs(p) for p in c or [])  # paragraphs separated by spaces
def app_text(g):
    out = [g.get("title") or "", g.get("revised") or ""] + list(g.get("refs") or []) + [" ".join(h) for h in g.get("history") or []]
    for b in g["blocks"]:
        if b["t"] == "table":
            out += b.get("head") or []; out.append(b.get("caption") or "")
            out += [paras(c) for r in b["rows"] for c in r]
        elif b["t"] == "flow":
            out += [ (c.get("head") or "") + " " + paras(n["p"]) for c in b["cols"] for n in c["nodes"]] + [paras(n) for n in b.get("notes", [])]
        elif b["t"] == "rec": out += b["lines"]
        elif "r" in b: out.append(runs(b["r"]))
    return " ".join(out)
SUPMAP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
def toks(s):
    s = re.sub(r"(?i)page\s*\d+\s*of\s*\d+|\b\d+\s+of\s+\d+\b", " ", s.translate(SUPMAP))
    s = re.sub(r"([A-Za-z])(\d{1,2})\b", r"\1 \2", s)
    return collections.Counter(t.lower() for t in re.findall(r"[A-Za-z]+|\d+(?:[.,]\d+)?", s))
num_miss, drug_miss, fig_only = {}, {}, []
for p in d["pages"]:
    g = p.get("guide")
    if not g: continue
    pdf = pdfium.PdfDocument(f"in/pdfs/{p['id']}.pdf")
    raw = toks(" ".join(pdf[i].get_textpage().get_text_range() for i in range(len(pdf))))
    got = toks(app_text(g))
    miss = raw - got
    nums = {t: n for t, n in miss.items() if re.fullmatch(r"\d+(?:[.,]\d+)?", t) and (len(t) >= 2 or n >= 3)}
    dw = {t: n for t, n in miss.items() if t in drug_words}
    figpages = {b["pg"] for b in g["blocks"] if b["t"] == "fig"}
    if nums: num_miss[p["id"]] = (nums, sorted(figpages))
    if dw: drug_miss[p["id"]] = (dw, sorted(figpages))
print("guidelines checked:", sum(1 for p in d["pages"] if p.get("guide")))
print("with any number not found in app text:", len(num_miss))
for k, (v, f) in num_miss.items(): print("  ", k, dict(list(v.items())[:10]), "figure pages:", f)
print("with any drug name not found in app text:", len(drug_miss))
for k, (v, f) in drug_miss.items(): print("  ", k, v, "figure pages:", f)
