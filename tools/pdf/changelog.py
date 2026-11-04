"""v2 -> v3 content comparison against the PDFs.
For every guideline: (a) PDF word tokens not present in the app (multiset), for v2 and v3;
(b) app word tokens that do not occur in the PDF; (c) a word-level diff of v2 vs v3 text."""
import json, re, collections, difflib, sys
import pypdfium2 as pdfium
sys.path.insert(0, "/home/claude/pdfwork")
from textdiff import text
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
def toks(s): return re.findall(r"[a-z]+|\d+", s.translate(SUP).lower().replace("ﬁ", "fi").replace("ﬂ", "fl"))
A = json.load(open(sys.argv[1], encoding="utf-8")); B = json.load(open(sys.argv[2], encoding="utf-8"))
ga = {p["id"]: p for p in A["pages"]}; out = []; rows = []
tot = collections.Counter()
for p in B["pages"]:
    g = p.get("guide")
    if not g: continue
    g0 = ga[p["id"]]["guide"]
    pdf = pdfium.PdfDocument(f"/home/claude/pdfwork/in/pdfs/{p['id']}.pdf")
    raw = "\n".join(pdf[i].get_textpage().get_text_range() for i in range(len(pdf)))
    P = collections.Counter(toks(raw)); t0, t1 = toks(text(g0)), toks(text(g))
    C0, C1 = collections.Counter(t0), collections.Counter(t1)
    miss0, miss1 = sum((P - C0).values()), sum((P - C1).values())
    extra1 = sorted(set(C1) - set(P))
    same = t0 == t1
    rows.append((p["id"], len(pdf), "same" if same else "changed", miss0, miss1, len(extra1)))
    tot["pdf_tokens"] += sum(P.values()); tot["miss_v2"] += miss0; tot["miss_v3"] += miss1; tot["changed"] += (not same)
    if not same:
        sm = difflib.SequenceMatcher(None, t0, t1, autojunk=False); ops = []
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag != "equal": ops.append(f"  {tag:7} v2: {' '.join(t0[i1:i2])[:160]!s:<60} | v3: {' '.join(t1[j1:j2])[:160]}")
        out.append(f"## {p['id']}  ({len(ops)} differing spans; PDF tokens absent from app: v2 {miss0} -> v3 {miss1})\n" + "\n".join(ops[:60]) + ("\n  …" if len(ops) > 60 else ""))
open(sys.argv[3], "w", encoding="utf-8").write("# Word-level differences, v2 -> v3 (lower-cased word tokens; layout and grouping changes are not shown)\n\n" + "\n\n".join(out))
with open(sys.argv[4], "w", encoding="utf-8") as f:
    f.write("guideline\tpdf_pages\ttext_v2_vs_v3\tpdf_tokens_absent_v2\tpdf_tokens_absent_v3\tapp_words_not_in_pdf_v3\n")
    for r in rows: f.write("\t".join(map(str, r)) + "\n")
print(dict(tot), "guides:", len(rows), "with words not in PDF:", sum(1 for r in rows if r[5]))
for r in rows:
    if r[4] > r[3] or r[5]: print("CHECK", r)
