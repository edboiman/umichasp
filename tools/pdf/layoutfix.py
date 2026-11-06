"""Pages whose side-by-side boxes were read across (interleaving two boxes line by line).
Each fix replaces a contiguous run of blocks with the same text read box by box (boxpage.py, PDF coordinates),
and asserts that the words before and after are identical, so nothing is added or removed."""
import json, re, sys, collections
import pdfplumber
sys.path.insert(0, "/home/claude/pdfwork")
from boxpage import box_paras
R = lambda r: "".join(x[0] for x in r or [])
SUPL = str.maketrans("ᵃᵇᶜᵈᵉ⁰¹²³⁴⁵⁶⁷⁸⁹", "abcde0123456789")
def words(blocks):
    out = []
    def add(t):   # a footnote letter printed against the next word ("bStaphylococcus") counts as two words
        out.extend(re.findall(r"\w+", re.sub(r"\b([a-e])(?=[A-Z])", r"\1 ", t.translate(SUPL)).lower()))
    for b in blocks:
        if b["t"] == "table":
            for h in b.get("head") or []: add(h or "")
            for row in b["rows"]:
                for c in row:
                    for p in c: add(R(p))
        elif b["t"] == "flow":
            for c in b["cols"]:
                add(c.get("head") or "")
                for n in c["nodes"]:
                    for p in n["p"]: add(R(p))
            for n in b.get("notes", []):
                for p in n: add(R(p))
        elif b["t"] in ("rec", "figtext"): add(" ".join(b["lines"]))
        elif b["t"] == "fn":
            for n, r in b["items"]: add(n + " " + R(r))
        else: add(R(b.get("r")))
    return collections.Counter(out)
path = sys.argv[1]; d = json.load(open(path, encoding="utf-8")); log = []
def fix(pid, first, last, start_text, new_blocks, keep=(), dedupe=False):
    """dedupe=True: the old blocks repeated some text (a safety-net copy, or the page's own approval line and title);
    then nothing may be added, and every dropped word must still be present in the new blocks or the guideline header."""
    g = next(p for p in d["pages"] if p["id"] == pid)["guide"]; bl = g["blocks"]
    first_text = R(bl[first].get("r")) if "r" in bl[first] else json.dumps(bl[first], ensure_ascii=False)
    assert start_text in first_text[:400], (pid, first_text[:120])
    old = [b for i, b in enumerate(bl[first:last + 1], first) if i not in keep]
    kept = [bl[i] for i in keep]
    wo, wn = words(old), words(new_blocks)
    if dedupe:
        meta = words([{"t": "p", "r": [[" ".join([g.get("title") or "", g.get("approvals") or "", g.get("revised") or ""] + [" ".join(h) for h in g.get("history") or []] + (["Revision History"] if g.get("history") else []))]]}])   # the app labels the history "Revision history"
        assert not (wn - wo), (pid, "added", wn - wo)
        assert set(wo) <= set(wn) | set(meta), (pid, "lost", set(wo) - set(wn) - set(meta))
    else:
        assert wo == wn, (pid, wo - wn, wn - wo)
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

# Blood stream infections (adult p1, pediatric p2): the BCID2 organism panel is a three-column table
# (Gram positive / Gram negative / Fungus) with lettered footnotes, which the converter had read as a flowchart.
def plines(pdfname, pg, bb, swap=False):
    import convert as C
    with pdfplumber.open(f"/home/claude/pdfwork/in/pdfs/{pdfname}.pdf") as Pd:
        page = Pd.pages[pg - 1]; x0, top, x1, bot = bb
        ch = [c for c in page.chars if x0 <= (c["x0"] + c["x1"]) / 2 <= x1 and top <= (c["top"] + c["bottom"]) / 2 <= bot]
        from boxpage import R as RB
        out = [RB(L["runs"]) for L in C.chars_to_lines(ch)]
    if swap:   # this PDF's font names report italic as bold and bold as italic (checked against the page image)
        out = [[[x[0], x[1].translate(str.maketrans("bi", "ib"))] if len(x) > 1 else x for x in l] for l in out]
    return [[x for x in l if x[0]] for l in out]
def strip_r(l):
    l = [list(x) for x in l]
    l[-1][0] = l[-1][0].rstrip(); l[0][0] = l[0][0].lstrip()
    return [x if len(x) > 1 and x[1] else [x[0]] for x in l if x[0]]
def sup_tail(l, letters):
    """'Staphylococcus spp.b' -> 'Staphylococcus spp.' + superscript 'b' (footnote marker letters only)"""
    l = strip_r(l); t = l[-1][0]
    for m in letters:
        if t.endswith(m) and (t[:-1].endswith(".") or t[:-1].endswith("Enterobacterales")):
            return l[:-1] + ([[t[:-1], *l[-1][1:]]] if t[:-1] else []) + [[m, "s"]]
    return l
SUPC = {"a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "d": "ᵈ", "e": "ᵉ"}
def bcid_table(pg, cols_bb, head_bb, pdfname, swap):
    heads = []
    for bb in head_bb:
        t = "".join(x[0] for l in plines(pdfname, pg, bb, swap) for x in l).strip()
        heads.append(re.sub(r"(positive|negative)([ad])$", lambda m: m.group(1) + SUPC[m.group(2)], t))
    cells = [[sup_tail(l, "bce") for l in plines(pdfname, pg, bb, swap)] for bb in cols_bb]
    return {"t": "table", "pg": pg, "caption": None, "head": heads, "rows": [cells], "layout": "organism-panel"}

BA = "guidelines~adult~blood-stream-infections-adult"
L = lambda bb: plines(BA, 1, bb, swap=True)
purpose = L([37, 72, 757, 170])
fnl = L([37, 420, 757, 484])
def fn_item(l, marker):
    l = strip_r(l); t = l[0][0]
    assert t.startswith(marker), (marker, t)
    rest = [[t[len(marker):], *l[0][1:]]] + l[1:] if t[len(marker):] else l[1:]
    return rest
items = [["a", fn_item(fnl[0], "a")], ["b", fn_item(fnl[1], "b")], ["c", fn_item(fnl[2], "c")],
         ["d", [["a", "s"]] + fn_item(fnl[3], "d a") + [[" "]] + strip_r(fnl[4])], ["e", fn_item(fnl[5], "e")]]
rev = L([24, 486, 772, 545]); disc = L([18, 548, 775, 600])
new = [{"t": "h", "l": 2, "pg": 1, "r": strip_r(L([40, 48, 760, 68])[0])},
       {"t": "p", "pg": 1, "r": strip_r(purpose[0])},
       {"t": "p", "pg": 1, "r": [[" ".join("".join(x[0] for x in l).strip() for l in purpose[1:5])]]},
       {"t": "p", "pg": 1, "r": strip_r(purpose[5])},
       bcid_table(1, [[36, 196, 275, 418], [275, 196, 512, 418], [512, 196, 752, 418]], [[36, 178, 275, 195], [275, 178, 512, 195], [512, 178, 752, 195]], BA, True),
       {"t": "fn", "pg": 1, "items": items},
       {"t": "p", "pg": 1, "disc": 1, "r": [[" ".join("".join(x[0] for x in l).strip() for l in disc)]]}]
# This guideline's approval line and revision history are printed only on page 1: move them to the guideline header.
ga = next(p for p in d["pages"] if p["id"] == BA)["guide"]
rt = ["".join(x[0] for x in l).strip() for l in rev]
assert rt[0].startswith("Last revised:") and rt[1] == "Revision History", rt
m = re.match(r"Last revised:\s*(\S+)\s*Antimicrobial Stewardship Subcommittee:\s*(\S+)\s*P&T:\s*(\S+)$", rt[0])
ga["revised"] = ga.get("revised") or m.group(1)
ga["approvals"] = ga.get("approvals") or f"Last revised: {m.group(1)} · Antimicrobial Stewardship Subcommittee: {m.group(2)} · P&T: {m.group(3)}"
ga["history"] = ga.get("history") or [rt[2].split(" ", 1)]
fix(BA, 0, 1, "Gram positive", new, dedupe=True)

BP = "guidelines~pediatric~blood-stream-infections-pediatric"
gp = next(p for p in d["pages"] if p["id"] == BP)["guide"]
i0 = next(i for i, b in enumerate(gp["blocks"]) if b["t"] == "flow" and b.get("pg") == 2)
Lp = lambda bb: plines(BP, 2, bb)
fnp = Lp([60, 386, 960, 500])
itemsp = [[m, fn_item(fnp[k], m + ")")] for k, m in enumerate("abcd")]
itemsp[3][1] = itemsp[3][1] + [[" "]] + strip_r(fnp[4])
itemsp.append(["e", fn_item(fnp[5], "e)")])
itemsp = [[m + ")", r] for m, r in itemsp]
for _, r in itemsp:          # tidy run edges only: leading space after "a)", and the line-break space in "non- fragilis"
    r[0][0] = r[0][0].lstrip()
    for k in range(len(r) - 2, 0, -1):
        if r[k][0] == " " and r[k - 1][0].endswith("-"): del r[k]
newp = [{"t": "p", "pg": 2, "r": strip_r(Lp([0, 60, 960, 89])[0])},
        bcid_table(2, [[120, 110, 330, 385], [330, 110, 600, 385], [600, 110, 830, 385]], [[120, 89, 330, 110], [330, 89, 560, 110], [560, 89, 830, 110]], BP, False),
        {"t": "fn", "pg": 2, "items": itemsp},
        {"t": "p", "pg": 2, "r": [["Pediatric Bacteremia Guidelines"]]}]
last = i0 + 1 if gp["blocks"][i0 + 1]["t"] == "rec" else i0
fix(BP, i0, last, "Gram positive", newp, dedupe=True)
# Characters the PDF text layer cannot represent, restored from the page image after the word check:
for pid in (BA,):
    g = next(p for p in d["pages"] if p["id"] == pid)["guide"]
    for b in g["blocks"][:8]:
        for para in ([b["r"]] if "r" in b else []) + ([r for _, r in b["items"]] if b["t"] == "fn" else []):
            for x in para:
                y = x[0].replace("Biofire?", "Biofire™").replace("?-hemolytic", "β-hemolytic")
                if y != x[0]: log.append({"guideline": pid, "glyph": [x[0][:40], y[:40]]}); x[0] = y

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
