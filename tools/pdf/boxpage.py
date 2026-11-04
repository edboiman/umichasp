"""Hand-delimited decision layouts: text read box by box from the PDF (reading order inside each box),
for pages where the automatic reading order interleaves side-by-side boxes. Box coordinates are in PDF points."""
import sys, json, re, pdfplumber
sys.path.insert(0, "/home/claude/pdfwork")
import convert as C
def R(runs):
    out = []
    for r in runs:
        f = ("b" if r.get("b") else "") + ("i" if r.get("i") else "") + ("s" if r.get("s") else "")
        if out and out[-1][1] == f: out[-1][0] += r["t"]
        else: out.append([r["t"], f])
    return [x if x[1] else [x[0]] for x in out]
def box_paras(page, bb):
    x0, top, x1, bottom = bb
    chars = [c for c in page.chars if x0 <= (c["x0"] + c["x1"]) / 2 <= x1 and top <= (c["top"] + c["bottom"]) / 2 <= bottom]
    lines = C.chars_to_lines(chars)
    paras = C.cell_blocks(lines, x1 - x0)
    return [R(p) for p in paras if C.runs_text(p).strip()]
if __name__ == "__main__":
    pdf, pg = sys.argv[1], int(sys.argv[2]); boxes = json.loads(sys.argv[3])
    with pdfplumber.open(pdf) as P:
        page = P.pages[pg - 1]
        for bb in boxes:
            print("BOX", bb)
            for p in box_paras(page, bb): print("   ", p)
