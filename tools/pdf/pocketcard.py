"""Hand-structured S. aureus pocket card, transcribed from the source PDF
(guidelines~adult~s-aureus-pocketcard.pdf, pages 1-2). Wording, order and emphasis follow the PDF exactly;
the source disclaimer (page 1) is kept verbatim; the only text repair is the 'ti' ligature that the PDF's text layer drops on page 2 (verified against the page image)."""
import json, sys

B = lambda t: [t, "b"]
I = lambda t: [t, "i"]
S = lambda t: [t, "s"]
T = lambda t: [t]

guide = {
    "title": "Management of Staphylococcus aureus Bacteremia: A Guide for the ID Consult Service",
    "title_r": [T("Management of "), I("Staphylococcus aureus"), T(" Bacteremia: A Guide for the ID Consult Service")],
    "revised": "05/2026",
    "approvals": "Antimicrobial Subcommittee Approval: 1/2021 · P&T Approval: 2/2021 · Last Revised: 05/2026",
    "pages": 2,
    "pocket": True,
    "blocks": [
        {"t": "step", "n": 1, "pg": 1, "r": [T("Timely initiation of effective antibiotics following gram stain with GPCs in clusters")]},
        {"t": "step", "n": 2, "pg": 1, "r": [T("Timely change to β-lactam therapy if MSSA")],
         "sub": [[T("Oxacillin for endocarditis or meningitis")],
                 [T("Cefazolin for patient without endocarditis or meningitis")]]},
        {"t": "step", "n": 3, "pg": 1, "r": [T("Therapeutic vancomycin level")], "sub": [[T("AUC of 350-530")]]},
        {"t": "step", "n": 4, "pg": 1, "r": [T("Obtain repeat blood cultures every 24 – 48 hours until documented clearance of bacteremia")]},
        {"t": "step", "n": 5, "pg": 1, "r": [T("Identify and control source of bacteremia")]},
        {"t": "step", "n": 6, "pg": 1, "r": [T("Echocardiography")]},
        {"t": "step", "n": 7, "pg": 1, "r": [T("Assess for potential treatment failure and adjust antibiotics")],
         "sub": [[T("See reverse for recommended antibiotic adjustments")]], "jump": "mrsa"},
        {"t": "step", "n": 8, "pg": 1, "r": [T("Treatment Duration")],
         "kv": [["Uncomplicated bacteremia", "2 weeks"],
                ["Complicated bacteremia without endocarditis or osteomyelitis", "at least 4 weeks"],
                ["Complicated bacteremia with endocarditis", "at least 6 weeks"],
                ["Complicated bacteremia with osteomyelitis", "at least 8 weeks"]]},
        {"t": "note", "pg": 1, "r": [B("Uncomplicated bacteremia definition: "),
                                     T("no endocarditis, no implanted prostheses, no evidence of metastatic sites of infection, repeat blood cultures 2 – 4 days are negative, AND defervesce within 72 hours of therapy")]},
        {"t": "p", "pg": 1, "r": [T("The recommendations in this guide are meant to serve as treatment guidelines for use at Michigan Medicine facilities. If you are an individual experiencing a medical emergency, call 911 immediately. These guidelines should not replace a provider’s professional medical advice based on clinical judgment, or be used in lieu of an Infectious Diseases consultation when necessary. As a result of ongoing research, practice guidelines may from time to time change. The authors of these guidelines have made all attempts to ensure the accuracy based on current information, however, due to ongoing research, users of these guidelines are strongly encouraged to confirm the information contained within them through an independent source.")]},
        {"t": "p", "pg": 1, "r": [T("If obtained from a source other than https://antimicrobialstewardship.med.umich.edu, please visit the webpage for the most up-to-date document.")]},
        {"t": "h", "l": 2, "pg": 2, "id": "mrsa", "r": [T("Antibiotic Recommendations for MRSA Bacteremia")]},
        {"t": "table", "pg": 2, "caption": None, "head": ["Scenario", "Recommendation", "Comments"], "rows": [
            [[[T("First-line")]],
             [[B("Vancomycin")]],
             [[T("Vancomycin preferred for vancomycin MIC ≤ 2"), S("1")]]],
            [[[T("First-line if vancomycin intolerance or allergy")]],
             [[B("Daptomycin"), T(" 8 mg/kg IV q24h"), S("2,3")]],
             [[T("Other alternatives include:")],
              [B("ceftaroline"), T(" 600 mg IV q8h"), S("3"), T(" or")],
              [B("linezolid"), T(" 600 mg IV q12h"), S("4")]]],
            [[[T("Continued persistence of bacteremia"), S("4"), T(" beyond 5 days, despite therapy with vancomycin or daptomycin")]],
             [[T("Continue exhaustive search and removal of uncontrolled foci of infection. Change in therapy may not be warranted in all cases.")],
              [T("Combination therapy may be warranted and should be based on susceptibilities"), S("3"), T(".")],
              [T("The preferred regimen is "), B("daptomycin"), T(" 8-10 mg/kg IV + "), B("ceftaroline"), T(" 600 mg IV q8h")]],
             [[T("Combination therapy can be de-escalated to monotherapy ("), B("daptomycin"), T(", "), B("ceftaroline"), T(", or "), B("vancomycin"),
               T(") when blood cultures clear x48 – 72 hours and patient displays clinical improvement. Combination therapy generally given for ~5-7 days in most patients.")]]],
        ]},
        {"t": "fn", "pg": 2, "items": [
            ["1", [T("There is no significant effect of MIC on the risk of mortality with vancomycin therapy in MRSA bacteremia (Kalil JAMA 2014), and there is no clear data suggesting superior outcomes with daptomycin based on MRSA isolates with vancomycin MIC of 2 (van Hal CID 2013)")]],
            ["2", [T("Daptomycin should not be utilized if the source of bacteremia is pulmonary.")]],
            ["3", [T("Always confirm susceptibility of alternative antibiotics")]],
            ["4", [T("Persistent MSSA bacteremia occurs less often than persistent MRSA bacteremia. In a small case series, the combination of Ertapenem and Cefazolin rapidly cleared persistent MSSA bacteremia (Ulloa ER Clin Infect Dis 2020).")]],
        ]},
    ],
}

if __name__ == "__main__":
    path = sys.argv[1]
    d = json.load(open(path, encoding="utf-8"))
    for p in d["pages"]:
        if p["id"] == "guidelines~adult~s-aureus-pocketcard":
            p["guide"] = guide
    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("pocket card replaced")
