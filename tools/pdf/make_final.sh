set -e
cd /home/claude/pdfwork
python3 -I - <<'PY'
import json
A=json.load(open("/home/claude/v2/umichasp-app/data/content.json",encoding="utf-8")); B=json.load(open("/home/claude/newbuild/data/content.json",encoding="utf-8"))
ch=json.load(open("/home/claude/pdfwork/choice.json")); gb={p["id"]:p for p in B["pages"]}
D=dict(A, pages=[gb[p["id"]] if p.get("guide") and ch.get(p["id"])=="new" else p for p in A["pages"]])
json.dump(D, open("/home/claude/pdfwork/merged_content.json","w",encoding="utf-8"), ensure_ascii=False, separators=(",",":"))
PY
python3 reflow.py merged_content.json
python3 postfix.py merged_content.json
python3 layoutfix.py merged_content.json
python3 pocketcard.py merged_content.json
