import json, re, collections, pypdfium2 as pdfium, pathlib, sys
sys.path.insert(0, ".")
from convert import runs_text
conv = json.load(open("converted.json")) if __name__ == "__main__" else {}
def W(s):
    s = re.sub(r"(?i)page\s*\d+\s*of\s*\d+", " ", s.replace("^", " "))
    s = re.sub(r"([A-Za-z])(\d{1,2})\b", r"\1 \2", s)          # footnote digits glued to words
    toks = [w.lower() for w in re.findall(r"[A-Za-z0-9]+", s)]
    return collections.Counter(w for w in toks if len(w) > 2 or (len(w) == 2 and w.isalpha()))
def conv_text(v):
    out = []
    for b in v["blocks"]:
        if "runs" in b: out.append(runs_text(b["runs"]))
        else: out += [runs_text(p) for r in b["rows"] for c in r["cells"] for p in c]
    return " ".join(out)
bad = []
for k, v in conv.items():
    if "error" in v: bad.append((k, "ERROR", v["error"])); continue
    pdf = pdfium.PdfDocument(f"in/pdfs/{k}.pdf")
    raw = " ".join(pdf[i].get_textpage().get_text_range() for i in range(len(pdf)))
    a, b = W(raw), W(conv_text(v))
    miss = sum((a - b).values()); tot = sum(a.values())
    cov = 1 - miss / max(tot, 1)
    if cov < .99: bad.append((k, round(cov, 3), list((a - b).items())[:8]))
print("checked", len(conv), "docs; below 98.5% word coverage:", len(bad))
for x in bad: print(x)
