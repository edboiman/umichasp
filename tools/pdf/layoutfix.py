"""Pages whose side-by-side boxes were read across (interleaving two boxes line by line).
Each fix replaces a contiguous run of blocks with the same text read box by box (boxpage.py, PDF coordinates),
and asserts that the words before and after are identical, so nothing is added or removed."""
import json, re, sys, collections
import pdfplumber
sys.path.insert(0, "/home/claude/pdfwork")
from boxpage import box_paras
R = lambda r: "".join(x[0] for x in r or [])
def words(blocks):
    out = []
    for b in blocks:
        if b["t"] == "table":
            for row in b["rows"]:
                for c in row:
                    for p in c: out += re.findall(r"\w+", R(p).lower())
        else: out += re.findall(r"\w+", R(b.get("r")).lower())
    return collections.Counter(out)
path = sys.argv[1]; d = json.load(open(path, encoding="utf-8")); log = []
def fix(pid, first, last, start_text, new_blocks, keep=()):
    g = next(p for p in d["pages"] if p["id"] == pid)["guide"]; bl = g["blocks"]
    assert R(bl[first].get("r")).startswith(start_text), (pid, R(bl[first].get("r")))
    old = [b for i, b in enumerate(bl[first:last + 1], first) if i not in keep]
    kept = [bl[i] for i in keep]
    assert words(old) == words(new_blocks), (pid, words(old) - words(new_blocks), words(new_blocks) - words(old))
    g["blocks"] = bl[:first] + new_blocks + kept + bl[last + 1:]
    log.append({"guideline": pid, "replaced_blocks": [first, last], "new_blocks": len(new_blocks), "words": sum(words(old).values())})
def P(pdfname, pg, bb):
    with pdfplumber.open(f"/home/claude/pdfwork/in/pdfs/{pdfname}.pdf") as Pd: return box_paras(Pd.pages[pg - 1], bb)
def merge(paras): # one source box wrapped into several paragraphs -> one paragraph
    out = []
    for p in paras:
        if out and not re.search(r"[.:!?]\s*$", R(out[-1])): out[-1] = out[-1] + [[" "]] + p
        else: out.append(p)
    return out

# Aminoglycoside dosing (adult), page 1: three question boxes, each with its answer box to the right.
A = "pharmacokinetics~aminoglycoside-adult"
q1, y1, a1 = P(A, 1, [30, 100, 180, 192]), P(A, 1, [180, 125, 215, 150]), P(A, 1, [226, 100, 580, 212])
q2, y2, a2 = P(A, 1, [28, 212, 182, 422]), P(A, 1, [182, 300, 226, 330]), P(A, 1, [226, 212, 580, 630])
q3, a3 = P(A, 1, [24, 648, 178, 760]), P(A, 1, [230, 648, 582, 760])
a1 = [a1[0], a1[1] + [[" "]] + a1[2][:2], a1[2][2:]]           # "…Penicillin-intermediate or" wraps onto "resistant Streptococci: …"
a1[2] = [[x[0].strip(), *x[1:]] for x in a1[2] if x[0].strip()]
a1[2] = [a1[2][0], [" "], a1[2][1]] if len(a1[2]) == 2 else a1[2]
q2 = [q2[0], [[x[0].strip(), *x[1:]] for x in q2[1] if x[0].strip()], q2[2]]
q2[1] = [[" ".join(x[0] for x in q2[1]), "b"]]
a2 = a2[:4] + [[a2[4][0], a2[4][1]], [a2[4][2], a2[4][3]]] + a2[5:]   # Endometritis / Surgical prophylaxis are separate source lines
a2[-1] = [["EIDA dosing is preferred for most patients. See below for dosing and monitoring instructions for EIDA and traditional dosing", "b"]]
a3 = [[["Consult ID team or ID pharmacist for appropriate goal target levels and empiric dosing recommendations.", "b"]]]
table = {"t": "table", "pg": 1, "caption": None, "head": None, "layout": "decision",
         "rows": [[q1, y1 + a1], [q2, y2 + a2], [q3, a3]]}
fix(A, 1, 29, "Empiric or definitive treatment of Gram-positive", [table])

# Bloodstream infections (pediatric), page 1: "How to use this guideline" — three boxes side by side.
B = "guidelines~pediatric~blood-stream-infections-pediatric"
boxes = [merge(P(B, 1, bb)) for bb in ([195, 255, 325, 345], [328, 255, 585, 345], [588, 255, 800, 345])]
new = [{"t": "li", "pg": 1, "d": 0, "r": [x for p in bx for x in p]} for bx in boxes]
fix(B, 9, 21, "For patients with", new, keep=(20,))

# The program's standard disclaimer, printed in the PDF but dropped as page furniture for some guidelines:
# restored verbatim (whitespace normalised) at the end of the guideline, from the page where it is printed.
import pypdfium2 as pdfium
sys.path.insert(0, "/home/claude/pdfwork")
from textdiff import text as gtext
disc_log = []
DISC = re.compile(r"(The (?:recommendations|guidelines)[^\n]{0,40}(?:meant to|are intended)[\s\S]*?call 911[\s\S]*?(?:up-to-date document\.|up to date document\.|independent source\.)(?:\s*If obtained from a source other than[\s\S]*?document\.)?)")
for p in d["pages"]:
    g = p.get("guide")
    if not g or g.get("pocket") or "911" in gtext(g): continue
    pdf = pdfium.PdfDocument(f"/home/claude/pdfwork/in/pdfs/{p['id']}.pdf")
    for i in range(len(pdf)):
        m = DISC.search(pdf[i].get_textpage().get_text_range())
        if m:
            t = re.sub(r"\s+", " ", m.group(1)).strip()
            parts = re.split(r"\s(?=If obtained from a source other than)", t)
            for part in parts: g["blocks"].append({"t": "p", "pg": i + 1, "disc": 1, "r": [[part]]})
            disc_log.append({"guideline": p["id"], "page": i + 1, "chars": len(t)}); break
json.dump(disc_log, open("/home/claude/pdfwork/disclaimer_log.json", "w"), indent=1)
print("source disclaimers restored:", len(disc_log))
json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(log, open("/home/claude/pdfwork/layout_fix_log.json", "w"), indent=1)
print("layout fixes:", log)
