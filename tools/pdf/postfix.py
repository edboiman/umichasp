import json, re, sys
sys.path.insert(0, ".")
from convert import runs_text
path = sys.argv[1]
d = json.load(open(path, encoding="utf-8"))
conv = json.load(open("converted.json"))
CONT = re.compile(r"(?i)(\b(and|or|of|the|a|an|to|for|in|with|by|on|at|from|than|as|is|are|be|if|when|who|that|which|should|may|can|not)|[,(/\-–])\s*$")
def R(r): return "".join(x[0] for x in r)
DRUGS = {w.lower() for x in json.load(open("/home/claude/v2/umichasp-app/data/drugs.json", encoding="utf-8")) for n in [x["name"], *x["aliases"]] for w in re.findall(r"[A-Za-z]{4,}", n)}
def join_cell(c):
    out, n = [], 0
    for para in c:
        t = R(para).strip()
        first = (re.match(r"[A-Za-z]+", t) or [""])[0].lower()
        prev_t = R(out[-1]).rstrip() if out else ""
        freq = bool(re.match(r"^(BID|TID|QID|QD|q\d+h|daily|once daily|twice daily)\b\.?$", t)) and not re.search(r"[.:;!?]$", prev_t) and re.search(r"\b(mg|g|units?|mL|mcg)\b|\)$", prev_t)
        wrapped = (t[:1].islower() and not re.search(r"[.:;!?)]$", prev_t) and first not in DRUGS and not prev_t.startswith(("OR", "AND"))) or freq
        if out and (CONT.search(prev_t) or wrapped) and (t[:1].islower() or freq) and not re.match(r"^(o|or|and)\s", t):
            prev = out[-1]
            lw = (re.search(r"([A-Za-z]+)$", R(prev).rstrip()) or [None, ""])[1]
            fw = (re.match(r"[A-Za-z]+", t) or [""])[0]
            glued = re.search(r"[A-Za-z]-$", R(prev).rstrip()) or (lw and fw and (lw + fw).lower() in DRUGS and lw.lower() not in DRUGS)
            if glued: prev[-1] = [prev[-1][0].rstrip()] + prev[-1][1:]
            elif prev and not prev[-1][0].endswith(" "): prev[-1] = [prev[-1][0] + " "] + prev[-1][1:]
            out[-1] = prev + para; n += 1
        else:
            out.append(para)
    return out, n
joins = 0; approvals = 0; log = []
for p in d["pages"]:
    g = p.get("guide")
    if not g or g.get("pocket"): continue
    for b in g["blocks"]:
        if b["t"] == "table":
            for r in b["rows"]:
                for i, c in enumerate(r):
                    before = [R(x) for x in c]
                    r[i], n = join_cell(c)
                    if n: joins += n; log.append((p["id"], b.get("pg"), " | ".join(before)[:160]))
            for s in b.get("shared", []):
                s["p"], n = join_cell(s["p"]); joins += n
    # approval line from the PDF footer row
    for blk in conv.get(p["id"], {}).get("blocks", []):
        if blk.get("t") != "table": continue
        for r in blk["rows"]:
            texts = [" ".join(runs_text(x) for x in c).strip() for c in r["cells"]]
            if any(re.match(r"(?i)last revised", t) for t in texts):
                g["approvals"] = " · ".join(t for t in texts if t); approvals += 1; break
        if g.get("approvals"): break
# ---- chart pages: verbatim page text under the image (replaces garbled reconstruction) ----
import pypdfium2 as pdfium, pdfplumber
DISC = re.compile(r"(?i)meant to serve as treatment guidelines|call 911|professional medical advice|from time to time change|independent source|most up-to-date document|^page \d+ of \d+$")
figtext_pages = 0
for p in d["pages"]:
    g = p.get("guide")
    if not g or g.get("pocket"): continue
    figs = [b["pg"] for b in g["blocks"] if b["t"] == "fig"]
    if not figs: continue
    pdf = pdfium.PdfDocument(f"in/pdfs/{p['id']}.pdf")
    nb = []
    for b in g["blocks"]:
        if b.get("hide") and b.get("pg") in figs: continue
        nb.append(b)
        if b["t"] == "fig":
            lines = [" ".join(l.split()).replace("\ufffe", "-") for l in pdf[b["pg"] - 1].get_textpage().get_text_range().splitlines()]
            lines = [l for l in lines if l and not DISC.search(l)]
            nb.append({"t": "figtext", "pg": b["pg"], "lines": lines}); figtext_pages += 1
    g["blocks"] = nb

# ---- intra-word spaces and doubled letters, repaired only when the PDF itself contains the repaired word ----
RAWTEXT = {}
def word_sets(pid):
    pdf = pdfium.PdfDocument(f"in/pdfs/{pid}.pdf")
    RAWTEXT[pid] = "\n".join(pdf[i].get_textpage().get_text_range() for i in range(len(pdf)))
    a = set(re.findall(r"[a-z]+", RAWTEXT[pid].lower()))
    with pdfplumber.open(f"in/pdfs/{pid}.pdf") as P:
        b = set(w.lower() for pg in P.pages for x in pg.extract_words() for w in re.findall(r"[A-Za-z]+", x["text"]))
    return a, b
fixes = []
def repair(text, A, Bw, pid):
    def join(m):
        x, y = m.group(1), m.group(2); xy = (x + y).lower()
        if xy in A and xy in Bw and (x.lower() not in Bw or y.lower() not in Bw):
            fixes.append((pid, m.group(0), x + y)); return x + y
        # a word the source itself wraps across two lines in a narrow column (no hyphen), e.g. "streptoco|cci"
        raw = RAWTEXT.get(pid, "")
        splits = len(re.findall(re.escape(x) + r"[ \t]*[\r\n]+[ \t]*" + re.escape(y) + r"\b", raw))
        def standalone(w): return len(re.findall(r"(?<![A-Za-z])" + re.escape(w) + r"(?![A-Za-z])", raw, re.I))
        if splits and (xy in A or xy in Bw) and standalone(x) <= splits and standalone(y) <= splits:
            fixes.append((pid, m.group(0), x + y)); return x + y
        return m.group(0)
    t2 = re.sub(r"\b([A-Za-z]{2,}) ([a-z]{2,})\b", join, text)
    # a lone letter split from the rest of its word ("I f patient", "a m edical emergency")
    def join1(m):
        # confirmed by the source text in the same context: "<X><y> <next word>" occurs, "<X> <y> <next word>" does not
        x, y, nxt = m.group(1), m.group(2), m.group(3)
        raw = RAWTEXT.get(pid, "")
        ok = re.search(r"(?<![A-Za-z])" + re.escape(x + y) + r"\s+" + re.escape(nxt) + r"(?![A-Za-z])", raw)
        bad = re.search(r"(?<![A-Za-z])" + re.escape(x) + r"\s+" + re.escape(y) + r"\s+" + re.escape(nxt), raw)
        if ok and not bad:
            fixes.append((pid, x + " " + y, x + y)); return x
        return m.group(0)
    t2 = re.sub(r"(?<![A-Za-z])([A-Za-z]) (?=([a-z]+)\s+([A-Za-z]+))", join1, t2)
    def undouble(m):
        w = m.group(0)
        if len(w) >= 6 and len(w) % 2 == 0 and all(w[i] == w[i + 1] for i in range(0, len(w), 2)):
            u = w[::2]
            if u.lower() in A: fixes.append((pid, w, u)); return u
        return w
    return re.sub(r"[A-Za-z]{6,}", undouble, t2)
def fix_runs(r, A, Bw, pid):
    for x in r: x[0] = repair(x[0], A, Bw, pid)
    # across run boundaries: decide on the joined paragraph text, then delete the one space character
    full = "".join(x[0] for x in r)
    fixed = repair(full, A, Bw, pid)
    if fixed != full:
        # find deleted space positions by aligning the two strings
        dels, i, j = [], 0, 0
        while i < len(full):
            if j < len(fixed) and full[i] == fixed[j]: i += 1; j += 1
            elif full[i] == " ": dels.append(i); i += 1
            else: return r          # unexpected change: leave untouched
        pos = 0
        for x in r:
            t = x[0]; keep = "".join(ch for k, ch in enumerate(t) if pos + k not in dels)
            pos += len(t); x[0] = keep
    return r
for p in d["pages"]:
    g = p.get("guide")
    if not g or g.get("pocket"): continue
    A, Bw = word_sets(p["id"])
    for b in g["blocks"]:
        if "r" in b: fix_runs(b["r"], A, Bw, p["id"])
        if b["t"] == "table":
            if b.get("head"): b["head"] = [repair(h, A, Bw, p["id"]) for h in b["head"]]
            if b.get("caption"): b["caption"] = repair(b["caption"], A, Bw, p["id"])
            for r in b["rows"]:
                for c in r:
                    for para in c: fix_runs(para, A, Bw, p["id"])
            for s2 in b.get("shared", []):
                for para in s2["p"]: fix_runs(para, A, Bw, p["id"])
        if b["t"] == "flow":
            for c in b["cols"]:
                for n in c["nodes"]:
                    for para in n["p"]: fix_runs(para, A, Bw, p["id"])
# ---- header markers placed before the word they belong to ("Empiric § Therapy" where the PDF reads "Empiric Therapy§") ----
marker_fixes = []
def move_marker(t, pid):
    def f(m):
        w1, mk, w2 = m.group(1), m.group(2), m.group(3)
        raw = RAWTEXT.get(pid, "")
        if re.search(re.escape(w2) + re.escape(mk), raw) and not re.search(re.escape(mk) + r"\s*" + re.escape(w2), raw):
            marker_fixes.append((pid, m.group(0), w1 + " " + w2 + mk)); return w1 + " " + w2 + mk
        return m.group(0)
    return re.sub(r"(\w+)\s+([§†‡¶])\s+(\w+)", f, t)
for p in d["pages"]:
    g = p.get("guide")
    if not g or g.get("pocket"): continue
    for b in g["blocks"]:
        if b["t"] == "table":
            if b.get("head"): b["head"] = [re.sub(r"(?<=[⁰¹²³⁴⁵⁶⁷⁸⁹])'(?=[⁰¹²³⁴⁵⁶⁷⁸⁹])", ",", move_marker(h, p["id"])) for h in b["head"]]   # "³'⁴" -> "³,⁴"
            for s2 in b.get("shared", []): s2["label"] = move_marker(s2["label"], p["id"])
# ---- a header word placed in the neighbouring column ("Subsequent Therapy (…)  Therapy" | "Duration of" where the PDF reads "Duration of Therapy") ----
def ws(t): return re.sub(r"\s+", " ", t).strip()
for p in d["pages"]:
    g = p.get("guide")
    if not g or g.get("pocket"): continue
    raw = RAWTEXT.get(p["id"], "")
    for b in g["blocks"]:
        H = b.get("head") if b["t"] == "table" else None
        if not H: continue
        for j, hj in enumerate(H):
            if not re.search(r"\b(of|and|for|to|with|in)$", ws(hj)): continue
            left = next((k for k in range(j - 1, -1, -1) if H[k].strip()), None)
            right = next((k for k in range(j + 1, len(H)) if H[k].strip()), None)
            for k in (x for x in (left, right) if x is not None):
                if 0 <= k < len(H) and re.search(r"\s{2,}(\w+)$", H[k]):
                    w = re.search(r"\s{2,}(\w+)$", H[k]).group(1)
                    if re.search(r"\s+".join(map(re.escape, (ws(hj) + " " + w).split())), raw):
                        marker_fixes.append((p["id"], H[k] + " | " + hj, ws(H[k][:-len(w)]) + " | " + ws(hj) + " " + w))
                        H[k] = H[k][:-len(w)].rstrip(); H[j] = ws(hj) + " " + w
                        break
json.dump(marker_fixes, open("marker_fix_log.json", "w"), ensure_ascii=False, indent=0)
# ---- dropped first letters (bullet stripping removed one letter); restored only when the PDF line confirms exactly one letter ----
first_fixes = []
def nz(s): return re.sub(r"[^a-z0-9]", "", s.lower())
for p in d["pages"]:
    g = p.get("guide")
    if not g or g.get("pocket"): continue
    pdf = pdfium.PdfDocument(f"in/pdfs/{p['id']}.pdf")
    rawtxt = " ".join(pdf[i].get_textpage().get_text_range() for i in range(len(pdf)))
    rawset = set(re.findall(r"[A-Za-z]+", rawtxt)); rawn = nz(rawtxt)
    def fix_first(r, where):
        if not r: return
        t = R(r).lstrip(); m = re.match(r"[A-Za-z]+", t)
        if not m or m.group(0) in rawset or len(m.group(0)) < 2: return
        ctx = nz(t[:45])
        good = [c for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" if (c + m.group(0)) in rawset and nz(c) + ctx in rawn]
        letters = {c.lower() for c in good}
        if len(letters) == 1:
            up = [c for c in good if c.isupper()]
            good = up[:1] or good[:1]
            lead = len(r[0][0]) - len(r[0][0].lstrip())
            r[0][0] = r[0][0][:lead] + good[0] + r[0][0][lead:]
            first_fixes.append((p["id"], where, good[0] + t[:70]))
    for b in g["blocks"]:
        if b["t"] in ("li", "p", "h"): fix_first(b["r"], b["t"])
        if b["t"] == "table":
            for r in b["rows"]:
                for c in r:
                    for para in c: fix_first(para, "cell")
            for s2 in b.get("shared", []):
                for para in s2["p"]: fix_first(para, "shared")
# ---- rotated labels read as spaced single characters in reverse ("S N O I T A D … R E F E R" = "REFER TO >50 kg DOSING RECOMMENDATIONS") ----
rot_fixes = []
def rot_fix(t, pid, plines):
    m = re.fullmatch(r"\s*((?:\S ){7,}\S)\s*", t)
    if not m: return t
    chars = m.group(1).split(" ")
    for cand in ("".join(reversed(chars)), "".join(chars)):
        hit = [l.strip() for l in plines if nz(l) == nz(cand)]
        if hit and hit[0] != t.strip():
            rot_fixes.append((pid, t, hit[0])); return hit[0]
        if hit: return t
    return t
def scramble_fix(t, pid, plines):
    """rotated label read as interleaved fragments ("U MG G DO NG SE /K SI"): same characters as exactly one PDF line"""
    toks_ = t.split()
    if len(toks_) < 4 or sum(len(x) <= 2 for x in toks_) < len(toks_) / 2: return t
    joined = "\n".join(plines)
    if nz(t) in nz(joined): return t                       # the text exists as written: not scrambled
    words = set(re.findall(r"[A-Za-z]+", joined))
    alpha = [x for x in toks_ if re.search(r"[A-Za-z]", x)]
    if not alpha or sum(re.sub(r"[^A-Za-z]", "", x) in words for x in alpha) > len(alpha) / 2: return t
    key = sorted(re.sub(r"\s", "", t))
    hit = {l.strip() for l in plines if sorted(re.sub(r"\s", "", l)) == key}
    if len(hit) == 1:
        h = hit.pop(); rot_fixes.append((pid, t, h)); return h
    return t
def spaced_fix(t, pid, raw):
    """letter-spaced words ("o f d e e p t i ssue") rejoined with the PDF's own spacing"""
    def f(m):
        letters = re.sub(r"\s", "", m.group(0))
        pat = r"\s*".join(map(re.escape, letters))
        hits = {re.sub(r"\s+", " ", x.group(0)).strip() for x in re.finditer(r"(?<![A-Za-z])" + pat + r"(?![A-Za-z])", raw)}
        if len(hits) == 1:
            h = hits.pop()
            if h != m.group(0): rot_fixes.append((pid, m.group(0), h)); return h
        return m.group(0)
    return re.sub(r"(?<![A-Za-z])(?:[A-Za-z] ){3,}[A-Za-z]+(?![A-Za-z])", f, t)
for p in d["pages"]:
    g = p.get("guide")
    if not g or g.get("pocket"): continue
    pdf = pdfium.PdfDocument(f"in/pdfs/{p['id']}.pdf")
    plines = [l for i in range(len(pdf)) for l in pdf[i].get_textpage().get_text_range().splitlines() if l.strip()]
    for b in g["blocks"]:
        paras_ = []
        if b["t"] == "table": paras_ = [para for r in b["rows"] for c in r for para in c] + [para for s2 in b.get("shared", []) for para in s2["p"]]
        elif "r" in b: paras_ = [b["r"]]
        rawj = "\n".join(plines)
        for para in paras_:
            if len(para) == 1:
                para[0][0] = scramble_fix(rot_fix(para[0][0], p["id"], plines), p["id"], plines)
            for x in para: x[0] = spaced_fix(x[0], p["id"], rawj)
json.dump(rot_fixes, open("rotated_label_log.json", "w"), ensure_ascii=False, indent=0)
print("rotated labels restored:", len(rot_fixes))
# ---- list enumerators ("1.", "a.", "ii.") that bullet stripping removed; restored when exactly one marker in the PDF precedes that text ----
enum_fixes = []
MK = re.compile(r"^\s*((?:[ivx]{1,4}|[a-zA-Z]|\d{1,2})[.)])\s+(\S.*)$")
for p in d["pages"]:
    g = p.get("guide")
    if not g or g.get("pocket"): continue
    pdf = pdfium.PdfDocument(f"in/pdfs/{p['id']}.pdf")
    plines = [l for i in range(len(pdf)) for l in pdf[i].get_textpage().get_text_range().splitlines() if l.strip()]
    marked, unmarked = [], []
    for l in plines:
        m = MK.match(l)
        if m: marked.append((m.group(1), nz(m.group(2))))
        else: unmarked.append(nz(l))
    for b in g["blocks"]:
        if b["t"] not in ("li", "p", "h") or b.get("n"): continue
        t = R(b["r"]).strip(); bt = nz(t)
        if len(bt) < 8 or re.match(r"^(\(?[ivx]{1,4}|[a-zA-Z]|\d{1,2})[.)]\s", t): continue
        hits = set()
        for mk, rest in marked:
            k = min(40, len(bt), len(rest))
            if k >= 8 and bt[:k] == rest[:k]: hits.add(mk)
        if len(hits) != 1: continue
        k0 = min(40, len(bt))
        if any(len(u) >= 8 and u[:min(k0, len(u))] == bt[:min(k0, len(u))] for u in unmarked): continue
        mk = hits.pop()
        if b["t"] == "li": b["n"] = mk
        else: b["r"] = [[mk + " "]] + b["r"]
        enum_fixes.append((p["id"], b["t"], mk, t[:60]))
json.dump(enum_fixes, open("enum_log.json", "w"), ensure_ascii=False, indent=0)
print("list enumerators restored:", len(enum_fixes))
json.dump(first_fixes, open("first_letter_log.json", "w"), ensure_ascii=False, indent=0)
print("first letters restored:", len(first_fixes))
json.dump(fixes, open("word_fix_log.json", "w"), ensure_ascii=False, indent=0)
json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("chart pages given verbatim text:", figtext_pages, "| word repairs:", len(fixes))
print("mid-sentence joins:", joins, "| approval lines restored:", approvals)
json.dump(log, open("join_log.json", "w"), indent=1, ensure_ascii=False)
for x in log[:0]: print("  ", x[0].split("~")[-1][:30], "p", x[1], "|", x[2])
