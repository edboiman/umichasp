"""
One-time capture of the Michigan Medicine ASP site for the ASP Guide app.

Run on your own computer (needs normal internet access):

    py -m pip install requests beautifulsoup4 pypdfium2 pillow
    py tools\\capture.py --contact you@example.org

What it does
  1. Visits the public guideline pages (honors robots.txt, 1.5 s between
     requests, never requests the staff-only Annual Reports area).
  2. Downloads the PDF embedded on each guideline page.
  3. Renders every PDF page to an image (so the app shows the page exactly as
     published, tables and algorithms included) and extracts its text for
     search and the antibiotic lookup.

Output
  data/content.json      page list, text and metadata the app reads
  data/docs/             PDFs and page images
  capture_report.txt     what was captured, skipped or failed

Takes roughly 10-20 minutes. Safe to re-run; already-downloaded PDFs are reused.
"""
import argparse, datetime as dt, hashlib, json, pathlib, re, sys, time
from urllib.parse import urljoin, urlparse, parse_qs, urldefrag, unquote
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup, NavigableString, Tag

SITE = "https://antimicrobialstewardship.med.umich.edu"
HOST = urlparse(SITE).hostname
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DOCS = DATA / "docs"
OUT = DATA / "content.json"
REPORT = ROOT / "capture_report.txt"

SECTIONS = [  # index pages; same-site child pages are captured too
    ("/guidelines/adult", "Inpatient Adult"),
    ("/guidelines/pediatric", "Inpatient Pediatric"),
    ("/guidelines/outpatient", "Outpatient"),
    ("/guidelines/surgical-prophylaxis", "Surgical Prophylaxis"),
    ("/guidelines/hiv", "HIV"),
    ("/guidelines/transplant", "Transplant"),
    ("/copat", "COpAT"),
    ("/pharmacokinetics", "Pharmacokinetics"),
    ("/patient-education", "Patient Education"),
    ("/guidelines/Diarrhea-home", "Inpatient Adult"),
]
EXTRA = [("/home", "About")]
NEVER = ["/AR"]
RESTRICTED = ["policystat.com", "sharepoint.com", "safelinks.protection.outlook.com"]
JUNK = {"report abuse", "page details", "page updated", "search this site", "embedded files",
        "skip to main content", "skip to navigation", "google sites"}
MAX_PAGES = 400
DELAY = 1.5
IMG_WIDTH = 1400
SKIP_TAGS = ["script", "style", "noscript", "img", "svg", "iframe", "picture", "video", "button", "form"]


def host_is(host, domain):
    host = (host or "").lower()
    return host == domain or host.endswith("." + domain)


def unwrap(href):
    p = urlparse(href)
    if host_is(p.hostname, "google.com") and p.path == "/url":
        return parse_qs(p.query).get("q", [href])[0]
    return href


def norm_path(url):
    return re.sub(r"/+$", "", urlparse(url).path) or "/"


def link_kind(url):
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        return None
    if p.hostname == HOST:
        return "site"
    if any(host_is(p.hostname, h) for h in RESTRICTED):
        return "staff"
    if host_is(p.hostname, "drive.google.com") or host_is(p.hostname, "docs.google.com"):
        return "file"
    return "external"


def text_of(el):
    if el is None:
        return ""
    return " ".join(el.get_text("").split())


class Client:
    def __init__(self, contact):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = f"umichasp-personal-reference/1.1 (one-time capture; contact: {contact})"
        self.rp = RobotFileParser()
        r = self.s.get(SITE + "/robots.txt", timeout=20)
        self.rp.parse(r.text.splitlines() if r.status_code == 200 else [])
        time.sleep(DELAY)

    def allowed(self, url):
        path = norm_path(url)
        if any(path.lower() == n.lower() or path.lower().startswith(n.lower() + "/") for n in NEVER):
            return False
        return self.rp.can_fetch(self.s.headers["User-Agent"], url)

    def get(self, url, **kw):
        for attempt in range(3):
            try:
                r = self.s.get(url, timeout=60, **kw)
                time.sleep(DELAY)
                if r.status_code < 500:
                    return r
            except requests.RequestException:
                time.sleep(DELAY)
            time.sleep(DELAY * 2 ** (attempt + 1))
        return None


# ---------- page parsing ----------

EMBED_PATTERNS = [
    (re.compile(r"drive\.google\.com/file/d/([\w-]{20,})"), "drive"),
    (re.compile(r"drive\.google\.com/(?:uc|open)\?[^\"'\s<>]*?id=([\w-]{20,})"), "drive"),
    (re.compile(r"docs\.google\.com/(document|presentation|spreadsheets)/d/([\w-]{20,})"), "gdoc"),
]


def find_embeds(html):
    """Google Drive files referenced anywhere in the page, including escaped embed data."""
    raw = html.replace("\\u002F", "/").replace("\\u003d", "=").replace("\\u0026", "&").replace("\\/", "/")
    raw = unquote(unquote(raw))
    found, seen = [], set()
    for rx, kind in EMBED_PATTERNS:
        for m in rx.finditer(raw):
            if kind == "gdoc":
                key, sub = m.group(2), m.group(1)
            else:
                key, sub = m.group(1), None
            if key not in seen:
                seen.add(key)
                found.append({"id": key, "kind": kind, "sub": sub})
    return found


def site_extras(soup):
    """Disclaimer (site footer) and alert banner (site header), before they are stripped."""
    disclaimer = None
    for t in soup.find_all(string=re.compile(r"meant to serve|disclaimer", re.I)):
        block = t.find_parent(["p", "small", "div"])
        txt = text_of(block)
        if len(txt) > 120:
            disclaimer = txt
            break
    alert = None
    for reg in soup.find_all(attrs={"role": "region"}):
        if reg.find_parent("header") is None:
            continue
        txt = text_of(reg)
        if len(txt) > 30:
            a = reg.find("a", href=True)
            label = text_of(a) if a else ""
            alert = {"text": txt.replace(label, "").strip(" :–-") if label else txt,
                     "path": norm_path(urljoin(SITE + "/", a["href"])) if a else None,
                     "link": label or None}
            break
    return disclaimer, alert


def content_root(soup):
    """Google Sites puts page content in <section> blocks; role=main is only the title."""
    for t in soup(SKIP_TAGS):
        t.decompose()
    for t in soup.find_all(["nav", "header", "footer"]):
        t.decompose()
    for role in ("navigation", "banner", "contentinfo"):
        for t in soup.find_all(attrs={"role": role}):
            t.decompose()
    # Words are often split across <span>s: join text without separators and
    # add a space at the end of every block-level element instead.
    for t in soup.find_all(["p", "div", "li", "td", "th", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "small"]):
        t.append(" ")
    for br in soup.find_all("br"):
        br.replace_with(" ")
    sections = [x for x in soup.find_all("section") if not x.find_parent("section")]
    if sections:
        wrap = soup.new_tag("div")
        for x in sections:
            wrap.append(x.extract())
        return wrap
    return soup.find("main") or soup.find(attrs={"role": "main"}) or soup.body or soup


BLOCK_TAGS = ["p", "div", "ul", "ol", "table", "h1", "h2", "h3", "h4", "h5", "h6"]


def blocks_of(root, base):
    out, links, seen = [], [], set()

    def add_link(a):
        href = urldefrag(unwrap(urljoin(base, a.get("href", "").strip())))[0]
        kind = link_kind(href)
        label = text_of(a)
        if kind and label and href not in seen:
            seen.add(href)
            links.append({"text": label[:200], "href": href, "kind": kind})
        return href, kind, label

    def push(blk):
        x = blk.get("x", "")
        if blk["t"] != "table" and (not x or x.lower() in JUNK):
            return
        if out and out[-1].get("x") == x and blk["t"] != "table":
            return
        out.append(blk)

    def linked(el, blk):
        for a in el.find_all("a", href=True):
            href, kind, label = add_link(a)
            if kind and label == blk.get("x"):
                blk["href"] = href
        return blk

    def walk(node, depth=0):
        for el in node.children:
            if not isinstance(el, Tag):
                continue
            name = el.name
            if name in ("h1", "h2", "h3", "h4", "h5", "h6"):
                push(linked(el, {"t": "h", "l": int(name[1]), "x": text_of(el)}))
            elif name == "table":
                rows = [[text_of(c) for c in tr.find_all(["td", "th"])] for tr in el.find_all("tr")]
                rows = [r for r in rows if any(r)]
                if rows:
                    push({"t": "table", "rows": rows})
                for a in el.find_all("a", href=True):
                    add_link(a)
            elif name in ("ul", "ol"):
                for li in el.find_all("li", recursive=False):
                    nested = li.find_all(["ul", "ol"], recursive=False)
                    for n in nested:
                        n.extract()
                    push(linked(li, {"t": "li", "d": depth, "x": text_of(li)}))
                    for n in nested:
                        holder = BeautifulSoup("", "html.parser").new_tag("div")
                        holder.append(n)
                        walk(holder, depth + 1)
            elif name == "p" or (name in ("div", "span", "small") and not el.find(BLOCK_TAGS)):
                push(linked(el, {"t": "p", "x": text_of(el)}))
            elif name == "a" and el.get("href"):
                href, kind, label = add_link(el)
                push({"t": "p", "x": label, **({"href": href} if kind else {})})
            else:
                walk(el, depth)
    walk(root)
    return out, links


# ---------- PDFs ----------

def download_doc(client, emb):
    """Bytes of a public PDF for a Drive file or Google Doc, or (None, reason)."""
    i = emb["id"]
    if emb["kind"] == "gdoc":
        urls = {"document": [f"https://docs.google.com/document/d/{i}/export?format=pdf"],
                "presentation": [f"https://docs.google.com/presentation/d/{i}/export/pdf"],
                "spreadsheets": [f"https://docs.google.com/spreadsheets/d/{i}/export?format=pdf"]}[emb["sub"]]
    else:
        urls = [f"https://drive.usercontent.google.com/download?id={i}&export=download&confirm=t",
                f"https://drive.google.com/uc?export=download&id={i}"]
    reason = "no response"
    for u in urls:
        r = client.get(u)
        if r is None:
            continue
        if r.status_code != 200:
            reason = f"HTTP {r.status_code}"
            continue
        if r.content[:5] == b"%PDF-":
            return r.content, None
        ct = r.headers.get("content-type", "")
        reason = "not a PDF (" + (ct.split(";")[0] or "unknown") + ")"
        if "html" in ct and re.search(rb"(?i)sign in|accounts\.google\.com", r.content[:20000]):
            reason = "not public (sign-in required)"
    return None, reason


def to_paragraphs(text):
    """PDF text lines -> readable chunks for search snippets."""
    lines = [" ".join(l.split()) for l in text.replace("\r", "\n").split("\n")]
    out, buf = [], ""
    for l in lines:
        if not l:
            if buf:
                out.append(buf); buf = ""
            continue
        starts_item = bool(re.match(r"^([•\-–▪●◦o]|\d+[.)]|[a-z][.)])\s", l))
        if buf and (starts_item or len(buf) > 320 or re.search(r"[.:;?!]$", buf)):
            out.append(buf); buf = l
        else:
            buf = (buf + " " + l).strip()
    if buf:
        out.append(buf)
    return [p for p in out if len(p) > 2]


RENDER = True


def process_pdf(data, key):
    """Save the PDF, render page images, extract text. Returns doc dict and blocks."""
    import pypdfium2 as pdfium
    folder = DOCS / key
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "doc.pdf").write_bytes(data)
    pdf = pdfium.PdfDocument(data)
    pages, blocks = [], []
    for n in range(len(pdf)):
        page = pdf[n]
        w, h = page.get_size()
        scale = IMG_WIDTH / max(w, 1)
        if RENDER:
            img_path = folder / f"p{n + 1}.webp"
            img = page.render(scale=scale).to_pil()
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.save(img_path, "WEBP", quality=80, method=4)
            pages.append({"img": f"data/docs/{key}/p{n + 1}.webp", "w": img.width, "h": img.height})
        else:
            pages.append({"img": None, "w": round(w), "h": round(h)})
        try:
            text = page.get_textpage().get_text_range()
        except Exception:
            text = ""
        for para in to_paragraphs(text):
            blocks.append({"t": "p", "x": para, "pg": n + 1})
        page.close()
    pdf.close()
    return {"pdf": f"data/docs/{key}/doc.pdf", "pages": pages}, blocks


# ---------- main ----------

def capture(contact):
    c = Client(contact)
    report, pages, done = [], [], set()
    disclaimer = alert = None
    queue = [(SITE + p, cat, True, None) for p, cat in SECTIONS] + [(SITE + p, cat, False, None) for p, cat in EXTRA]
    roots = [p.lower() for p, _ in SECTIONS]

    while queue and len(pages) < MAX_PAGES:
        url, cat, follow, parent = queue.pop(0)
        path = norm_path(url)
        if path.lower() in done:
            continue
        done.add(path.lower())
        if not c.allowed(url):
            report.append(f"SKIP (robots or staff-only) {path}")
            continue
        r = c.get(url)
        if not r or r.status_code != 200 or "html" not in r.headers.get("content-type", ""):
            report.append(f"FAIL {path}: {getattr(r, 'status_code', 'no response')}")
            continue
        html = r.text
        soup = BeautifulSoup(html, "html.parser")
        if disclaimer is None or alert is None:
            d, a = site_extras(soup)
            disclaimer, alert = disclaimer or d, alert or a
        title = text_of(soup.title) if soup.title else ""
        title = re.sub(r"\s*[-|]\s*Antimicrobial Stewardship.*$", "", title, flags=re.I).strip()
        embeds = [] if path.lower() in roots or path == "/home" else find_embeds(html)
        blocks, links = blocks_of(content_root(soup), url)
        if not title:
            first = next((b["x"] for b in blocks if b["t"] == "h"), None)
            title = first or path.rsplit("/", 1)[-1].replace("-", " ").title()
        pages.append({"id": path.strip("/").replace("/", "~") or "home", "path": path, "url": SITE + path,
                      "category": cat, "parent": parent, "title": title, "blocks": blocks, "links": links,
                      "_embeds": embeds})
        print(f"[{len(pages)}] {path}" + (f"  ({len(embeds)} embedded file)" if embeds else ""), flush=True)
        if follow:
            for l in links:
                lp = norm_path(l["href"])
                if l["kind"] == "site" and lp.lower() not in done and any(lp.lower().startswith(s + "/") for s in roots):
                    queue.append((SITE + lp, cat, True, path))
        report.append(f"OK   {path} ({len(blocks)} blocks, {len(links)} links, {len(embeds)} embeds)")

    # Embedded PDFs
    print("\nDownloading and rendering embedded PDFs…", flush=True)
    cache = {}
    n_docs = 0
    for p in pages:
        embeds = p.pop("_embeds", [])
        docs = []
        for emb in embeds:
            key = hashlib.sha1(emb["id"].encode()).hexdigest()[:12]
            if key not in cache:
                existing = DOCS / key / "doc.pdf"
                data, why = (existing.read_bytes(), None) if existing.exists() else download_doc(c, emb)
                if data is None:
                    cache[key] = None
                    report.append(f"DOC SKIPPED ({why}) {p['path']}")
                    continue
                try:
                    cache[key] = process_pdf(data, key)
                except Exception as e:
                    cache[key] = None
                    report.append(f"DOC FAILED ({type(e).__name__}: {e}) {p['path']}")
                    continue
            if cache[key] is None:
                continue
            meta, blocks = cache[key]
            di = len(docs)
            docs.append({**meta, "drive": f"https://drive.google.com/file/d/{emb['id']}/view"})
            p["blocks"].extend({**b, "doc": di} for b in blocks)
            n_docs += 1
            report.append(f"DOC  {p['path']} ({len(meta['pages'])} pages)")
            print(f"  [{n_docs}] {p['title']} ({len(meta['pages'])} pages)", flush=True)
        # Drop the bare file-name line Google Sites shows above an embed
        if docs:
            p["blocks"] = [b for b in p["blocks"] if not (b["t"] == "p" and "pg" not in b and re.search(r"\.(pdf|docx?|pptx?)$", b["x"], re.I))]
            p["docs"] = docs

    home = next((p for p in pages if p["path"] == "/home"), None)
    if home:
        pages.remove(home)
    data = {"source": SITE, "captured_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "disclaimer": disclaimer, "alert": alert, "demo": False, "pages": pages}
    DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    REPORT.write_text("\n".join(report) + "\n", encoding="utf-8")
    sw = ROOT / "sw.js"   # new cache name so installed phones pick up new data
    if sw.exists():
        stamp = dt.datetime.now().strftime("%Y%m%d%H%M")
        sw.write_text(re.sub(r'const VERSION = "[^"]*";', f'const VERSION = "asp-guide-{stamp}";',
                             sw.read_text(encoding="utf-8")), encoding="utf-8")
    size = sum(f.stat().st_size for f in DOCS.rglob("*") if f.is_file()) // (1024 * 1024) if DOCS.exists() else 0
    with_docs = sum(1 for p in pages if p.get("docs"))
    print(f"\nDone: {len(pages)} pages, {with_docs} with PDFs ({size} MB of documents).")
    print(f"Details in {REPORT.name}")
    bundle_for_claude(pages)


def bundle_for_claude(pages, limit_mb=24):
    """Zip the PDFs (named by page) plus content.json into upload-sized parts."""
    import zipfile
    for old in ROOT.glob("for_claude_*.zip"):
        old.unlink()
    items = [("content.json", OUT)]
    for p in pages:
        for i, d in enumerate(p.get("docs", [])):
            src = ROOT / d["pdf"]
            if src.exists():
                items.append((f"pdfs/{p['id']}{'' if i == 0 else '-' + str(i + 1)}.pdf", src))
    part, size, zf, made = 0, 0, None, []
    for name, src in items:
        n = src.stat().st_size
        if zf is None or (size + n > limit_mb * 1024 * 1024 and size > 0):
            if zf:
                zf.close()
            part += 1
            path = ROOT / f"for_claude_{part}.zip"
            zf = zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED)
            made.append(path)
            size = 0
        zf.write(src, name)
        size += n
    if zf:
        zf.close()
    print(f"\nFor Claude: {len(made)} file(s) to upload: " + ", ".join(m.name for m in made))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--contact", required=True, help="an email the site owner can reach you at")
    ap.add_argument("--pdfs", action="store_true", help=argparse.SUPPRESS)  # always on now
    ap.add_argument("--no-images", action="store_true", help="skip rendering page images (faster)")
    a = ap.parse_args()
    if "@" not in a.contact:
        sys.exit("--contact must be an email address")
    try:
        import pypdfium2  # noqa: F401
    except ImportError:
        sys.exit("Missing package. Run:  py -m pip install pypdfium2 pillow")
    RENDER = not a.no_images
    capture(a.contact)
