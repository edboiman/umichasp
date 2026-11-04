import json, pathlib, sys, traceback, re
sys.path.insert(0, ".")
from convert import convert, runs_text
out = {}
for f in sorted(pathlib.Path("in/pdfs").glob("*.pdf")):
    try:
        out[f.stem] = convert(str(f))
    except Exception as e:
        out[f.stem] = {"error": f"{type(e).__name__}: {e}"}
json.dump(out, open("converted.json", "w"), ensure_ascii=False)
stats = []
for k, v in out.items():
    if "error" in v: stats.append((k, "ERROR", v["error"])); continue
    B = v["blocks"]; T = [b for b in B if b["t"] == "table"]
    txt = sum(len(runs_text(b["runs"])) for b in B if "runs" in b) + sum(len(" ".join(runs_text(p) for r in b["rows"] for c in r["cells"] for p in c)) for b in T)
    longp = max([len(runs_text(b["runs"])) for b in B if "runs" in b] or [0])
    stats.append((k, v["pages"], len(B), len(T), txt, longp))
for s in stats: print(s)
