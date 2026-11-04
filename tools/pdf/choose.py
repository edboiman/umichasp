"""Per guideline, measure fidelity to the PDF for old (v2) and new builds; choose the safer one."""
import json, re, collections, sys, pypdfium2 as pdfium
sys.path.insert(0, ".")
from textdiff import text
A = json.load(open(sys.argv[1], encoding="utf-8")); B = json.load(open(sys.argv[2], encoding="utf-8"))
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
LABELS = re.compile(r"(?i)\b(references|citation|revision history|revision|date)\b")
def toks(s):
    s = re.sub(r"(?i)page\s*\d+\s*of\s*\d+|\b\d+\s+of\s+\d+\b", " ", s.translate(SUP))
    s = re.sub(r"([A-Za-z])(\d{1,2})\b", r"\1 \2", s)
    return collections.Counter(t.lower() for t in re.findall(r"[A-Za-z]{3,}|\d+(?:[.,]\d+)?", s))
ga = {p["id"]: p.get("guide") for p in A["pages"]}; gb = {p["id"]: p.get("guide") for p in B["pages"]}
choice, rows = {}, []
for k, g in ga.items():
    if not g: continue
    pdf = pdfium.PdfDocument(f"in/pdfs/{k}.pdf")
    raw = toks(LABELS.sub(" ", " ".join(pdf[i].get_textpage().get_text_range() for i in range(len(pdf)))))
    ta, tb = toks(LABELS.sub(" ", text(g))), toks(LABELS.sub(" ", text(gb[k])))
    miss_a, miss_b = sum((raw - ta).values()), sum((raw - tb).values())
    extra_a, extra_b = sum((ta - raw).values()), sum((tb - raw).values())
    same = json.dumps(g, sort_keys=True) == json.dumps(gb[k], sort_keys=True)
    pick = "old" if same else ("new" if miss_b <= miss_a and extra_b <= extra_a else "old")
    choice[k] = pick
    rows.append((k, miss_a, miss_b, extra_a, extra_b, pick, same))
json.dump(choice, open("choice.json", "w"), indent=1)
print("unchanged:", sum(r[6] for r in rows), "| adopt new:", sum(1 for r in rows if r[5] == "new" and not r[6]), "| keep old:", sum(1 for r in rows if r[5] == "old" and not r[6]))
print("missing-vs-PDF total  old:", sum(r[1] for r in rows), " chosen:", sum(r[2] if r[5] == "new" else r[1] for r in rows))
print("extra-vs-PDF total    old:", sum(r[3] for r in rows), " chosen:", sum(r[4] if r[5] == "new" else r[3] for r in rows))
for r in rows:
    if not r[6] and r[0].split("~")[-1] in sys.argv[3:]: print(r)
