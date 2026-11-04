import json, re, sys, pypdfium2 as pdfium
d = json.load(open(sys.argv[1], encoding="utf-8"))
def R(r): return "".join(x[0] for x in r)
tot, docs = 0, 0
fixes = []
for p in d["pages"]:
    g = p.get("guide")
    if not g: continue
    pdf = pdfium.PdfDocument(f"in/pdfs/{p['id']}.pdf")
    raw = " ".join(pdf[i].get_textpage().get_text_range() for i in range(len(pdf)))
    rawset = set(re.findall(r"[A-Za-z]+", raw))
    def check(r, where):
        global tot
        t = R(r).lstrip()
        m = re.match(r"[A-Za-z]+", t)
        if not m: return
        w = m.group(0)
        if w in rawset: return
        cands = [c + w for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" if c + w in rawset]
        if cands and len(w) >= 2:
            fixes.append((p["id"], where, t[:60], cands[0])); tot += 1
    for b in g["blocks"]:
        if b["t"] in ("li", "p", "h"): check(b["r"], b["t"])
        if b["t"] == "table":
            for r in b["rows"]:
                for c in r:
                    for para in c: check(para, "cell")
print("items with a dropped first letter:", tot, "in", len({f[0] for f in fixes}), "guidelines")
for f in fixes[:25]: print("  ", f[0].split("~", 1)[1][:38], f[1], "|", f[2], "->", f[3])
json.dump(fixes, open("firstletter.json", "w"), ensure_ascii=False, indent=0)
