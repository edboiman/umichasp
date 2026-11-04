# ASP Guide

A phone app for the public guidelines of the
[Michigan Medicine Antimicrobial Stewardship Program](https://antimicrobialstewardship.med.umich.edu/home).
Browse by condition, look up any antibiotic, and search every guideline. Works offline once installed.

**Unofficial personal copy, captured November 2026. The source site is authoritative.**

## What's inside

- 124 guidelines converted from the program's PDFs into native text: headings, bullets,
  regimen tables (shown as cards on phones), wide dosing grids, footnotes, references, revision history.
- Flowcharts (for example, the bloodstream infection pathways) shown as step-by-step pathways,
  with the original chart one tap away. A few charts that can't be expressed as text (for example,
  the BMT infection timeline or the β-lactam cross-reactivity grid) are shown as images, with their text searchable.
- Every number and drug name in each PDF was checked automatically against the app's text.
  Where a line could not be placed in the layout, it appears verbatim as "More text from page N".
- 45 conditions in 12 body systems, adult/pediatric filter, 99 antibiotics with restricted-drug flags.

## Put it on GitHub (Windows, no command line)

1. Install **GitHub Desktop** (desktop.github.com) and sign in.
2. File → Clone repository → `edboiman/umichasp` → Clone.
3. In File Explorer, open the cloned folder (usually Documents\GitHub\umichasp).
   **Delete everything in it except the hidden `.git` folder**, then copy in everything from this folder.
4. Back in GitHub Desktop: type a summary such as "ASP Guide v1", click **Commit to main**, then **Push origin**.
5. On github.com, open the repo → **Settings → Pages** → Source: *Deploy from a branch* →
   Branch: `main`, folder `/ (root)` → Save. After a minute or two it's live at
   https://edboiman.github.io/umichasp/
6. On your phone, open that link:
   - iPhone: Safari → Share → **Add to Home Screen**
   - Android: Chrome → ⋮ → **Install app**

## Privacy and sharing

A GitHub Pages site can be opened by anyone with the link (search engines are asked not to index it).
It reproduces Michigan Medicine's guideline content, so check with the ASP team before sharing it
beyond yourself, or make the repository private if your GitHub plan supports private Pages.

## Updating later

Guidance changes. To refresh: run `py tools\capture.py --contact you@example.org --no-images`
(see tools/capture.py), then convert the PDFs with the scripts in `tools/pdf/` (or send the
`for_claude_*.zip` files to Claude to rebuild). Commit and push the new `data/` folder.

## Files

```
index.html, app.js, styles.css   the app (no build step)
manifest.webmanifest, sw.js      home-screen install and offline cache
icons/                           app icons
data/content.json                all guideline content
data/fig/                        chart and flowchart images
data/drugs.json                  antibiotic names, classes, aliases
data/taxonomy.json               conditions, body systems, resource groups
tools/                           capture and PDF conversion scripts
```

## Mobile interface redesign

The interface has been redesigned across every route. Clinical source files in `data/`, chart images, and capture/conversion tools are unchanged.

- Consistent mobile typography, spacing, navigation, touch targets, and light/dark themes. Appearance is available under About.
- Semantic regimen tables switch to labelled rows on narrow screens; complex matrices retain their columns inside a scrollable table.
- Source paragraphs, footnotes, warnings, references, revision history, and expandable chart text remain available.
- Conditions → By organism → Enterococcus → Urinary tract infection or Endocarditis → complete existing guideline.
- The adult GAS page uses a presentation adapter that renders the original text runs, doses, qualifiers, and sequence.
- Existing search, population filters, saved items, recents, text-size settings, source links, install, and offline chart download remain available.

`audit/` contains the full UI inventory, exact source-content comparison, per-page review coverage, and browser QA results. The supplied app is buildless: publish the files in this folder directly to GitHub Pages; there is no package installation or build step.
