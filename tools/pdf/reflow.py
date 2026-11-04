"""Regenerate every flow block in a content file with the current flow.py; verify the text is unchanged."""
import json, re, sys, pdfplumber
sys.path.insert(0, ".")
import flow as FL
from runs_util import R
path = sys.argv[1]
d = json.load(open(path, encoding="utf-8"))
def flat(b): return re.sub(r"\s+", "", "".join("".join(x[0] for p in n["p"] for x in p) for c in b["cols"] for n in c["nodes"]) + "".join("".join(x[0] for p in n for x in p) for n in b.get("notes", [])))
n_ok = n_bad = 0
for p in d["pages"]:
    g = p.get("guide")
    if not g: continue
    for i, b in enumerate(g["blocks"]):
        if b["t"] != "flow": continue
        with pdfplumber.open(f"in/pdfs/{p['id']}.pdf", laparams=FL.LAP) as P:
            fb = FL.to_block(FL.flow_page(P.pages[b["pg"] - 1]), b["pg"])
        for c in fb["cols"]:
            for nd in c["nodes"]: nd["p"] = [R(x) for x in nd["p"]]
        fb["notes"] = [[R(x) for x in n] for n in fb["notes"]]
        fb["fig"] = b.get("fig")
        if flat(fb) == flat(b): g["blocks"][i] = fb; n_ok += 1
        else: n_bad += 1; print("TEXT DIFFERS, kept old:", p["id"], b["pg"])
json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("flows regenerated:", n_ok, "kept:", n_bad)
