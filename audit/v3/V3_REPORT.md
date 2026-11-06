# ASP Guide v3 — review report (4 November 2026)

Ground rule for this release: **the PDFs are the authority. No clinical information was added or removed.**
Every text change restores what a PDF says. Each one was checked automatically against that PDF's own text layer, and the
cefazolin/oxacillin passages were also read by eye. Log files in this folder record every correction.

## 1. What was reviewed, and how

| Check | Scope | Result |
|---|---|---|
| Every app word appears in its own PDF | 124 guidelines | 0 words missing |
| Items missing their first letter (bullet-stripping defect) | 124 guidelines | 0 remaining (was 55 in v2) |
| Every number and drug name in a PDF also appears in the app | 124 guidelines | 108 pass outright. The 16 with count differences were inspected: they come from column headers repeated on every PDF page (shown once per table), page numbers, chart axis labels, and footnote superscripts printed against a number. The 3 drug-name differences are a repeated note (section 7, item 2), a repeated table header (Intra-abdominal – Adult) and a chart image (Get Smart). |
| PDF words with no counterpart in the app (multiset, includes headers/footers) | 224,090 PDF word tokens | v2 11,704 → v3 4,139 (`PDF_COVERAGE.tsv`) |
| Word-level diff, v2 → v3 | 118 guidelines changed | `CONTENT_DIFF_v2_to_v3.md` |
| Read by eye against the PDF page image | *S. aureus* pocket card (both pages); NVE and PVE adult tables; BSI adult p4; aminoglycoside adult p1; BSI pediatric p1; bone & joint adult p1/p4; candidemia; pediatric surgical prophylaxis p4 | Findings below |

What was **not** done: no one read all 124 PDFs line by line against the app. The automated checks compare words, numbers and
drug names; they cannot judge whether a sentence sits in the right table cell. Grouping problems were found by targeted
searches (merged rows, dangling headers, interleaved boxes) and fixed where found. Others may remain (section 7).

## 2. Cefazolin / oxacillin in MSSA endocarditis

**What the PDFs say**

| Source | Page | Wording (verbatim) |
|---|---|---|
| Native Valve Endocarditis Treatment (adult) | 2, *Staphylococci (MSSA)* row | Preferred: **Cefazolin** 2 g IV q8h¹ **OR** **Oxacillin** 2 g IV q4h². Comment: "Cefazolin and daptomycin should be used with caution in MSSA-associated CNS. Oxacillin is the preferred option" |
| Prosthetic Valve Endocarditis Treatment (adult) | 2, *Staphylococci (MSSA or MSSE)* row | Same regimens. Comment: "Cefazolin and daptomycin should be used with caution in MSSA-associated CNS infection. Oxacillin is the preferred option for patients with CNS infection." |
| *S. aureus* bacteremia pocket card | 1, item 2 | "Oxacillin for endocarditis or meningitis" / "Cefazolin for patient without endocarditis or meningitis" |
| Blood Stream Infections – Adult (pathway) | 4 | Organism ID: "Endocarditis or CNS infection: Oxacillin / Other infections: Cefazolin". Susceptibilities: "Non-CNS/endocarditis: Cefazolin or Oxacillin / CNS infection or endocarditis: Oxacillin" |
| Bone & Joint – Adult | 4 | "Cefazolin may replace oxacillin if no epidural extension of infection is present" |
| Blood Stream Infections – Pediatric (pathway) | 4 | "Endocarditis or CNS infection: Nafcillin" |

**Conclusion.** For MSSA endocarditis, the two endocarditis treatment guidelines list cefazolin and oxacillin as **equal
preferred options**. They limit the oxacillin preference to CNS infection, which matches your reading. But the
pocket card and the adult bacteremia pathway themselves say **oxacillin for endocarditis**, so the sources disagree. The app now shows each source's
wording exactly, in its own place. It does not pick between them. **Please raise this discrepancy with the ASP team.**

**What was wrong in v2, and what changed**

| Where | v2 problem | v3 |
|---|---|---|
| NVE adult p2 table | The 3 enterococcal rows and the MSSA row were merged into **one row**, so the MSSA regimen and its CNS comment were no longer tied to MSSA. The headers were also garbled ("D", "f"). | Rows rebuilt one per pathogen. The MSSA comment sits in the MSSA row. Columns that span every row (Empiric Therapy, Pathogens/Comments on p1) appear once as "Applies to every row of this table". |
| PVE adult p1–2 table | The CNS comment was split across lines ("Oxacillin is the / preferred option for patients with CNS infection"). The header was garbled ("D T", "uratio of herap"), and the word "Therapy" belonging to "Duration of Therapy" sat in the wrong column. | One sentence again. The header reads "Duration of Therapy". |
| Pocket card p1 | "Oxacillin for endocarditis or meningitis" was a free-standing paragraph, detached from "Timely change to β-lactam therapy if MSSA". The page-2 text had lost its "ti" ligatures ("o en", "combina on"). | Step 2 now holds both sub-lines as equals, as in the PDF. The ligatures were restored from the page image. |
| BSI adult p4 pathway | Each box's lines ran together into one string. | Each source line is kept separate ("Endocarditis or CNS infection: Oxacillin" / "Other infections: Cefazolin"). |
| Antibiotic pages and search previews | Previews were cut at a fixed length and could end mid-qualifier ("…without endocarditis or meningi…"). | Previews now extend to the end of the sentence, item or cell. Paragraphs inside one cell are separated with " / ". |

## 3. *S. aureus* pocket card (redesigned, nothing removed)

Page 1 is now 8 numbered steps. Step 2 holds the oxacillin and cefazolin sub-lines, step 3 the "AUC of 350-530" sub-line, and step 7 links
to the MRSA table on the reverse. Step 8 lists the four durations. The definition of uncomplicated bacteremia is a highlighted note.
The source disclaimer (p1) is kept verbatim, along with the approval line ("Antimicrobial Subcommittee Approval: 1/2021 · P&T Approval:
2/2021 · Last Revised: 05/2026"). Page 2 has the MRSA table (Scenario / Recommendation / Comments, with superscripts 1–4) and its four footnotes.
The page links to the original PDF, and the image of page 2 opens full size. Every word was checked against both PDF pages.
v3 initially dropped the page-1 disclaimer; it was found by the coverage check and restored.

## 4. Flowcharts tab

* It replaces Saved in the bottom bar. Saved is now the bookmark icon at the top right of every screen, so all five sections stay reachable.
* Index: 28 chart images and pathways plus 7 text-only "Algorithm" guidelines, grouped by condition or resource, with
  All/Adult/Pediatric and a text filter. Each entry shows the **guideline title and PDF page**, the chart's own first line of text,
  whether a step-by-step text version exists, and its offline status ("Saved offline" / "Online only").
  "Save all charts for offline" downloads every chart image. It was tested: 28 → 0 online-only.
* Chart screen: breadcrumb back to the index, "Open in guideline" (jumps to the passage), full-size image (pinch to zoom),
  "Original PDF" (opens at that page), the full pathway text, the original image shown open, other charts from the same guideline,
  and a back link.
* Guideline pages and condition pages link to their charts.
* **Labels.** No chart names are invented. Entries are labelled with the guideline title, the page number and the chart's first text line,
  which is not always a title: "Panel" (meningitis film array p2), "Laxative use" (CDI p1), "1990" (Get Smart p15). The 7 "Algorithm page"
  entries are guidelines whose own title contains *algorithm*, *workflow* or *pathway* and that have no chart image. The 6 Get Smart and
  Snort/Sniffle/Sneeze entries are graphs or posters from patient-education slides, not clinical flowcharts. They are listed because they
  are figures in the source.

## 5. Other corrections (all logged; PDF page in brackets)

* **Interleaved side-by-side boxes** (`layout_fix_log.json`). Text was re-read box by box from the PDF, and a check confirmed the words are identical before and after.
  * Aminoglycoside Dosing – Adult [p1]. v2 mixed lines from two boxes, e.g. "started on traditional subsequent doses based on renal function" and "Tobramycin is preferred. selecting an alternative agent". Now each of the 3 questions is paired with its answer.
  * Blood Stream Infections – Pediatric [p1]. The 3 "How to use this guideline" boxes were interleaved.
* **Misplaced header markers** (`marker_fix_log.json`). NVE and PVE adult [p1–3]: "Empiric § Therapy" → "Empiric Therapy§". PVE [p1–2]: "Duration of Therapy".
* **Contents grids shown as one merged header** now keep the source's rows: Bone & Joint – Adult [p1], Infectious Diarrhea – Adult [p1], UTI – Adult [p1], CAR-T Prophylaxis [p1].
* **Rotated labels read backwards or scrambled** (`rotated_label_log.json`):
  * Patients ≤50 kg (pre-op/intra-op) [p1–2]: "REFER TO >50 kg DOSING RECOMMENDATIONS", "USE MG/KG DOSING"
  * Adult Surgical Prophylaxis [p42–43]: "USE MG/KG DOSING"
  * SSTI – Pediatrics [p4–6]: "of deep tissue"
* **List numbers and letters** ("1.", "a.", "ii.") that v2 had stripped: 795 restored (`enum_log.json`). Each is restored only when exactly one marker
  in the PDF precedes that text. This matters for numbered footnote lists such as Antimicrobial Dosing – Adult, where the table superscripts refer to them.
* **Dropped letters** (`first_letter_log.json`; root cause fixed in the converter). Examples: "or if they can be used" (URO uUTI workflow [p3]), "one time aminoglycoside dose", "Bismuth",
  "Gentamicin", "Ongoing", "Cefuroxime", "Cytomegalovirus", "Panel/Patient/Specimen" (meningitis film array).
* **Split words** (`word_fix_log.json`): "If patient previously received" (Vancomycin – Pediatrics [p1]), "Aeromonas" (Infectious Diarrhea – Pediatrics [p2–4]),
  "medical emergency" (NVE [p4]), "streptococci"/"Streptococcus" (NVE), "guidelines", "Expectations", "include".
* **Mid-sentence line breaks** inside table cells were rejoined: 604 joins (`join_log.json`).
* **Approval lines** ("Last revised · Subcommittee · P&T") restored from the PDF footers for 108 guidelines.
* **Source disclaimer** ("The recommendations in this guide are meant to serve as treatment guidelines…"): v2 had dropped it as page furniture in 54 guidelines. It is restored verbatim at the end of each, from the page where it is printed (`disclaimer_log.json`), and shown in smaller type.
* **Superscript commas** in table headers had been shown as apostrophes ("Endophthalmitis)³'⁴" in Candidemia – Adult [p1]). They are commas again.
* **Chart pages** where the text layer was garbled (rotated or overlapping text): 15 pages now carry the PDF's verbatim lines under "Text in this chart".

## 6. Design and interface

* Every screen was inspected at 320, 375, 390, 430 and 768 px and at 1440 px desktop, in light and dark mode. No page scrolls sideways at any width. Wide clinical
  matrices scroll inside their own frame.
* Touch targets: the bottom tabs, chips, buttons, filter segments and figure links are all ≥ 44 × 44 px. The audit flagged 40 px chart chips on
  guideline pages; they are now fixed.
* New components are themed for light and dark mode: numbered steps, step durations, clinical note, footnotes, "applies to every row" notes, chart badges and the offline panel.
* Numbered and lettered list items show the source's own number instead of a bullet.
* Interface wording now matches the new Flowcharts tab and the Saved button.

## 7. Known limitations and items for the ASP team

1. **Source discrepancy:** oxacillin vs cefazolin for MSSA endocarditis (section 2).
2. **NVE adult:** the "Empiric Therapy" note (vancomycin + ceftriaxone; cefepime for burn patients and people who inject drugs) is printed on each of the
   PDF's three table pages. Pages 2 and 3 are one continuous table in the app, so the note appears twice rather than three times. Every row is still covered.
3. **Skin & Soft Tissue – Adult** and **Blood Stream Infections – Pediatric** keep the v2 conversion. The newer converter lost text on these two,
   and some of their table rows remain grouped as in v2. Their original charts and PDFs are linked.
4. **Pediatric Surgical Prophylaxis p4:** a section heading ("GASTROINTESTINAL PROCEDURES") is shown as the table header.
5. **β-lactam cross-reactivity grid** (BLAES p5) is shown as an image with its text listed underneath. The grid itself was not converted to a table.
6. **Coverage numbers:** three guidelines show a few more "absent" PDF words than v2: NVE, Cryptococcus and Pediatric Procalcitonin. The difference is the
   table labels "References / Citation / Revision history / Date", which the app now renders as its own section headings, plus item 2 above.
7. **"Words not in PDF"** in `PDF_COVERAGE.tsv` is a token count. The non-zero rows are chart text that appears both as the pathway and as
   "Text in this chart", plus approval dates written differently in the footer. A separate word-level check finds 0 app words absent from their PDF.
8. **Head & Neck Penicillin Allergy [p1]:** the citation superscripts "7,8" after "beta-lactams." are shown as ordinary text, with the "8" running into the next (bold) sentence. The wording is intact.
9. Not tested: installing on a physical phone, and screen readers.

## 8. Tests run

* `node --check app.js`, `node --check sw.js`
* `node tools/qa/verify-static.cjs`: service-worker install, activate, online and offline responses, every chart asset path, and every guideline's PDF (124). Passed.
* `tools/qa/browser-audit.html`, updated for the Flowcharts routes. It covers every route at 6 widths × light/dark, the internal-link inventory, touch targets,
  table row and cell counts against the content, every expandable opened, search, filters, bookmarks, text sizes, the appearance control,
  the five tabs and the header Saved button. Final run: **0 failures** across 6,244 route renders, 158,815 links, 9,600 table checks,
  5,172 expandables and 13 interaction checks (`BROWSER_QA_RESULTS_v3.json`).
* Route smoke test at 320 px: 337 routes, covering all pages, conditions, organisms, antibiotics, charts and resources. No JS errors, no missing or empty pages, no overflow.
* Interaction tests at 375 px: 30 checks, all passing. They include a real offline test with the server stopped: the app shell reloads, guideline text loads and cached chart images show.
* Content checks: `tools/pdf/appwords.py`, `firstletter.py`, `final_check.py`, `changelog.py`.


## v4 addendum (organisms, flowcharts, search)

* **BCID2 organism panels** (Blood Stream Infections – Adult p1, Pediatric p2). The converter had read this three-column table as a
  flowchart, which produced the uncategorised list of pathogens. It is rebuilt from the PDF as a table with the source's
  Gram positiveᵃ / Gram negativeᵈ / Fungus headers and footnotes a–e. A check confirms no words were added. The words dropped
  were duplicates, and the adult page's approval line and revision history, which moved to the guideline header.
  Two glyphs missing from the text layer were restored from the page image: "Biofire™" and "β-hemolytic".
* **Organism groups** are standard Gram-stain and morphology classes. They are a browsing aid, not guideline text, and they match the
  bloodstream guideline's own top-level split. Organisms are found by name, abbreviation and common synonym, and the
  patterns are in `data/organisms.json`. Ambiguous abbreviations are matched only in context: "PCP" only next to PJP or
  prophylaxis, "GAS" and "TB" only in capitals.
* **Summary cards** contain counts and links only, never a written clinical summary. "Antibiotics named with it" counts
  passages that name both. It shows co-occurrence, not a recommendation.
* **Chart groups:** treatment pathways (BSI adult p2–8, CDI treatment p1, C. difficile pediatric), diagnostic algorithms
  (blood culture algorithm, CDI diagnostics, CDI test interpretation, meningitis panel), reference charts and tables, algorithm
  guidelines (text) and patient-education graphics. The grouping was assigned by looking at each chart.
* Tests: interaction suite (39 checks), route smoke test (2,332 routes at 320 px), static checks and the full browser audit.
  Final browser audit: 0 failures across 7,630 route renders, 264,156 links, 9,648 table checks, 6,468 expandables and 14 interaction checks (`BROWSER_QA_RESULTS_v4.json`).
