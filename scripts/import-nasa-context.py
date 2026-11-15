"""Build the small, source-verified NASA research bundle used by the application."""

import csv
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "research/raw/nasa-context"
BASE = "https://nlsp.nasa.gov"
SLEEP = BASE + "/search/data/details/e26501eb-7d7a-5012-8c8e-c5bdb3eecaf6?dataType=DATASETS"
EXERCISE = BASE + "/search/data/details/0e311656-88ad-5871-9749-2922e6e0ff7a?dataType=DATASETS"
JOURNALS = "https://ntrs.nasa.gov/api/citations/20100026549/downloads/20100026549.pdf"
INPUTS = {
    "actigraphy.csv": (BASE + "/api/v1/files/972badfb-238d-5dd5-81f2-8efc729a4452/download", "761c8d9d31e107186be1b9ca9d2bea79"),
    "actigraphy-readme.txt": (BASE + "/api/v1/files/ba27dc5f-962a-5af8-a232-0b8bef1e4748/download", "5d28f786df8e34ea99f9267040e501cb"),
    "exercise.csv": (BASE + "/api/v1/files/4000885a-03e2-5ef3-8824-cbe8f3d47740/download", "ac97afc6ae7230f8babb3f7aeadaba4d"),
    "cmp.csv": ("https://osdr.nasa.gov/geode-py/ws/studies/OSD-575/download?source=datamanager&file=LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv", None),
}


def rows(name):
    return list(csv.DictReader((RAW / name).read_text(encoding="utf-8-sig").splitlines()))


def hours(value):
    if value in {"NA", "N/A", "", "-999"}:
        return None
    parts = [float(part) for part in value.split(":")]
    return parts[0] + (parts[1] / 60 if len(parts) > 1 else 0) + (parts[2] / 3600 if len(parts) > 2 else 0)


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, (url, expected) in INPUTS.items():
        path = RAW / name
        if not path.exists():
            path.write_bytes(urllib.request.urlopen(url, timeout=45).read())
        raw = path.read_bytes()
        if expected and hashlib.md5(raw).hexdigest() != expected:
            raise ValueError("NASA catalog checksum mismatch: " + name)
        manifest[name] = {"url": url, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}

    sleep = []
    for row in rows("actigraphy.csv"):
        day = int(row["BR_Day"])
        if row["Test_Phase"] == "PRE_TEST":
            day = -day
        sleep.append({"participant": row["Subject"], "phase": row["Test_Phase"], "day": day,
                      "date": row["Date"], "sleep_hours": hours(row["Sleep Duration (hours)"]),
                      "latency_minutes": None if hours(row["Sleep Latency (hours)"]) is None else hours(row["Sleep Latency (hours)"]) * 60,
                      "efficiency_percent": float(row["Sleep Efficiency (%)"]) if row["Sleep Efficiency (%)"] not in {"NA", "N/A", ""} else None, "notes": row["Notes"]})
    exercise = [{"group": row["Group"], "phase": row["Test_Phase"], "trial": int(row["Trial"]),
                 "value": float(row["Value"])} for row in rows("exercise.csv")
                if row["Task"] == "Watts/Kg" and row["Statistic"] == "Mean"]
    cbc = json.loads((ROOT / "public/data/nasa-osd-569.json").read_text(encoding="utf-8"))
    cmp_metrics = [("GLUCOSE", "glucose_mg_dl", "Glucose", "mg/dL"),
                   ("SODIUM", "sodium_mmol_l", "Sodium", "mmol/L"),
                   ("POTASSIUM", "potassium_mmol_l", "Potassium", "mmol/L"),
                   ("CREATININE", "creatinine_mg_dl", "Creatinine", "mg/dL"),
                   ("UREA NITROGEN (BUN)", "bun_mg_dl", "Urea nitrogen", "mg/dL"),
                   ("CALCIUM", "calcium_mg_dl", "Calcium", "mg/dL"),
                   ("ALBUMIN", "albumin_g_dl", "Albumin", "g/dL"),
                   ("AST", "ast_u_l", "AST", "U/L"), ("ALT", "alt_u_l", "ALT", "U/L")]
    visits = {}
    for row in rows("cmp.csv"):
        match = next((item for item in cmp_metrics if item[0] == row["ANALYTE"]), None)
        if not match:
            continue
        if row["UNITS"] != match[3]:
            raise ValueError("Unexpected CMP unit")
        key = (row["SUBJECT_ID"], row["timepoint"])
        visit = visits.setdefault(key, {"astronaut_id": key[0], "timepoint": key[1],
                                       "phase": "preflight" if key[1].startswith("L-") else "postflight"})
        visit[match[1]] = float(row["VALUE"]) if row["VALUE"] not in {"NA", "N/A", ""} else None
    visit_order = lambda r: (r["astronaut_id"], 0 if r["phase"] == "preflight" else 1,
                             -int(r["timepoint"][2:]) if r["phase"] == "preflight" else int(r["timepoint"][2:]))
    sources = [
        {"key": "sleep", "title": "UTMB Campaign 1 / actigraphy", "topic": "recovery", "url": SLEEP,
         "setting": "Ground bed-rest analog", "application": "Compare sleep duration, latency and efficiency with each participant's own pre-bed-rest baseline.",
         "rows": sleep, "participants": sorted({r["participant"] for r in sleep}), "download": "/data/nasa-context-actigraphy.csv"},
        {"key": "exercise", "title": "UTMB 70-day bed rest / exercise", "topic": "recovery", "url": EXERCISE,
         "setting": "Ground bed-rest analog", "application": "Review group-level exercise performance relative to pre-test values; exercise power is not a resting vital sign.",
         "rows": exercise, "groups": sorted({r["group"] for r in exercise}), "unit": "W/kg", "download": "/data/nasa-context-exercise.csv"},
        {"key": "cbc", "title": "Inspiration4 / blood count", "topic": "blood", "url": cbc["source"],
         "setting": "Four spaceflight participants", "application": "Relate matching blood-report markers to within-person preflight and postflight changes.",
         "rows": cbc["rows"], "metrics": cbc["metrics"], "download": "/data/nasa-osd-569.csv"},
        {"key": "cmp", "title": "Inspiration4 / metabolic panel", "topic": "blood", "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575",
         "setting": "Four spaceflight participants", "application": "Retrieve study context for matching glucose, electrolyte, kidney and liver markers in an uploaded report.",
         "rows": sorted(visits.values(), key=visit_order), "metrics": [{"key": k, "label": label, "unit": unit} for _, k, label, unit in cmp_metrics],
         "download": "/data/nasa-context-cmp.csv"},
        {"key": "journals", "title": "NASA Astronaut Journals / Jack Stuster", "topic": "behavior", "url": JOURNALS,
         "setting": "Published ISS journal analysis", "application": "Find context about sleep, workload, adaptation and crew interaction alongside the astronaut's own dated notes.",
         "pages": [6, 41, 42, 63], "themes": ["Sleep", "Workload", "Adjustment", "Crew interaction", "Recreation", "Outside communications"]},
    ]
    facts = [
        ("sleep", "duration", "The NASA UTMB Campaign 1 Actigraphy file contains 207 sleep records from three participants, with pre-test, in-test and post-test observations. Wrist actigraphy provides sleep duration in hours, latency in hours and efficiency in percent. Compare a person's sleep with their own pre-test values. Bed rest is a ground analog, not in-flight astronaut telemetry."),
        ("sleep", "method", "A user's sleep duration can be compared in hours. Sleep latency and efficiency require those measurements; time in bed or a subjective recovery score cannot substitute for them. Keep study phases and participants separate and retain individual baseline differences."),
        ("exercise", "performance", "The NASA CFT70 iRATS power-cycle summary reports group means, SD and SEM for pre-test, in-test and post-test visits. This bundle uses published mean Watts/Kg for CTRL, EXER and FLY separately. Review change relative to the same group's pre-test mean. These exercise-test outcomes are not normal ranges for resting pulse, steps, fatigue or recovery scores."),
        ("cbc", "blood", "NASA OSD-569 includes a CBC table for four Inspiration4 participants. The imported subset contains white and red cell counts, hemoglobin, hematocrit, neutrophil and lymphocyte percentages across seven preflight/postflight visits. Hemoglobin is g/dL. Match the analyte and unit to an uploaded blood report. Four participants cannot define a clinical norm or diagnose a user."),
        ("cmp", "metabolism", "NASA OSD-575 contains Inspiration4 serum comprehensive metabolic panels. The directly downloaded NASA table supplies glucose, sodium, potassium, creatinine, urea nitrogen, calcium, albumin, AST and ALT. Use each participant's preflight baseline and dated postflight visits. Match the same analyte and units in a personal laboratory report; this study cannot supply a resting heart rate, SpO2 or body temperature baseline."),
        ("journals", "sleep", "Stuster's NASA Astronaut Journals report discusses cumulative sleep loss, shifts in sleep schedules and interruptions, alongside adaptation during long ISS expeditions. Use the astronaut's own dated sleep notes to investigate possible explanations; the report does not establish the cause of an individual's change. See printed pages 32-33 (PDF pages 42-43)."),
        ("journals", "social", "The published NASA journal analysis describes work, adaptation, recreation and communication with crewmates, family and mission control. These topics help retrieve relevant personal observations about workload and support. The public report is not the private journal archive or a diagnostic scale. See the executive summary (PDF page 7) and printed page 54 (PDF page 64)."),
    ]
    by_key = {s["key"]: s for s in sources}
    evidence = [{"id": str(uuid.uuid5(uuid.NAMESPACE_URL, by_key[key]["url"] + "#" + slug)),
                 "sourceKey": key, "topic": by_key[key]["topic"], "title": by_key[key]["title"],
                 "url": by_key[key]["url"], "text": text} for key, slug, text in facts]
    for entry, (key, slug, _) in zip(evidence, facts):
        entry["topics"] = ["recovery", "behavior"] if key == "journals" and slug == "sleep" else [entry["topic"]]
    bundle = {"version": "nasa-context-20261115-v1", "scope": "nasa-research:20261115-v1",
              "sources": sources, "evidence": evidence, "provenance": manifest,
              "limitations": "Research cohorts inform interpretation; they are not personal measurements or clinical norms. MARS is an experimental project index."}
    output = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    (ROOT / "public/data/nasa-research.json").write_text(output + "\n", encoding="utf-8")
    (ROOT / "worker/research-evidence.js").write_text("globalThis.MissionNasaData=" + output + ";\n", encoding="utf-8")
    for source, target in [("actigraphy.csv", "actigraphy.csv"), ("exercise.csv", "exercise.csv"), ("cmp.csv", "cmp.csv")]:
        (ROOT / "public/data" / ("nasa-context-" + target)).write_bytes((RAW / source).read_bytes())
    print(json.dumps({"sleepRecords": len(sleep), "exercisePoints": len(exercise), "metabolicVisits": len(visits), "evidenceChunks": len(evidence)}))


if __name__ == "__main__":
    main()
