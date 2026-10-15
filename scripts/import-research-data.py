import csv
import hashlib
import io
import json
import math
import re
import shutil
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data"
RAW = ROOT / "research" / "raw"
BIDMC = "https://physionet.org/files/bidmc/1.0.0/bidmc_csv/"
NASA_SOURCE = "https://raw.githubusercontent.com/DominicTanzillo/Inspiration-Health-Data/main/final_data/"
FIELDS = {
    "glucose_mg_dl": ("Metabolic_Panel", "glucose_value_milligram_per_deciliter"),
    "sodium_mmol_l": ("Metabolic_Panel", "sodium_value_millimol_per_liter"),
    "potassium_mmol_l": ("Metabolic_Panel", "potassium_value_millimol_per_liter"),
    "creatinine_mg_dl": ("Metabolic_Panel", "creatinine_value_milligram_per_deciliter"),
    "bun_mg_dl": ("Metabolic_Panel", "urea_nitrogen_bun_value_milligram_per_deciliter"),
    "calcium_mg_dl": ("Metabolic_Panel", "calcium_value_milligram_per_deciliter"),
    "albumin_g_dl": ("Metabolic_Panel", "albumin_value_gram_per_deciliter"),
    "ast_u_l": ("Metabolic_Panel", "ast_value_units_per_liter"),
    "alt_u_l": ("Metabolic_Panel", "alt_value_units_per_liter"),
    "crp_pg_ml": ("Serum_Cardiovascular", "crp_concentration_picogram_per_milliliter"),
    "fibrinogen_ng_ml": ("Serum_Cardiovascular", "fibrinogen_concentration_nanogram_per_milliliter"),
    "pf4_ng_ml": ("Serum_Cardiovascular", "pf4_concentration_nanogram_per_milliliter"),
    "l_selectin_pg_ml": ("Serum_Cardiovascular", "l_selectin_concentration_picogram_per_milliliter"),
}


def download(url):
    """Прочитать открытый файл с ограничением времени ожидания.

    Parameters
    ----------
    url : str
        Адрес исходного файла.

    Returns
    -------
    bytes
        Полученные байты.
    """
    with urllib.request.urlopen(url, timeout=45) as response:
        return response.read()


def number(value):
    """Преобразовать число, сохранив пропуски как null при экспорте.

    Parameters
    ----------
    value : str
        Исходное значение из CSV.

    Returns
    -------
    float or None
        Конечное число или отсутствие измерения.
    """
    try:
        parsed = float(value)
    except (ValueError, TypeError):
        return None
    return parsed if math.isfinite(parsed) else None


def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")


def import_nasa():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    csv_path = OUTPUT / "nasa-osd-575.csv"
    if not csv_path.exists():
        shutil.copyfile("/Users/adam/Downloads/NASA_OSDR_575_astronaut_health.csv", csv_path)
    rows = list(csv.DictReader(csv_path.open(encoding="utf-8-sig", newline="")))
    sources, provenance = {}, []
    for name in ("Metabolic_Panel", "Serum_Cardiovascular"):
        path = RAW / (name + ".csv")
        if not path.exists():
            path.write_bytes(download(NASA_SOURCE + name + ".csv"))
        raw = path.read_bytes()
        sources[name] = {row["Sample Name"]: row for row in csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))}
        provenance.append({"url": NASA_SOURCE + name + ".csv", "sha256": hashlib.sha256(raw).hexdigest()})
    assert len(rows) == 28 and len({row["sample_id"] for row in rows}) == 28
    assert {row["astronaut_id"] for row in rows} == {"C001", "C002", "C003", "C004"}
    for row in rows:
        assert row["phase"] == ("preflight" if row["timepoint"].startswith("L-") else "postflight")
        for field, (name, column) in FIELDS.items():
            assert float(row[field]) == float(sources[name][row["sample_id"]][column]), (row["sample_id"], field)
            row[field] = float(row[field])
    order = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"]
    rows.sort(key=lambda row: (row["astronaut_id"], order.index(row["timepoint"])))
    save_json(OUTPUT / "nasa-osd-575.json", {"id": "OSD-575", "mission": "Inspiration4", "year": 2021, "license": "CC0-1.0", "source": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575", "provenance": provenance, "verifiedValues": 364, "timepoints": order, "rows": rows})
    print("NASA: 28 образцов, 364 значения сверены с исходными таблицами.", flush=True)


def import_record(filename):
    record_id = re.fullmatch(r"bidmc_(\d{2})_Numerics.csv", filename).group(1)
    raw_path = RAW / "bidmc" / filename
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    if not raw_path.exists():
        raw_path.write_bytes(download(BIDMC + filename))
    raw = raw_path.read_bytes()
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    numerics = []
    for original in reader:
        row = {key.strip(): value for key, value in original.items()}
        numerics.append([number(row[key]) for key in ("Time [s]", "HR", "PULSE", "RESP", "SpO2")])
    assert len(numerics) == 481 and numerics[-1][0] - numerics[0][0] == 480, record_id
    assert all(current[0] - previous[0] == 1 for previous, current in zip(numerics, numerics[1:])), record_id
    signal_name = "bidmc_" + record_id + "_Signals.csv"
    wave_path = RAW / "bidmc" / ("bidmc_" + record_id + "_first10s.json")
    if wave_path.exists():
        waveforms = json.loads(wave_path.read_text())
    else:
        # Загружается только начало потока; исходная частота 125 Гц сохраняется.
        with urllib.request.urlopen(BIDMC + signal_name, timeout=45) as response:
            signal_reader = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8-sig"))
            waveforms = []
            for original in signal_reader:
                row = {key.strip(): value for key, value in original.items()}
                if float(row["Time [s]"]) > 10:
                    break
                waveforms.append([number(row[key]) for key in ("Time [s]", "II", "RESP", "PLETH")])
        save_json(wave_path, waveforms)
    assert len(waveforms) == 1251, record_id
    save_json(OUTPUT / ("bidmc-" + record_id + ".json"), {"id": record_id, "columns": ["seconds", "hr", "pulse", "rr", "spo2"], "numerics": numerics, "waveColumns": ["seconds", "ecg", "resp", "ppg"], "waveforms": waveforms, "waveformHz": 125, "waveformSeconds": 10, "sourceNumerics": BIDMC + filename, "sourceSignals": BIDMC + signal_name, "sha256Numerics": hashlib.sha256(raw).hexdigest()})
    shutil.copyfile(raw_path, OUTPUT / filename)
    return {"id": record_id, "samples": len(numerics), "startSeconds": numerics[0][0], "endSeconds": numerics[-1][0], "durationSeconds": numerics[-1][0] - numerics[0][0], "missingValues": sum(value is None for row in numerics for value in row[1:]), "sha256Numerics": hashlib.sha256(raw).hexdigest()}


def import_bidmc():
    index_html = download(BIDMC).decode()
    filenames = sorted(set(re.findall(r'href="(bidmc_\d{2}_Numerics\.csv)"', index_html)))
    assert len(filenames) == 53, len(filenames)
    with ThreadPoolExecutor(max_workers=6) as pool:
        records = list(pool.map(import_record, filenames))
    license_text = download("https://physionet.org/files/bidmc/1.0.0/LICENSE")
    (OUTPUT / "BIDMC-LICENSE.txt").write_bytes(license_text)
    save_json(OUTPUT / "bidmc-index.json", {"id": "BIDMC", "version": "1.0.0", "source": "https://physionet.org/content/bidmc/1.0.0/", "doi": "10.13026/C2208R", "license": "ODC-By-1.0", "citation": "Pimentel et al. (2017), Toward a Robust Estimation of Respiratory Rate From Pulse Oximeters, IEEE Transactions on Biomedical Engineering, 64(8), 1914-1923.", "records": records})
    print("BIDMC: 53 записи, по 481 числовому отсчету и 10 секунд ECG, дыхания и PPG.", flush=True)


if __name__ == "__main__":
    import_nasa()
    import_bidmc()
