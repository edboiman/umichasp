"""Organism dictionary for the app's organism index (data/organisms.json).
Categories follow standard Gram-stain / morphology classification, the same top-level groups the
bloodstream-infection guideline uses (Gram positive / Gram negative / Fungus), refined by morphology.
Patterns are JavaScript-compatible regular expressions (no variable-length lookbehind).
Only organisms that actually appear in the captured guidelines are written to the app."""
import json, re, sys, collections

CATS = [
    ("gpc", "Gram-positive cocci"),
    ("gpb", "Gram-positive bacilli"),
    ("gnc", "Gram-negative cocci"),
    ("gnb", "Gram-negative bacilli"),
    ("ana", "Anaerobes"),
    ("atyp", "Atypical & spirochetes"),
    ("myco", "Mycobacteria"),
    ("res", "Resistant organisms"),
    ("yeast", "Yeasts & dimorphic fungi"),
    ("mold", "Molds"),
    ("virus", "Viruses"),
    ("para", "Parasites"),
]
# id, name, category, also-known-as (display), regex (case-insensitive unless cs=True), case-sensitive extra regex
O = [
    ("staph-aureus", "Staphylococcus aureus", "gpc", ["S. aureus", "MSSA", "MRSA"], r"staphylococcus aureus|staph\.? aureus|\bS\. ?aureus\b", r"\bMRSA\b|\bMSSA\b"),
    ("cons", "Coagulase-negative staphylococci", "gpc", ["CoNS", "S. epidermidis"], r"coagulase[- ]negative|staphylococcus epiderm|\bS\. ?epidermidis\b", r"\bCoNS\b"),
    ("s-lugdunensis", "Staphylococcus lugdunensis", "gpc", ["S. lugdunensis"], r"lugdunensis|lugunensis", None),
    ("strep-pneumo", "Streptococcus pneumoniae", "gpc", ["Pneumococcus"], r"streptococcus pneumoniae|\bS\. ?pneumoniae\b|pneumococc", None),
    ("gas", "Group A Streptococcus", "gpc", ["S. pyogenes", "GAS"], r"group a strep|group a β|group a beta|streptococcus pyogenes|\bS\. ?pyogenes\b|streptococcal pharyngitis", r"\bGAS\b"),
    ("gbs", "Group B Streptococcus", "gpc", ["S. agalactiae", "GBS"], r"group b strep|streptococcus agalactiae|\bS\. ?agalactiae\b", r"\bGBS\b"),
    ("viridans", "Viridans group streptococci", "gpc", ["S. mitis", "S. anginosus", "S. gallolyticus"], r"viridans|streptococcus (mitis|oralis|anginosus|gallolyticus|bovis|sanguinis|salivarius|gordonii)|\bS\. ?(mitis|anginosus|gallolyticus|bovis)\b", None),
    ("enterococcus", "Enterococcus", "gpc", ["E. faecalis", "E. faecium", "VRE"], r"enterococc|\bE\. ?(faecalis|faecium|casseliflavus|gallinarum|gallinarium)\b", r"\bVRE\b"),
    ("listeria", "Listeria monocytogenes", "gpb", ["Listeria"], r"listeria", None),
    ("corynebacterium", "Corynebacterium", "gpb", ["C. striatum"], r"corynebacter", None),
    ("bacillus", "Bacillus", "gpb", [], r"\bbacillus (spp|cereus|anthracis)|\bbacillus\b(?! calmette)", None),
    ("nocardia", "Nocardia", "gpb", [], r"nocardia", None),
    ("n-meningitidis", "Neisseria meningitidis", "gnc", ["Meningococcus"], r"neisseria meningitidis|\bN\. ?meningitidis\b|meningococc", None),
    ("n-gonorrhoeae", "Neisseria gonorrhoeae", "gnc", ["Gonorrhea"], r"gonorrh|neisseria gonorrhoeae|\bN\. ?gonorrhoeae\b", None),
    ("moraxella", "Moraxella catarrhalis", "gnc", ["Moraxella"], r"moraxella", None),
    ("e-coli", "Escherichia coli", "gnb", ["E. coli"], r"escherichia coli|\bE\. ?coli\b", None),
    ("klebsiella", "Klebsiella", "gnb", ["K. pneumoniae", "K. oxytoca"], r"klebsiella|\bK\. ?(pneumoniae|oxytoca|aerogenes)\b", None),
    ("enterobacter", "Enterobacter", "gnb", ["E. cloacae"], r"enterobacter(?!al)|\bE\. ?cloacae\b", None),
    ("enterobacterales", "Enterobacterales", "gnb", ["Enterobacteriaceae"], r"enterobacterales|enterobacteriaceae", None),
    ("proteus", "Proteus", "gnb", [], r"\bproteus\b", None),
    ("serratia", "Serratia", "gnb", [], r"serratia", None),
    ("citrobacter", "Citrobacter", "gnb", [], r"citrobacter", None),
    ("morganella", "Morganella", "gnb", [], r"morganella", None),
    ("salmonella", "Salmonella", "gnb", ["Typhi", "Non-typhoidal Salmonella"], r"salmonella", None),
    ("shigella", "Shigella", "gnb", [], r"shigella", None),
    ("pseudomonas", "Pseudomonas aeruginosa", "gnb", ["Pseudomonas"], r"pseudomonas|\bP\. ?aeruginosa\b|psudomonas|anti-?pseudomonal", None),
    ("acinetobacter", "Acinetobacter", "gnb", ["A. baumannii"], r"acinetobacter|\bA\. ?baumannii\b", None),
    ("stenotrophomonas", "Stenotrophomonas maltophilia", "gnb", ["Stenotrophomonas"], r"stenotrophomonas", None),
    ("burkholderia", "Burkholderia", "gnb", ["B. cepacia"], r"burkholderia", None),
    ("achromobacter", "Achromobacter", "gnb", [], r"achromobacter", None),
    ("h-influenzae", "Haemophilus influenzae", "gnb", ["H. influenzae"], r"haemophilus|\bH\. ?influenzae\b|hemophilus", None),
    ("hacek", "HACEK organisms", "gnb", ["Aggregatibacter", "Cardiobacterium", "Eikenella", "Kingella"], r"\bHACEK\b|aggregatibacter|cardiobacterium|eikenella|kingella", None),
    ("pasteurella", "Pasteurella", "gnb", ["P. multocida"], r"pasteurella", None),
    ("capnocytophaga", "Capnocytophaga", "gnb", [], r"capnocytophaga", None),
    ("campylobacter", "Campylobacter", "gnb", [], r"campylobacter", None),
    ("yersinia", "Yersinia", "gnb", [], r"yersinia", None),
    ("vibrio", "Vibrio", "gnb", [], r"\bvibrio", None),
    ("aeromonas", "Aeromonas & Plesiomonas", "gnb", ["Aeromonas", "Plesiomonas"], r"aeromonas|plesiomonas", None),
    ("h-pylori", "Helicobacter pylori", "gnb", ["H. pylori"], r"helicobacter|\bH\. ?pylori\b", None),
    ("bordetella", "Bordetella pertussis", "gnb", ["Pertussis"], r"bordetella|pertussis", None),
    ("legionella", "Legionella", "atyp", [], r"legionell", None),
    ("mycoplasma", "Mycoplasma", "atyp", ["M. pneumoniae"], r"mycoplasma", None),
    ("chlamydia", "Chlamydia & Chlamydophila", "atyp", ["C. trachomatis", "C. pneumoniae"], r"chlamydi", None),
    ("borrelia", "Borrelia burgdorferi", "atyp", ["Lyme disease"], r"borrelia|\blyme\b", None),
    ("treponema", "Treponema pallidum", "atyp", ["Syphilis"], r"treponema|syphilis", None),
    ("bartonella", "Bartonella", "atyp", [], r"bartonella", None),
    ("c-diff", "Clostridioides difficile", "ana", ["C. difficile", "C. diff"], r"clostridi(oi)?des difficile|\bC\.? ?diff(icile)?\b|clostridium difficile", r"\bCDI\b|\bCDAD\b"),
    ("bacteroides", "Bacteroides", "ana", ["B. fragilis"], r"bacteroides|\bB\. ?fragilis\b", None),
    ("clostridium", "Clostridium (other species)", "ana", ["C. perfringens", "C. septicum"], r"clostridium (perfringens|septicum|tertium|spp)|clostridia spp", None),
    ("actinomyces", "Actinomyces", "ana", [], r"actinomyces", None),
    ("cutibacterium", "Cutibacterium (Propionibacterium)", "ana", ["C. acnes"], r"cutibacterium|propionibacterium", None),
    ("anaerobes", "Anaerobes (general)", "ana", ["Oral anaerobes"], r"\banaerob", None),
    ("mtb", "Mycobacterium tuberculosis", "myco", ["Tuberculosis", "TB"], r"tuberculosis|mycobacterium tuberculosis", r"\bTB\b"),
    ("ntm", "Nontuberculous mycobacteria", "myco", ["NTM", "MAC", "M. abscessus"], r"nontuberculous|non-tuberculous|mycobacterium avium|\bM\. ?(abscessus|avium)\b|mycobacteri(a|al)(?! tuberculosis)", r"\bNTM\b|\bMAC\b"),
    ("mrsa", "MRSA", "res", ["Methicillin-resistant S. aureus"], r"methicillin[- ]resistant", r"\bMRSA\b"),
    ("vre", "VRE", "res", ["Vancomycin-resistant Enterococcus"], r"vancomycin[- ]resistant enterococ", r"\bVRE\b"),
    ("esbl", "ESBL-producing organisms", "res", ["ESBL"], r"extended[- ]spectrum beta|extended[- ]spectrum β", r"\bESBL"),
    ("cre", "Carbapenem-resistant organisms", "res", ["CRE", "KPC", "OXA-48", "Carbapenemase"], r"carbapenem[- ]resistant|carbapenemase", r"\bCRE\b|\bKPC\b|\bOXA-?48\b|\bNDM\b|\bCRAB\b"),
    ("ampc", "AmpC-producing organisms", "res", ["AmpC"], r"\bampc\b", None),
    ("mdr", "Multidrug-resistant organisms", "res", ["MDRO", "MDR"], r"multi-?drug[- ]resistant|multidrug resistant", r"\bMDRO?s?\b"),
    ("candida", "Candida", "yeast", ["C. albicans", "C. glabrata", "C. parapsilosis"], r"candida|candidemia|candidiasis|candiduria", None),
    ("candida-auris", "Candida auris", "yeast", ["C. auris"], r"candida auris|\bC\. ?auris\b", None),
    ("cryptococcus", "Cryptococcus", "yeast", [], r"cryptococc", None),
    ("pneumocystis", "Pneumocystis jirovecii", "yeast", ["PJP", "PCP"], r"pneumocystis", r"\bPJP\b|\bPCP(?=/PJP| prophylaxis| pneumonia)"),
    ("histoplasma", "Histoplasma", "yeast", ["Histoplasmosis"], r"histoplasm", None),
    ("blastomyces", "Blastomyces", "yeast", ["Blastomycosis"], r"blastomyc", None),
    ("coccidioides", "Coccidioides", "yeast", ["Coccidioidomycosis"], r"coccidioid", None),
    ("aspergillus", "Aspergillus", "mold", ["Aspergillosis"], r"aspergill", None),
    ("mucorales", "Mucorales", "mold", ["Mucor", "Rhizopus", "Mucormycosis"], r"mucor|rhizopus", None),
    ("fusarium", "Fusarium & Scedosporium", "mold", ["Fusarium", "Scedosporium"], r"fusarium|scedospor|lomentospor", None),
    ("influenza", "Influenza virus", "virus", ["Influenza"], r"\binfluenza\b(?!e)", None),
    ("sars-cov-2", "SARS-CoV-2", "virus", ["COVID-19"], r"covid|sars-cov-2|coronavirus", None),
    ("rsv", "Respiratory syncytial virus", "virus", ["RSV"], r"respiratory syncytial", r"\bRSV\b"),
    ("cmv", "Cytomegalovirus", "virus", ["CMV"], r"cytomegalovirus", r"\bCMV\b"),
    ("hsv", "Herpes simplex virus", "virus", ["HSV"], r"herpes simplex", r"\bHSV\b"),
    ("vzv", "Varicella-zoster virus", "virus", ["VZV", "Shingles"], r"varicella|zoster|shingles", r"\bVZV\b"),
    ("ebv", "Epstein-Barr virus", "virus", ["EBV"], r"epstein[- ]barr", r"\bEBV\b"),
    ("hhv6", "HHV-6 and HHV-7", "virus", ["HHV-6", "HHV-7"], r"\bHHV-?[67]\b|human herpesvirus [67]|human herpes virus [67]", None),
    ("bk", "BK polyomavirus", "virus", ["BK virus"], r"\bBK (virus|viremia|viruria|polyoma)|polyomavirus", None),
    ("adenovirus", "Adenovirus", "virus", [], r"adenovir", None),
    ("enterovirus", "Enterovirus & parechovirus", "virus", ["Enterovirus"], r"enterovir|parechovir", None),
    ("hiv", "HIV", "virus", ["Human immunodeficiency virus"], r"human immunodeficiency virus", r"\bHIV\b"),
    ("hbv", "Hepatitis B virus", "virus", ["HBV"], r"hepatitis b\b", r"\bHBV\b|\bHBsAg\b"),
    ("hcv", "Hepatitis C virus", "virus", ["HCV"], r"hepatitis c\b", r"\bHCV\b"),
    ("measles", "Measles virus", "virus", ["Measles"], r"measles|rubeola", None),
    ("mpox", "Mpox virus", "virus", ["Mpox", "Monkeypox"], r"mpox|monkeypox|orthopox", None),
    ("parvovirus", "Parvovirus B19", "virus", [], r"parvovirus|parvo b-?19", None),
    ("norovirus", "Norovirus & rotavirus", "virus", ["Norovirus", "Rotavirus"], r"norovirus|rotavirus", None),
    ("plasmodium", "Plasmodium (malaria)", "para", ["Malaria", "P. falciparum"], r"plasmodium|malaria|\bP\. ?(falciparum|vivax|ovale|malariae|knowlesi)\b", None),
    ("toxoplasma", "Toxoplasma gondii", "para", ["Toxoplasmosis"], r"toxoplasm", None),
    ("giardia", "Giardia", "para", [], r"giardia", None),
    ("cryptosporidium", "Cryptosporidium", "para", [], r"cryptosporid", None),
    ("cyclospora", "Cyclospora", "para", [], r"cyclospora|cyclosporiasis", None),
    ("entamoeba", "Entamoeba histolytica", "para", [], r"entamoeba", None),
    ("strongyloides", "Strongyloides", "para", [], r"strongyloid", None),
]

def compile_(o):
    _, _, _, _, ci, cs = o
    rs = [re.compile(ci, re.I)] if ci else []
    if cs: rs.append(re.compile(cs))
    return rs

if __name__ == "__main__":
    sys.path.insert(0, "/home/claude/pdfwork")
    from textdiff import text
    d = json.load(open(sys.argv[1], encoding="utf-8"))
    out, report = [], []
    for o in O:
        rs = compile_(o)
        hits = [p["id"] for p in d["pages"] if p.get("guide") and any(r.search(text(p["guide"])) for r in rs)]
        report.append((len(hits), o[0], o[1]))
        if hits:
            out.append({"id": o[0], "name": o[1], "cat": o[2], "aka": o[3], "re": o[4], "cs": o[5]})
    for n, i, name in sorted(report, reverse=True): print(f"{n:4d} {i:18s} {name}")
    json.dump({"categories": [{"id": a, "name": b} for a, b in CATS], "organisms": out}, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("written:", len(out), "organisms")
