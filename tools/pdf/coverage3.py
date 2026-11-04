"""Per page: every token (word/number) in the PDF text must appear in that page's converted blocks."""
import json, re, collections, pypdfium2 as pdfium, sys
sys.path.insert(0, ".")
from convert import runs_text
conv = json.load(open("converted.json"))
def toks(s):
    s = re.sub(r"(?i)page\s*\d+\s*of\s*\d+", " ", s.replace("^", " "))
    s = re.sub(r"([A-Za-z])(\d{1,2})\b", r"\1 \2", s)
    return collections.Counter(t.lower() for t in re.findall(r"[A-Za-z]+|\d+(?:\.\d+)?", s))
def page_text(v, pg):
    out = []
    for b in v["blocks"]:
        if b.get("pg") != pg: continue
        if "runs" in b: out.append(runs_text(b["runs"]))
        else: out += [runs_text(p) for r in b["rows"] for c in r["cells"] for p in c]
    return " ".join(out)
report = {}
for k, v in conv.items():
    pdf = pdfium.PdfDocument(f"in/pdfs/{k}.pdf")
    for i in range(len(pdf)):
        raw = toks(pdf[i].get_textpage().get_text_range()); got = toks(page_text(v, i + 1))
        # glued words in raw ("patientswith") are fine if both halves exist
        miss = {}
        for t, n in (raw - got).items():
            if len(t) >= 7 and t.isalpha() and any(t.startswith(a) and t[len(a):] in got for a in got if 2 <= len(a) < len(t) - 1): continue
            if t.isdigit() and len(t) <= 2 and n <= 2: continue          # list numbers
            if t in ("a","b","c","d","e","f","g","h","i","ii","iii","iv","v","vi","o","st","nd","rd","th"): continue   # list letters, ordinals
            if t[-1:].isalpha() and len(t) > 4 and (t[:-1] in got or t[:-2] in got): continue   # footnote letter glued: ciprofloxacina
            miss[t] = n
        if miss: report.setdefault(k, []).append((i + 1, miss))
print("pages with missing tokens:", sum(len(v) for v in report.values()), "in", len(report), "docs")
for k, pages in sorted(report.items(), key=lambda kv: -sum(sum(m.values()) for _, m in kv[1])):
    print(k, [(pg, dict(list(m.items())[:8])) for pg, m in pages][:4])
