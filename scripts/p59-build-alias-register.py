import json, re, collections
R = "."
demo = json.load(open(f"{R}/tests/fixtures/p40-mito-demo-active-catalog.v1.json"))
def walk(o, pat):
    if isinstance(o, dict):
        if isinstance(o.get("id"), str) and re.match(pat, o["id"]): yield o
        for v in o.values(): yield from walk(v, pat)
    elif isinstance(o, list):
        for v in o: yield from walk(v, pat)
cv = {i["id"]: i for i in walk(json.load(open(f"{R}/data/scientific/cardiovascular-handbook.catalog.v1.json")), r"cv-\d+$")}
bone = {i["id"]: i for i in walk(json.load(open(f"{R}/data/scientific/bone-health-handbook-v7.catalog.json")), r"bone-\d+$")}
prov = json.load(open(f"{R}/data/scientific/p59-provisional-literature-criteria.v1.json"))
live = json.load(open(f"{R}/data/scientific/p57-reference-criteria.v1.json"))
crit_by_target = collections.defaultdict(list)
for c in prov["criteria"]:
    key = c["identity"]["catalogId"] or f"criterion:{c['id']}"
    crit_by_target[(key, c["identity"]["unit"])].append(c["id"])
for c in live["criteria"]:
    if c["id"] in prov["includeLiveCandidates"] and c["identity"]["catalogId"]:
        crit_by_target[(c["identity"]["catalogId"], c["identity"]["unit"])].append(c["id"])

# Curated name equivalence: demo display name -> (target, rationale). Only same analyte/measure; narrower/broader concepts are flagged.
EQ = {
 "Serum sodium": ("cv-070", "Same analyte (serum sodium vs 'Sodium'); catalog note: electrolyte panel"),
 "Serum potassium": ("cv-071", "Same analyte (serum potassium vs 'Potassium')"),
 "Serum magnesium": ("cv-072", "Same analyte"),
 "LDL cholesterol": ("cv-086", "Same analyte (LDL-C)"),
 "HDL cholesterol": ("cv-087", "Same analyte (HDL-C)"),
 "Apolipoprotein B": ("cv-089", "Same analyte (ApoB)"),
 "High sensitivity CRP": ("cv-091", "Same analyte and assay class (hsCRP)"),
 "Systolic blood pressure": ("cv-005", "Same measure (SBP)"),
 "Diastolic blood pressure": ("cv-006", "Same measure (DBP)"),
 "Mean arterial pressure": ("cv-007", "Same measure (MAP)"),
 "Resting heart rate": ("cv-002", "Same measure (Resting HR)"),
 "SpO2": ("cv-065", "Same measure (SpO₂)"),
 "Left ventricular mass": ("cv-019", "Same measure (LV mass)"),
 "Ejection fraction": ("cv-021", "LVEF; demo name does not say 'left ventricular'"),
 "ECG QTc interval": ("cv-032", "Same measure (QTc)"),
 "ECG PR interval": ("cv-030", "Same measure (PR)"),
 "ECG QRS duration": ("cv-031", "Same measure (QRS)"),
 "ST segment deviation": ("cv-037", "ST changes"),
 "Arterial stiffness PWV": ("cv-045", "Same measure (PWV)"),
 "Carotid intima media thickness": ("cv-044", "Same measure (cIMT)"),
 "Endothelial function FMD": ("cv-046", "Same measure (FMD)"),
 "Coronary calcium score": ("cv-048", "Same measure (CAC score)"),
 "Orthostatic heart rate change": ("cv-039", "Same measure (orthostatic ΔHR)"),
 "Orthostatic systolic change": ("cv-038", "Same measure (orthostatic ΔSBP)"),
 "Exercise workload": ("cv-064", "Workload"),
 "Respiratory rate": ("cv-067", "Same measure"),
 "Plasma volume": ("cv-014", "Same measure"),
 "Blood volume": ("cv-015", "Same measure ('Blood volum' in catalog)"),
 "D-dimer": ("cv-057", "Same analyte"),
 "Fibrinogen": ("cv-059", "Same analyte"),
 "Platelet count": ("cv-058", "Same measure"),
 "Stroke volume": ("cv-009", "Same measure"),
 "Lipoprotein(a)": ("cv-090", "Same analyte"),
 "TNF-alpha": ("cv-093", "Same analyte (TNF-α)"),
 "Fasting glucose": ("cv-083", "Glucose; demo name is narrower (fasting) than catalog 'Glucose'"),
 "End diastolic volume": ("cv-017", "Catalog is LV EDV; demo name does not specify the ventricle"),
 "VO2 max": ("cv-063", "Catalog is VO₂peak; 'max' and 'peak' are not identical protocols"),
 "BNP": ("cv-081", "Catalog combines BNP/NT-proBNP"),
 "NT-proBNP": ("cv-081", "Catalog combines BNP/NT-proBNP"),
 "Troponin I": ("cv-082", "Catalog combines Troponin I/T, assay-specific"),
 "Troponin T": ("cv-082", "Catalog combines Troponin I/T, assay-specific"),
 "Vascular resistance": ("cv-012", "Catalog is systemic vascular resistance; demo name unspecific"),
 "Active heart rate": ("cv-003", "Catalog is exercise HR; 'active' is not defined"),
 "Osteocalcin": ("bone-012", "Same analyte"), "CTX": ("bone-001", "Same analyte (CTX / β-CTX)"), "P1NP": ("bone-009", "Same analyte"),
 "P1NP / PINP": ("bone-009", "Same analyte"), "25-Hydroxyvitamin D": ("bone-019", "Same analyte (25(OH) Vitamin D)"),
 "Pyridinoline (PYD)": ("bone-003", "Same analyte"), "Deoxypyridinoline (DPD)": ("bone-004", "Same analyte"), "PICP": ("bone-010", "Same analyte"),
 "Ionized Calcium": ("bone-014", "Same analyte"),
}
AMBIG = {"Fasting glucose", "End diastolic volume", "VO2 max", "BNP", "NT-proBNP", "Troponin I", "Troponin T", "Vascular resistance", "Active heart rate", "Ejection fraction"}
CRIT_SCOPED = {"25-Hydroxyvitamin D": "criterion:p59-nihods-25ohd", "Sleep efficiency": "criterion:p59-nsf2017-sleep-efficiency"}
# Observed in the repository's own Alex Morgan reconstruction (tests/domain/p58-professional-report.test.ts) and in the P56/P58 data files
repo_refs = collections.defaultdict(list)
for f in ["data/scientific/p56-review-priority-rules.v1.json", "data/scientific/p58-clinical-concern-library.v1.json", "data/scientific/p56-health-pattern-library.v1.json", "src/domain/health-intelligence/p58-report-charts.ts", "tests/domain/p58-professional-report.test.ts"]:
    t = open(f"{R}/{f}").read()
    for d in set(re.findall(r"demo:ubt-[0-9a-f]{8}", t)): repo_refs[d].append(f)

rows = []
mission = {e["missionId"] for e in demo["entries"]}
assert len(mission) == 1; mission = mission.pop()
for e in demo["entries"]:
    name, unit, did, dom = e["displayName"], e["unit"], e["demoId"], e["domain"]
    r = dict(demoId=did, displayName=name, unit=unit, domain=dom, missionId=e["missionId"], missionCode=demo["missionCode"], revoked=e.get("revoked", False),
             target=None, targetName=None, targetUnit=None, status=None, confidence=None, evidence=[], ambiguities=[], provisionalCriteria=[])
    r["evidence"].append(f"Activated SYNTHETIC DEMO catalog entry (tests/fixtures/p40-mito-demo-active-catalog.v1.json; activation {e['activatedAt']}, demo catalog v{e['demoCatalogVersion']}, entrySha256 {e['entrySha256'][:12]}…)")
    if repo_refs.get(did): r["evidence"].append("Referenced with the same concept in: " + ", ".join(sorted(repo_refs[did])))
    if name in EQ:
        tid, why = EQ[name]; r["target"] = tid
        tgt = cv.get(tid) or bone.get(tid)
        r["targetName"] = tgt["name"]; r["targetUnit"] = tgt.get("unit")
        r["evidence"].append(f"Name equivalence: {why}")
        tu = tgt.get("unit")
        if tu is None:
            r["status"] = "NOT_MAPPABLE_TARGET_HAS_NO_UNIT"; r["confidence"] = "n/a"
            r["ambiguities"].append(f"{tid} '{tgt['name']}' defines no unit in the production catalog; an exact-unit binding is impossible until the catalog gate assigns one.")
        elif tu != unit:
            r["status"] = "NOT_MAPPABLE_UNIT_DIFFERS"; r["confidence"] = "n/a"
            r["ambiguities"].append(f"Unit '{unit}' ≠ catalog unit '{tu}'" + (" (catalog unit is itself ambiguous)" if re.search(r"\sή\s|\sor\s|/\s%|ή", tu) else "") + "; no conversion is permitted.")
        elif (dom != ("cardiovascular" if tid.startswith("cv-") else "bone")):
            r["status"] = "NOT_PROPOSED_DOMAIN_DIFFERS"; r["confidence"] = "n/a"
            r["ambiguities"].append(f"Demo entry is in the '{dom}' domain, catalog identity in '{'cardiovascular' if tid.startswith('cv-') else 'bone'}'; P57 criteria bind the domain too.")
        elif name in AMBIG:
            r["status"] = "AMBIGUOUS_NOT_PROPOSED"; r["confidence"] = "low"
            r["ambiguities"].append(why)
        else:
            r["status"] = "PROPOSED_EXACT"; r["confidence"] = "high"
            r["evidence"].append(f"Exact unit match '{unit}' = catalog '{tu}'; same domain ({dom}); one-to-one (no other demo entry with this name and unit).")
    if name in CRIT_SCOPED:
        r["target"] = CRIT_SCOPED[name]; r["targetUnit"] = unit; r["targetName"] = name
        r["status"] = "PROPOSED_CRITERION_SCOPED"; r["confidence"] = "high"; r["ambiguities"] = [a for a in r["ambiguities"] if "no unit" not in a]
        r["evidence"].append(f"Provisional criterion concept '{name}' with identical unit '{unit}' and no production catalog unit to bind; alias is criterion-scoped (provisional mode only).")
    if r["status"] is None:
        r["status"] = "NO_PRODUCTION_COUNTERPART"; r["confidence"] = "n/a"
    if r["target"]:
        r["provisionalCriteria"] = crit_by_target.get((r["target"], unit), [])
    rows.append(r)
# one-to-one check
cnt = collections.Counter((r["target"], r["unit"]) for r in rows if r["status"].startswith("PROPOSED"))
for r in rows:
    if r["status"].startswith("PROPOSED") and cnt[(r["target"], r["unit"])] > 1:
        r["status"] = "AMBIGUOUS_NOT_PROPOSED"; r["confidence"] = "low"; r["ambiguities"].append("More than one demo entry maps to this target and unit.")
# standard CRP note
for r in rows:
    if r["displayName"] in ("C-reactive protein", "CRP"):
        r["status"] = "NO_PRODUCTION_COUNTERPART"; r["ambiguities"].append("Standard CRP is not hsCRP (cv-091); two demo entries ('C-reactive protein', 'CRP') exist; no production standard-CRP identity.")
    if r["displayName"] in ("WBC", "White blood cell count (total leukocytes)", "Neutrophils", "Neutrophil count (absolute)", "Absolute neutrophil count"):
        r["ambiguities"].append("Immune catalog (IMM-*) defines no units; also duplicate demo entries with different units (10^9/L, 10^3/μL, cells/μL, %).")
out = {"schema": "mitochondria.p59-demo-identity-alias-register.v1", "status": "PROPOSED_PENDING_RESEARCHER_APPROVAL", "generatedAt": "2026-11-08",
  "note": "Proposed register only. NOT read by application code. Each PROPOSED row becomes effective only if a Researcher copies it into data/scientific/p59-provisional-literature-criteria.v1.json demoAliases.map with approvedBy/approvedAt through a reviewed patch. Applies to provisional (synthetic demonstration) mode only; never to approved P57 classification, never to real data. Mission-scoped: demo identities are per-mission.",
  "method": "All 186 activated entries of the MITO_DEMO_2026 synthetic demo catalog (read-only fixture copy) compared with the production catalogs. PROPOSED_EXACT requires: curated same-analyte name equivalence, identical unit string, same domain, a production identity that defines that unit, and a one-to-one relation. Concepts that are narrower/broader, combined, cross-domain or unit-mismatched are not proposed.",
  "missionId": mission, "missionCode": demo["missionCode"],
  "counts": dict(collections.Counter(r["status"] for r in rows)),
  "rows": sorted(rows, key=lambda r: (not r["status"].startswith("PROPOSED"), r["status"], r["domain"], r["displayName"]))}
json.dump(out, open("data/scientific/p59-demo-identity-alias-register.v1.json", "w"), ensure_ascii=False, indent=2)
print(out["counts"])
for r in out["rows"]:
    if r["status"].startswith("PROPOSED") or r["status"] in ("AMBIGUOUS_NOT_PROPOSED", "NOT_MAPPABLE_UNIT_DIFFERS", "NOT_MAPPABLE_TARGET_HAS_NO_UNIT", "NOT_PROPOSED_DOMAIN_DIFFERS"):
        print(r["status"], r["demoId"], r["displayName"], r["unit"], "->", r["target"], r["targetUnit"], r["provisionalCriteria"])
