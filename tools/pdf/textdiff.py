"""Compare two content.json files guideline by guideline: word multiset (all visible text) and structure."""
import json, re, collections, sys

def runs(r): return " ".join(x[0] for x in r or [])
def paras(c): return " ".join(runs(p) for p in c or [])
def text(g):
    out = [g.get("title") or "", g.get("revised") or "", g.get("approvals") or ""] + list(g.get("refs") or []) + [" ".join(h) for h in g.get("history") or []]
    for b in g["blocks"]:
        if b["t"] == "table":
            out += (b.get("head") or []) + [b.get("caption") or ""] + [paras(c) for r in b["rows"] for c in r]
            out += [s.get("label", "") + " " + paras(s["p"]) for s in b.get("shared", [])]
        elif b["t"] == "flow": out += [(c.get("head") or "") + " " + paras(n["p"]) for c in b["cols"] for n in c["nodes"]] + [paras(n) for n in b.get("notes", [])]
        elif b["t"] in ("rec", "figtext"): out += b["lines"]
        elif b["t"] == "step": out += [runs(b["r"])] + [runs(x) for x in b.get("sub", [])] + [k + ": " + v for k, v in b.get("kv", [])]
        elif b["t"] == "fn": out += [n + " " + runs(r) for n, r in b["items"]]
        elif b["t"] == "note": out.append(runs(b["r"]))
        elif "r" in b: out.append((b.get("n", "") + " " if b.get("n") else "") + runs(b["r"]))
    return " ".join(out)
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
def toks(s): return collections.Counter(re.findall(r"[a-z]+|\d+", re.sub(r"\s+", "", s.translate(SUP).lower()) and s.translate(SUP).lower()))
if __name__ == "__main__":
  A = json.load(open(sys.argv[1], encoding="utf-8")); B = json.load(open(sys.argv[2], encoding="utf-8"))
ga = {p["id"]: p.get("guide") for p in A["pages"]} if __name__ == "__main__" else {}
gb = {p["id"]: p.get("guide") for p in B["pages"]} if __name__ == "__main__" else {}
changed, wordsame, worddiff = 0, 0, []
for k in ga:
    if not ga[k]: continue
    if json.dumps(ga[k], sort_keys=True) == json.dumps(gb[k], sort_keys=True): continue
    changed += 1
    a, b = toks(text(ga[k])), toks(text(gb[k]))
    # letters only, ignoring word boundaries (fixes like "D"+"uration" are not content changes)
    la = collections.Counter(re.sub(r"[^a-z0-9]", "", text(ga[k]).translate(SUP).lower()))
    lb = collections.Counter(re.sub(r"[^a-z0-9]", "", text(gb[k]).translate(SUP).lower()))
    LBL = collections.Counter("".join(["references", "citation", "revisionhistory", "date", "revision"]))
    def strip_labels(c, t):
        t2 = re.sub(r"(?i)\b(references|citation|revision history|date|revision)\b", "", t)
        return collections.Counter(re.sub(r"[^a-z0-9]", "", t2.translate(SUP).lower()))
    la2, lb2 = strip_labels(la, text(ga[k])), strip_labels(lb, text(gb[k]))
    if la == lb or la2 == lb2: wordsame += 1
    else: worddiff.append((k, dict((la2 - lb2).most_common(6)), dict((lb2 - la2).most_common(6)), dict(list((a - b).items())[:8]), dict(list((b - a).items())[:8])))
print("guides with any change:", changed, "| same text apart from footer labels (regrouping only):", wordsame, "| character differences:", len(worddiff))
for k, lost, gained, wl, wg in worddiff: print(" ", k, "\n     chars only in old:", lost, "only in new:", gained, "\n     words only in old:", wl, "\n     words only in new:", wg)
