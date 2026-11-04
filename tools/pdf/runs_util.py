import re
def R(runs):
    """compact runs: [text, flags]  flags: b=bold i=italic s=superscript"""
    out = []
    for r in runs:
        f = ("b" if r.get("b") else "") + ("i" if r.get("i") else "") + ("s" if r.get("s") else "")
        if out and out[-1][1] == f: out[-1][0] += r["t"]
        else: out.append([r["t"], f])
    return [x if x[1] else [x[0]] for x in out]


