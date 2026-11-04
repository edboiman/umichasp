# Application UI inventory

Baseline: 134 pages; 124 native guidelines; 45 conditions; 99 indexed agents; 7 resource groups.

## Route families

| Route | Screen / states |
|---|---|
| `#/` | Home; alerts; quick access; recent items; population switch |
| `#/conditions` | All systems; conditions filter; adult/pediatric/all; empty results |
| `#/c/:id` | Condition; grouped population and setting variants; single-page redirect; empty population |
| `#/p/:id` | Every captured page; reader; TOC; tables; lists; charts; chart text; pathways; source links; agents; references; history; save; text sizes; search deep links |
| `#/drugs` | Class groups; name/alias/class filter; population; empty results |
| `#/d/:name` | Drug; restricted/dosing/condition/resource groups; expandable passages; save |
| `#/res` | All resource groups; files; staff links |
| `#/r/:id` | Resource group; adult/pediatric; population filtering |
| `#/files` | File/calculator links; filtering; empty state |
| `#/staff` | Staff links; filtering; empty state |
| `#/search` | Suggestions; conditions; drugs; titles; passages; marks; empty and filtered results |
| `#/saved` | Bookmarks; recents; empty state; clear history |
| `#/about` | Disclaimer; installation; offline charts; download progress/retry |
| `#/unknown` | Missing route/page/condition/drug/resource |

## Shared interaction inventory

Top bar/back/search, bottom tabs, population radio buttons, search debounce, keyboard Enter/Escape, local saved/recent/text-size state, toast, accordions, scrollable tables, source/file links, chart images/text, original pathway charts, skip navigation, offline service worker. No modal, build system, package manifest, TypeScript, or external dependencies exist in the supplied app.

Existing breakpoints: 560px, 752px; system light/dark, reduced motion, safe areas. Content sources: content.json, drugs.json, taxonomy.json, embedded UI text, image charts; capture/conversion tools retained.

## Every captured page

| ID / route suffix | Title | Native guide | Tables | Complex cell >1,200 chars |
|---|---|---|---|---|
| `guidelines~adult` | Inpatient Adult | No | 0 | No |
| `guidelines~pediatric` | Inpatient Peds | No | 0 | No |
| `guidelines~outpatient` | Outpatient Adult & Peds | No | 0 | No |
| `guidelines~surgical-prophylaxis` | Surgical Prophylaxis | No | 0 | No |
| `guidelines~hiv` | HIV | No | 0 | No |
| `guidelines~transplant` | Transplant | No | 0 | No |
| `copat` | COpAT | No | 0 | No |
| `pharmacokinetics` | Pharmacokinetics | No | 0 | No |
| `patient-education` | Patient Education | No | 0 | No |
| `guidelines~Diarrhea-home` | Infectious Diarrhea Home | No | 0 | No |
| `guidelines~adult~dosing-adult` | Antimicrobial Dosing - Adult | Yes | 13 | No |
| `guidelines~adult~PD-Dosing-Adult` | Peritoneal Dialysis Dosing - Adult | Yes | 2 | No |
| `pharmacokinetics~vancomycin-adult` | Vancomycin - Adult | Yes | 7 | No |
| `pharmacokinetics~aminoglycoside-adult` | Aminoglycoside - Adult | Yes | 5 | No |
| `guidelines~adult~Dosing-Obesity` | Antimicrobial Dosing in Obesity | Yes | 1 | No |
| `guidelines~adult~blaes-guideline` | BLAES Guideline | Yes | 6 | No |
| `guidelines~adult~PST-Procedure` | Penicillin Skin Testing Procedure | Yes | 1 | No |
| `guidelines~adult~cation-interactions` | Cation Interactions | Yes | 2 | No |
| `guidelines~adult~drug-induced-qt-prolongation-adult` | Drug-induced QT Prolongation - Adult | Yes | 1 | No |
| `guidelines~adult~midline-catheters` | Midline Catheters | Yes | 4 | No |
| `guidelines~adult~renal-dosing-equations` | Renal Dosing Equations | Yes | 1 | No |
| `guidelines~adult~Sertonin-Linezolid` | Serotonin Syndrome with Linezolid | Yes | 1 | No |
| `guidelines~adult~Antifungal-TDM` | Antifungal Therapeutic Drug Monitoring | Yes | 6 | No |
| `guidelines~adult~Linezolid-TDM` | Linezolid Therapeutic Drug Monitoring | Yes | 1 | No |
| `guidelines~adult~Warfarin-DDI` | Warfarin - Antimicrobial Interactions | Yes | 6 | No |
| `guidelines~adult~t1-adult` | Tier 1 Restricted Antimicrobials - Adult | Yes | 2 | No |
| `guidelines~adult~tier-2-restricted-antimicrobials-adult` | Tier 2 Restricted Antimicrobials - Adult | Yes | 1 | No |
| `guidelines~adult~blood-stream-infections-adult` | Blood Stream Infections - Adult | Yes | 0 | No |
| `guidelines~adult~s-aureus-pocketcard` | S. aureus Pocketcard | Yes | 1 | No |
| `guidelines~adult~bone-and-joint-adult` | Bone and Joint - Adult | Yes | 10 | Yes |
| `guidelines~outpatient~PJI-dental-ppx` | Prosthetic Joint Infection Dental Prophylaxis | Yes | 2 | No |
| `guidelines~adult~open-fractures-adult` | Open Fractures - Adult | Yes | 2 | No |
| `guidelines~adult~VAD` | Ventricular Assist Device Infections | Yes | 2 | No |
| `guidelines~adult~native-valve-endocarditis-treatment` | Native Valve Endocarditis Treatment | Yes | 3 | Yes |
| `guidelines~adult~prosthetic-valve-endocarditis-treatment` | Prosthetic Valve Endocarditis Treatment | Yes | 2 | No |
| `guidelines~adult~endocarditis-algorithm` | Endocarditis Algorithm | Yes | 1 | No |
| `guidelines~adult~aspergillosis-treatment` | Aspergillosis Treatment | Yes | 3 | Yes |
| `guidelines~adult~candidemia-adult` | Candidemia - Adult | Yes | 3 | Yes |
| `guidelines~adult~cryptococcus-treatment-adult` | Cryptococcus Treatment - Adult | Yes | 3 | Yes |
| `guidelines~adult~infectious-diarrhea-treatment-adult` | Infectious Diarrhea Treatment - Adult | Yes | 3 | Yes |
| `guidelines~adult~CDI-treatment` | CDI Treatment | Yes | 3 | No |
| `guidelines~adult~h-pylori-treatment` | H. Pylori Treatment | Yes | 2 | Yes |
| `guidelines~adult~intrabdominal-infections-adult` | Intrabdominal Infections - Adult | Yes | 8 | Yes |
| `guidelines~adult~bacterial-meningitis-adult` | Bacterial Meningitis - Adult | Yes | 3 | No |
| `guidelines~outpatient~GAS-adult` | Group A Streptococcus Pharyngitis - Adult | Yes | 2 | Yes |
| `guidelines~adult~ocular-infections-adult` | Ocular Infections - Adult | Yes | 2 | Yes |
| `guidelines~adult~odontogenic-infections` | Odontogenic Infections | Yes | 2 | No |
| `guidelines~adult~head-neck-penicillin-allergy` | Head & Neck Penicillin Allergy | Yes | 1 | No |
| `guidelines~adult~leech-information` | Leech Information | Yes | 1 | No |
| `guidelines~adult~Antimicrobial-lock` | Antimicrobial Lock Therapy | Yes | 5 | No |
| `guidelines~adult~ethanol-lock-therapy` | Ethanol Lock Therapy | Yes | 1 | No |
| `guidelines~adult~hiv-prep` | HIV PrEP | Yes | 3 | Yes |
| `guidelines~adult~Measles-PEP` | Measles Post-exposure Prophylaxis | Yes | 2 | No |
| `guidelines~adult~obstetrics-gyencologic-treatment` | Obstetrics & Gyencologic Treatment | Yes | 3 | No |
| `guidelines~adult~obstetrics-allergy` | Obstetrics Allergy | Yes | 1 | No |
| `guidelines~adult~malaria-treatment` | Malaria Treatment | Yes | 3 | Yes |
| `guidelines~adult~covid-19-treatment` | COVID-19 Treatment | Yes | 4 | Yes |
| `guidelines~outpatient~ambulatory-covid-19-treatment` | Ambulatory COVID-19 Treatment | Yes | 4 | No |
| `guidelines~outpatient~paxlovid-drug-drug-interactions` | Paxlovid Drug-drug Interactions | Yes | 6 | No |
| `guidelines~adult~covid-19-vaccination-timing` | COVID-19 Vaccination Timing | Yes | 4 | No |
| `guidelines~adult~pneumonia-treatment` | Pneumonia Treatment | Yes | 7 | Yes |
| `guidelines~adult~ICU-PNA` | ICU Pneumonia Treatment Algorithm | Yes | 1 | No |
| `guidelines~adult~procalcitonin-guideline` | Procalcitonin Guideline | Yes | 2 | No |
| `guidelines~adult~RSV-Treatment` | Respiratory Syncytial Virus Treatment | Yes | 2 | No |
| `guidelines~adult~influenza-adult` | Influenza - Adult | Yes | 5 | No |
| `guidelines~adult~animal-bite-adult` | Animal Bite - Adult | Yes | 4 | No |
| `guidelines~adult~SSTI-adult` | Skin and Soft Tissue Infections - Adult | Yes | 8 | No |
| `guidelines~outpatient~ambulatory-dalbavancin-protocol` | Ambulatory Dalbavancin Protocol | Yes | 2 | No |
| `guidelines~outpatient~uUTI-workflow_ID` | ID uUTI Workflow | Yes | 1 | No |
| `guidelines~adult~UTI-Adult` | Urinary Tract Infections - Adult | Yes | 10 | Yes |
| `guidelines~adult~CDI-diagnostics` | CDI Diagnostics | Yes | 2 | No |
| `guidelines~adult~BCx-algorithm` | Blood Culture Algorithm | Yes | 0 | No |
| `guidelines~adult~meningitis-film-array` | Meningitis Film Array | Yes | 1 | No |
| `guidelines~adult~bmt-prophylaxis` | BMT Prophylaxis | Yes | 8 | No |
| `guidelines~adult~hematology-prophylaxis` | Hematology Prophylaxis | Yes | 3 | No |
| `guidelines~adult~car-t-prophylaxis` | CAR-T Prophylaxis | Yes | 6 | No |
| `guidelines~pediatric~antimicrobial-dosing-pediatrics` | Antimicrobial Dosing - Pediatrics | Yes | 17 | No |
| `pharmacokinetics~vancomycin-pediatrics` | Vancomycin - Pediatrics | Yes | 8 | No |
| `pharmacokinetics~aminoglycoside-pediatrics` | Aminoglycoside - Pediatrics | Yes | 7 | No |
| `guidelines~pediatric~t1-pediatric` | Tier 1 Restricted Antimicrobials - Pediatrics | Yes | 3 | Yes |
| `guidelines~pediatric~t2-pediatric` | Tier 2 Restricted Antimicrobials - Pediatrics | Yes | 3 | No |
| `guidelines~pediatric~pediatric-procalcitonin-usage-guidelines` | Pediatric Procalcitonin Usage Guidelines | Yes | 2 | No |
| `guidelines~pediatric~blood-stream-infections-pediatric` | Blood Stream Infections - Pediatric | Yes | 5 | Yes |
| `guidelines~pediatric~bone-and-joint-pediatrics` | Bone and Joint - Pediatrics | Yes | 2 | No |
| `guidelines~pediatric~native-valve-endocarditis-pediatrics` | Native Valve Endocarditis - Pediatrics | Yes | 3 | No |
| `guidelines~pediatric~prosthetic-valve-endocarditis-pediatrics` | Prosthetic Valve Endocarditis - Pediatrics | Yes | 3 | No |
| `guidelines~pediatric~aspergillosis-and-mucormycosis-pediatrics` | Aspergillosis and Mucormycosis - Pediatrics | Yes | 3 | No |
| `guidelines~pediatric~candidiasis-pediatrics` | Candidiasis - Pediatrics | Yes | 4 | No |
| `guidelines~pediatric~intra-abdominal-infections-pediatrics` | Intra-abdominal Infections - Pediatrics | Yes | 8 | No |
| `guidelines~pediatric~clostridiodies-difficile-pediatric` | Clostridiodies difficile - Pediatric | Yes | 3 | No |
| `guidelines~pediatric~infectious-diarrhea-pediatrics` | Infectious Diarrhea - Pediatrics | Yes | 6 | No |
| `guidelines~outpatient~ambulatory-pediatric-acute-otitis-media` | Ambulatory Pediatric Acute Otitis Media | Yes | 2 | No |
| `guidelines~pediatric~deep-neck-space-infections` | Deep Neck Space Infections | Yes | 3 | Yes |
| `guidelines~outpatient~GAS-peds` | Group A Streptococcus Pharyngitis - Pediatric | Yes | 2 | Yes |
| `guidelines~pediatric~ethanol-lock-therapy-pediatrics` | Ethanol Lock Therapy - Pediatrics | Yes | 6 | No |
| `guidelines~pediatric~bacterial-meningitis-pediatrics` | Bacterial Meningitis - Pediatrics | Yes | 2 | No |
| `guidelines~adult~TPOXX` | Tecovirimat Process | Yes | 1 | No |
| `guidelines~outpatient~Lyme-Pediatrics` | Ambulatory Pediatric Lyme Disease | Yes | 4 | Yes |
| `guidelines~pediatric~perinatal-hiv-pediatrics` | Perinatal HIV - Pediatrics | Yes | 3 | No |
| `guidelines~pediatric~necrotizing-enterocolitis-pediatrics` | Necrotizing Enterocolitis - Pediatrics | Yes | 5 | No |
| `guidelines~pediatric~pneumonia-pediatrics` | Pneumonia - Pediatrics | Yes | 9 | Yes |
| `guidelines~pediatric~cystic-fibrosis-pediatrics` | Cystic Fibrosis - Pediatrics | Yes | 4 | No |
| `guidelines~pediatric~influenza-pediatrics` | Influenza - Pediatrics | Yes | 4 | Yes |
| `guidelines~pediatric~undifferentiated-sepsis-pediatrics` | Undifferentiated Sepsis - Pediatrics | Yes | 2 | No |
| `guidelines~pediatric~animal-bite-pediatrics` | Animal Bite - Pediatrics | Yes | 3 | No |
| `guidelines~pediatric~skin-and-soft-tissue-infections-pediatrics` | Skin and Soft Tissue Infections - Pediatrics | Yes | 3 | Yes |
| `guidelines~pediatric~urinary-tract-infections-pediatrics` | Urinary Tract Infections - Pediatrics | Yes | 3 | No |
| `guidelines~pediatric~hematologyoncology-prophylaxis-pediatrics` | Hematology/Oncology Prophylaxis - Pediatrics | Yes | 5 | No |
| `guidelines~outpatient~ambulatory-rhinosinusitis` | Ambulatory Rhinosinusitis | Yes | 2 | Yes |
| `guidelines~outpatient~Lyme-Adult` | Ambulatory Adult Lyme Disease | Yes | 4 | Yes |
| `guidelines~outpatient~amb-CAP` | Ambulatory Community-acquired Pneumonia | Yes | 2 | No |
| `guidelines~outpatient~pemivibart-step-by-step-process` | Pemivibart Step-by-step Process | Yes | 1 | No |
| `guidelines~outpatient~ambulatory-evisit-cough-and-flu` | Ambulatory eVisit Cough and Flu | Yes | 1 | No |
| `guidelines~outpatient~ambulatory-diabetic-foot-protocol` | Ambulatory Diabetic Foot Protocol | Yes | 2 | No |
| `guidelines~outpatient~ambulatory-skin-and-soft-tissue-infections-adult` | Ambulatory Skin and Soft Tissue Infections - Adult | Yes | 3 | No |
| `guidelines~outpatient~uUTI-workflow_URO` | URO uUTI Workflow | Yes | 1 | No |
| `guidelines~outpatient~ambulatory-urinary-tract-infections-adult` | Ambulatory Urinary Tract Infections - Adult | Yes | 6 | Yes |
| `guidelines~pediatric~nirsevimab-pediatrics` | Nirsevimab - Pediatrics | Yes | 5 | No |
| `guidelines~adult~navigating-tableau-tips` | Navigating Tableau Tips | Yes | 0 | No |
| `guidelines~surgical-prophylaxis~adult-surgical-prophylaxis` | Adult Surgical Prophylaxis | Yes | 47 | No |
| `guidelines~surgical-prophylaxis~patients-50-kg` | Patients > 50 kg | Yes | 2 | No |
| `guidelines~surgical-prophylaxis~patients-50-kg_1` | Patients </= 50 kg | Yes | 3 | No |
| `guidelines~surgical-prophylaxis~pediatric-head-and-neck` | Pediatric Head and Neck | Yes | 1 | No |
| `guidelines~surgical-prophylaxis~pediatric-surgical-prophylaxis-guidelines` | Pediatric Surgical Prophylaxis Guidelines | Yes | 16 | Yes |
| `guidelines~transplant~donor-cx_txp` | Positive Donor Cultures | Yes | 1 | No |
| `pharmacokinetics~pharmacokinetic-workflow` | Pharmacokinetic Workflow | Yes | 2 | No |
| `pharmacokinetics~pharmacokinetic-review-pediatrics` | Pharmacokinetic Review - Pediatrics | Yes | 12 | No |
| `patient-education~get-smart-about-antibiotics` | Get Smart about Antibiotics | Yes | 3 | No |
| `patient-education~snort-sniffle-sneeze` | Snort. Sniffle. Sneeze | Yes | 0 | No |
| `patient-education~youve-been-given-an-antibiotic-now-what` | You've been given an Antibiotic, now what? | Yes | 0 | No |
| `patient-education~antibiotics-are-not-always-the-answer` | Antibiotics are not always the answer | Yes | 1 | No |
| `patient-education~penicillin-skin-testing-are-you-still-allergic` | Penicillin Skin Testing: Are you Still Allergic? | Yes | 0 | No |
| `patient-education~what-you-need-to-know-when-your-child-is-prescribed-an-antibiotic` | What you need to know when your child is prescribed an antibiotic | Yes | 0 | No |
| `patient-education~what-you-need-to-know-when-you-are-prescribed-an-antibiotic` | What you need to know when you are prescribed an antibiotic | Yes | 0 | No |

## Condition and resource subpages

| Type | ID | Label |
|---|---|---|
| Condition | `bsi` | Bloodstream infection |
| Condition | `sab` | S. aureus bacteremia |
| Condition | `endo` | Endocarditis |
| Condition | `vad` | VAD infection |
| Condition | `lock` | Catheter lock therapy |
| Condition | `sepsis` | Undifferentiated sepsis |
| Condition | `bji` | Bone & joint infection |
| Condition | `fracture` | Open fractures |
| Condition | `pjidental` | PJI dental prophylaxis |
| Condition | `dfi` | Diabetic foot infection |
| Condition | `mening` | Bacterial meningitis |
| Condition | `cap` | Pneumonia |
| Condition | `flu` | Influenza |
| Condition | `rsv` | RSV |
| Condition | `covid` | COVID-19 |
| Condition | `cf` | Cystic fibrosis |
| Condition | `sinus` | Rhinosinusitis |
| Condition | `gas` | Strep pharyngitis |
| Condition | `aom` | Acute otitis media |
| Condition | `eye` | Ocular infections |
| Condition | `dental` | Odontogenic infections |
| Condition | `neck` | Deep neck space infections |
| Condition | `hnallergy` | Head & neck surgery with penicillin allergy |
| Condition | `iai` | Intra-abdominal infection |
| Condition | `cdi` | C. difficile infection |
| Condition | `diarrhea` | Infectious diarrhea |
| Condition | `hpylori` | H. pylori |
| Condition | `nec` | Necrotizing enterocolitis |
| Condition | `uti` | Urinary tract infection |
| Condition | `ssti` | Skin & soft tissue infection |
| Condition | `bite` | Animal bites |
| Condition | `leech` | Medicinal leech therapy |
| Condition | `dalba` | Outpatient dalbavancin |
| Condition | `asp` | Aspergillosis & mucormycosis |
| Condition | `candida` | Candidemia & candidiasis |
| Condition | `crypto` | Cryptococcus |
| Condition | `hiv` | HIV |
| Condition | `measles` | Measles exposure |
| Condition | `mpox` | Mpox (tecovirimat) |
| Condition | `malaria` | Malaria |
| Condition | `lyme` | Lyme disease |
| Condition | `ob` | Obstetric & gynecologic infection |
| Condition | `bmt` | BMT & cellular therapy prophylaxis |
| Condition | `heme` | Hematology/oncology prophylaxis |
| Condition | `txp` | Solid organ transplant |
| Resource | `edu` | Patient education |
| Resource | `dosing` | Dosing & monitoring |
| Resource | `allergy` | β-lactam allergy |
| Resource | `restricted` | Restricted antimicrobials |
| Resource | `diag` | Diagnostic stewardship |
| Resource | `surg` | Surgical prophylaxis |
| Resource | `other` | Other resources |

## Drug subpages

`Penicillin G`, `Penicillin VK`, `Amoxicillin`, `Amoxicillin-clavulanate`, `Ampicillin`, `Ampicillin-sulbactam`, `Piperacillin-tazobactam`, `Nafcillin`, `Oxacillin`, `Dicloxacillin`, `Cefazolin`, `Cephalexin`, `Cefadroxil`, `Cefuroxime`, `Cefoxitin`, `Cefotetan`, `Cefpodoxime`, `Cefdinir`, `Ceftriaxone`, `Cefotaxime`, `Ceftazidime`, `Cefepime`, `Ceftaroline`, `Ceftazidime-avibactam`, `Ceftolozane-tazobactam`, `Cefiderocol`, `Meropenem`, `Meropenem-vaborbactam`, `Imipenem-cilastatin`, `Imipenem-relebactam`, `Ertapenem`, `Aztreonam`, `Vancomycin`, `Daptomycin`, `Oritavancin`, `Dalbavancin`, `Telavancin`, `Linezolid`, `Tedizolid`, `Gentamicin`, `Tobramycin`, `Amikacin`, `Plazomicin`, `Ciprofloxacin`, `Levofloxacin`, `Moxifloxacin`, `Delafloxacin`, `Azithromycin`, `Clarithromycin`, `Erythromycin`, `Fidaxomicin`, `Doxycycline`, `Minocycline`, `Tigecycline`, `Omadacycline`, `Eravacycline`, `Trimethoprim-sulfamethoxazole`, `Clindamycin`, `Metronidazole`, `Nitrofurantoin`, `Fosfomycin`, `Rifampin`, `Rifaximin`, `Colistin`, `Polymyxin B`, `Chloramphenicol`, `Sulbactam-durlobactam`, `Bezlotoxumab`, `Fluconazole`, `Voriconazole`, `Posaconazole`, `Isavuconazonium`, `Itraconazole`, `Micafungin`, `Caspofungin`, `Anidulafungin`, `Rezafungin`, `Amphotericin B`, `Flucytosine`, `Nystatin`, `Acyclovir`, `Valacyclovir`, `Ganciclovir`, `Valganciclovir`, `Letermovir`, `Maribavir`, `Foscarnet`, `Cidofovir`, `Oseltamivir`, `Baloxavir`, `Remdesivir`, `Nirmatrelvir-ritonavir`, `Isoniazid`, `Rifabutin`, `Pyrazinamide`, `Ethambutol`, `Atovaquone`, `Ivermectin`, `Pentamidine`
