#!/usr/bin/env python3
"""Download WHO Child Growth Standards LMS tables and convert them to JSON.

Source of truth: WHO Child Growth Standards (2006), "expanded tables" in z-score
form (one row per day of age, or per 0.1 cm of length/height). WHO publishes one
workbook per indicator and sex; each sheet holds the LMS parameters used by the
z-score formula in apps/web/src/core/standards/zscore.ts.

Usage
-----
    python scripts/fetch_who_lms.py                     # all 10 files
    python scripts/fetch_who_lms.py --only wfa_boys     # one file
    python scripts/fetch_who_lms.py --force             # ignore cache, re-download
    python scripts/fetch_who_lms.py --out knowledge/growth --cache scripts/.cache/who
    python scripts/fetch_who_lms.py --anchors           # SD anchor fixture only
    python scripts/fetch_who_lms.py --anchors path.json # same, custom destination

Output: ``who_lms_<indicator>_<sex>.json`` per indicator/sex, with provenance
(source URL + SHA-256 of the exact .xlsx bytes that were parsed) and
``verified: false`` — medical review (T005) is a human step and is never
performed by this script.

``--anchors`` writes ``knowledge/growth/who_sd_anchors.json`` instead of the 10
LMS files: a small, *committed* fixture holding the published SD columns for a
few anchor rows. It lets CI verify the z-score engine against WHO's own SD
columns without the gitignored ``scripts/.cache/who/*.xlsx`` workbooks. Values
are copied from the workbooks (cached or freshly downloaded) and every cell is
re-read and compared before the file is written — nothing is typed by hand.

The script fails (exit != 0) when a file is missing, a required column is absent,
L/M/S are non-numeric, M <= 0, S <= 0, dimension values are duplicated or not
contiguous, the table does not cover the expected range, or the LMS parameters do
not reproduce the SD columns shipped in the same WHO workbook.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import math
import os
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

import requests
from openpyxl import load_workbook

REPO_ROOT = Path(__file__).resolve().parents[1]

# WHO publishes every table for a fixed set of age/measure ranges. Used as an
# integrity check on what was downloaded, never as a source of medical values.
AGE_MAX_DAYS = 731  # 0-24 months inclusive, per T004 scope
AGE_MIN_ROWS = AGE_MAX_DAYS + 1  # day 0..731 => 732 rows
WFL_MIN_LENGTH_CM, WFL_MAX_LENGTH_CM = 45.0, 110.0
WFH_MIN_HEIGHT_CM, WFH_MAX_HEIGHT_CM = 65.0, 120.0
MEASURE_STEP_CM = 0.1
Z_CHECK_TOLERANCE = 0.01  # LMS must reproduce WHO SD columns to this precision
SD0_CHECK_TOLERANCE = 0.0015  # SD0 is M rounded to 3 decimals

# key -> (indicator, indicator_name, sex, dimension, value_key, unit, url)
# URLs are the exact "expanded tables" workbooks linked from the WHO indicator
# pages under https://www.who.int/tools/child-growth-standards/standards
_BASE = "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators"
SOURCES: Dict[str, Dict[str, str]] = {
    "wfa_boys": {
        "indicator": "wfa",
        "indicator_name": "weight-for-age",
        "sex": "boys",
        "dimension": "day",
        "value_key": "day",
        "unit": "kg",
        "url": f"{_BASE}/weight-for-age/expanded-tables/wfa-boys-zscore-expanded-tables.xlsx?sfvrsn=65cce121_10",
    },
    "wfa_girls": {
        "indicator": "wfa",
        "indicator_name": "weight-for-age",
        "sex": "girls",
        "dimension": "day",
        "value_key": "day",
        "unit": "kg",
        "url": f"{_BASE}/weight-for-age/expanded-tables/wfa-girls-zscore-expanded-tables.xlsx?sfvrsn=f01bc813_10",
    },
    "lhfa_boys": {
        "indicator": "lhfa",
        "indicator_name": "length/height-for-age",
        "sex": "boys",
        "dimension": "day",
        "value_key": "day",
        "unit": "cm",
        "url": f"{_BASE}/length-height-for-age/expandable-tables/lhfa-boys-zscore-expanded-tables.xlsx?sfvrsn=7b4a3428_12",
    },
    "lhfa_girls": {
        "indicator": "lhfa",
        "indicator_name": "length/height-for-age",
        "sex": "girls",
        "dimension": "day",
        "value_key": "day",
        "unit": "cm",
        "url": f"{_BASE}/length-height-for-age/expandable-tables/lhfa-girls-zscore-expanded-tables.xlsx?sfvrsn=27f1e2cb_10",
    },
    "hcfa_boys": {
        "indicator": "hcfa",
        "indicator_name": "head-circumference-for-age",
        "sex": "boys",
        "dimension": "day",
        "value_key": "day",
        "unit": "cm",
        "url": f"{_BASE}/head-circumference-for-age/expanded-tables/hcfa-boys-zscore-expanded-tables.xlsx?sfvrsn=2ab1bec8_8",
    },
    "hcfa_girls": {
        "indicator": "hcfa",
        "indicator_name": "head-circumference-for-age",
        "sex": "girls",
        "dimension": "day",
        "value_key": "day",
        "unit": "cm",
        "url": f"{_BASE}/head-circumference-for-age/expanded-tables/hcfa-girls-zscore-expanded-tables.xlsx?sfvrsn=3a34b8b0_8",
    },
    "wfl_boys": {
        "indicator": "wfl",
        "indicator_name": "weight-for-length",
        "sex": "boys",
        "dimension": "length_cm",
        "value_key": "lengthCm",
        "unit": "kg",
        "url": f"{_BASE}/weight-for-length-height/expanded-tables/wfl-boys-zscore-expanded-table.xlsx?sfvrsn=d307434f_8",
    },
    "wfl_girls": {
        "indicator": "wfl",
        "indicator_name": "weight-for-length",
        "sex": "girls",
        "dimension": "length_cm",
        "value_key": "lengthCm",
        "unit": "kg",
        "url": f"{_BASE}/weight-for-length-height/expanded-tables/wfl-girls-zscore-expanded-table.xlsx?sfvrsn=db7b5d6b_8",
    },
    "wfh_boys": {
        "indicator": "wfh",
        "indicator_name": "weight-for-height",
        "sex": "boys",
        "dimension": "height_cm",
        "value_key": "heightCm",
        "unit": "kg",
        "url": f"{_BASE}/weight-for-length-height/expanded-tables/wfh-boys-zscore-expanded-tables.xlsx?sfvrsn=ac60cb13_8",
    },
    "wfh_girls": {
        "indicator": "wfh",
        "indicator_name": "weight-for-height",
        "sex": "girls",
        "dimension": "height_cm",
        "value_key": "heightCm",
        "unit": "kg",
        "url": f"{_BASE}/weight-for-length-height/expanded-tables/wfh-girls-zscore-expanded-tables.xlsx?sfvrsn=daac732c_8",
    },
}

# Committed fixture: published SD columns for a few anchor rows. Keys and points
# mirror the datasets exercised by apps/web/src/core/standards/__tests__.
ANCHORS_DEFAULT_PATH = REPO_ROOT / "knowledge" / "growth" / "who_sd_anchors.json"
ANCHOR_POINTS: Dict[str, Tuple[float, ...]] = {
    "wfa_boys": (0, 365, 730),
    "lhfa_boys": (0, 365, 730),
    "wfl_girls": (45, 65, 110),
    "wfh_boys": (65, 90, 120),
}
ANCHORS_COMMENT = (
    "SD anchors extracted verbatim from the WHO Child Growth Standards (2006) "
    "'expanded tables' workbooks by `python3 scripts/fetch_who_lms.py --anchors`. "
    "Committed so CI can verify zFromLMS against WHO's published SD columns "
    "without the gitignored scripts/.cache/who/*.xlsx files. Do not edit by hand."
)

# Header aliases accepted in the first meaningful row of the first sheet.
_DIM_HEADERS = {"day": "day", "length": "length_cm", "height": "height_cm"}
# Dimension column -> field name used in the committed JSON / anchor fixture.
_VALUE_FIELDS = {"day": "day", "length_cm": "lengthCm", "height_cm": "heightCm"}
# Workbook header -> key in the anchor fixture (SD4neg ... SD4).
_SD_COLUMNS: Tuple[Tuple[str, str], ...] = (
    ("SD4NEG", "sd4neg"),
    ("SD3NEG", "sd3neg"),
    ("SD2NEG", "sd2neg"),
    ("SD1NEG", "sd1neg"),
    ("SD0", "sd0"),
    ("SD1", "sd1"),
    ("SD2", "sd2"),
    ("SD3", "sd3"),
    ("SD4", "sd4"),
)
_REQUIRED = ("L", "M", "S")
_DOWNLOAD_TIMEOUT = 120
_USER_AGENT = "Beyeu/1.0 (WHO LMS table importer; +https://www.who.int/tools/child-growth-standards)"


class FetchError(RuntimeError):
    """Raised when a source cannot be downloaded or fails validation."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _looks_like_xlsx(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 1024:
        return False
    try:
        with zipfile.ZipFile(path) as zf:
            return "xl/workbook.xml" in zf.namelist()
    except zipfile.BadZipFile:
        return False


def download(url: str, dest: Path, force: bool = False, timeout: int = _DOWNLOAD_TIMEOUT) -> Tuple[Path, bool]:
    """Return (cached file path, downloaded_now). Cached files are reused unless force."""
    if dest.is_file() and not force and _looks_like_xlsx(dest):
        return dest, False

    dest.parent.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": _USER_AGENT, "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*"}
    try:
        resp = requests.get(url, timeout=timeout, headers=headers, allow_redirects=True)
    except requests.RequestException as exc:  # network/DNS/TLS problems
        raise FetchError(f"download failed: {exc}") from exc

    if resp.status_code != 200:
        raise FetchError(f"HTTP {resp.status_code} for {url}")
    if not resp.content:
        raise FetchError(f"empty response body for {url}")

    # Write atomically so an interrupted run cannot leave a truncated cache file.
    fd, tmp_name = tempfile.mkstemp(dir=str(dest.parent), suffix=".part")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(resp.content)
        tmp_path = Path(tmp_name)
        if not _looks_like_xlsx(tmp_path):
            raise FetchError(f"response is not a valid .xlsx workbook: {url}")
        tmp_path.replace(dest)
    finally:
        Path(tmp_name).unlink(missing_ok=True)
    return dest, True


def _normalise_header(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def read_sheet(xlsx: Path) -> Tuple[Dict[str, int], str, List[Tuple[Any, ...]]]:
    """Locate the header row and return (column index by name, dimension col, data rows)."""
    wb = load_workbook(xlsx, read_only=True, data_only=True)
    try:
        ws = wb[wb.sheetnames[0]]
        rows: List[Tuple[Any, ...]] = []
        header_idx: Optional[Dict[str, int]] = None
        header_row_no = 0

        for row_no, row in enumerate(ws.iter_rows(values_only=True), start=1):
            if header_idx is None:
                cells = [_normalise_header(c).upper() for c in row]
                if all(name in cells for name in _REQUIRED) and any(name in cells for name in ("DAY", "LENGTH", "HEIGHT")):
                    header_idx = {name: cells.index(name) for name in cells if name}
                    header_row_no = row_no
                    continue
                if row_no > 25:
                    break  # no header in the first 25 rows: give up
            else:
                rows.append(row)

        if header_idx is None:
            raise FetchError(f"could not find a header row with L/M/S and Day/Length/Height in {xlsx.name}")

        dimension_col: Optional[str] = None
        for alias in ("DAY", "LENGTH", "HEIGHT"):
            if alias in header_idx:
                dimension_col = _DIM_HEADERS[alias.lower()]
                break
        if dimension_col is None:
            raise FetchError(f"no dimension column (Day/Length/Height) in {xlsx.name}")

        del header_row_no  # only used to bound the header search above
        return header_idx, dimension_col, rows
    finally:
        wb.close()


def _dim_column_index(header_idx: Dict[str, int], dimension_col: str) -> int:
    """Return the column index of the Day/Length/Height column for `dimension_col`."""
    for name, index in header_idx.items():
        if _DIM_HEADERS.get(name.lower()) == dimension_col:
            return index
    raise FetchError(f"no column for dimension {dimension_col}")


def _is_number(value: Any) -> bool:
    if value is None or isinstance(value, bool):
        return False
    try:
        return not math.isnan(float(value)) and not math.isinf(float(value))
    except (TypeError, ValueError):
        return False


def _as_float(value: Any, what: str, row_no: Union[int, float]) -> float:
    if value is None or value == "":
        raise FetchError(f"row {row_no}: missing {what}")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise FetchError(f"row {row_no}: {what} is not numeric ({value!r})") from exc
    if math.isnan(number) or math.isinf(number):
        raise FetchError(f"row {row_no}: {what} is NaN/Inf")
    return number


def build_records(key: str, xlsx: Path) -> Tuple[List[Dict[str, Any]], str, float]:
    """Parse the workbook into JSON records. Returns (records, dimension_col, max_lms_sd_delta)."""
    spec = SOURCES[key]
    header_idx, dimension_col, raw_rows = read_sheet(xlsx)

    if dimension_col != spec["dimension"]:
        raise FetchError(f"{key}: expected dimension {spec['dimension']}, workbook has {dimension_col}")

    dim_col = _dim_column_index(header_idx, dimension_col)
    l_col, m_col, s_col = (header_idx[name] for name in _REQUIRED)
    sd_cols = {name: header_idx[name] for name in ("SD2NEG", "SD2", "SD0") if name in header_idx}

    records: List[Dict[str, Any]] = []
    seen: set = set()
    sd_delta = 0.0

    for offset, row in enumerate(raw_rows):
        row_no = offset + 2  # header is row 1 in practice; only used for messages
        if row is None or all(cell is None for cell in row):
            continue
        raw_dim = row[dim_col] if dim_col < len(row) else None
        if raw_dim is None or raw_dim == "":
            # Trailing empty rows in the expanded sheets; nothing to import.
            continue

        # Footnotes/notes below the table have text in the dimension cell and
        # nothing numeric in L/M/S; anything else non-numeric is a hard error.
        if not _is_number(raw_dim):
            if not any(_is_number(row[idx]) for idx in (l_col, m_col, s_col)):
                continue
            raise FetchError(f"{key}: row {row_no}: {dimension_col} is not numeric ({raw_dim!r})")

        if dimension_col == "day":
            raw_day = _as_float(raw_dim, "day", row_no)
            if abs(raw_day - round(raw_day)) > 1e-9:
                raise FetchError(f"{key}: row {row_no}: day is not an integer ({raw_day})")
            dim_value: Any = int(round(raw_day))
            if dim_value < 0:
                raise FetchError(f"{key}: negative day {dim_value}")
            if dim_value > AGE_MAX_DAYS:
                continue  # WHO tables run to 5 years; T004 scope is 0-24 months
        else:
            dim_value = round(_as_float(raw_dim, dimension_col, row_no), 3)

        if dim_value in seen:
            raise FetchError(f"{key}: duplicate {dimension_col} value {dim_value}")
        seen.add(dim_value)

        L = _as_float(row[l_col], "L", row_no)
        M = _as_float(row[m_col], "M", row_no)
        S = _as_float(row[s_col], "S", row_no)
        if M <= 0:
            raise FetchError(f"{key}: M must be > 0 at {dimension_col}={dim_value} (got {M})")
        if S <= 0:
            raise FetchError(f"{key}: S must be > 0 at {dimension_col}={dim_value} (got {S})")

        # Cross-check the LMS parameters against the SD columns in the same
        # workbook: SD0 must equal M (rounded to 3 dp) and z(SD2+-) must be +-2.
        if sd_cols:
            sd0 = _as_float(row[sd_cols["SD0"]], "SD0", row_no)
            sd_delta = max(sd_delta, abs(round(M, 3) - sd0))
            for name, expected in (("SD2NEG", -2.0), ("SD2", 2.0)):
                if name in sd_cols:
                    z = _z_from_lms(_as_float(row[sd_cols[name]], name, row_no), L, M, S)
                    sd_delta = max(sd_delta, abs(z - expected))

        records.append({spec["value_key"]: dim_value, "L": L, "M": M, "S": S})

    if not records:
        raise FetchError(f"{key}: no data rows after filtering")

    records.sort(key=lambda rec: rec[spec["value_key"]])
    validate_records(key, records, dimension_col)
    if sd_delta > max(Z_CHECK_TOLERANCE, SD0_CHECK_TOLERANCE):
        raise FetchError(f"{key}: LMS does not reproduce the workbook's own SD columns (max delta {sd_delta:.4f})")
    return records, dimension_col, sd_delta


def _z_from_lms(x: float, L: float, M: float, S: float) -> float:
    """WHO LMS z-score (same formula as apps/web/src/core/standards/zscore.ts)."""
    if L == 0:
        return math.log(x / M) / S
    return ((x / M) ** L - 1) / (L * S)


def validate_records(key: str, records: List[Dict[str, Any]], dimension_col: str) -> None:
    value_key = SOURCES[key]["value_key"]
    values = [rec[value_key] for rec in records]

    if len(values) != len(set(values)):
        raise FetchError(f"{key}: duplicated {dimension_col} values")
    if values != sorted(values):
        raise FetchError(f"{key}: {dimension_col} values are not sorted")

    if dimension_col == "day":
        expected = AGE_MAX_DAYS + 1
        if len(records) != expected:
            raise FetchError(f"{key}: expected {expected} rows for day 0..{AGE_MAX_DAYS}, got {len(records)}")
        if values != list(range(AGE_MAX_DAYS + 1)):
            gaps = [d for d in range(AGE_MAX_DAYS + 1) if d not in set(values)]
            raise FetchError(f"{key}: day sequence is not contiguous (first missing {gaps[:3]})")
    else:
        low, high = (WFL_MIN_LENGTH_CM, WFL_MAX_LENGTH_CM) if dimension_col == "length_cm" else (WFH_MIN_HEIGHT_CM, WFH_MAX_HEIGHT_CM)
        expected_rows = int(round((high - low) / MEASURE_STEP_CM)) + 1
        if len(records) != expected_rows:
            raise FetchError(f"{key}: expected {expected_rows} rows at 0.1 cm steps, got {len(records)}")
        steps = [round(values[i + 1] - values[i], 3) for i in range(len(values) - 1)]
        if any(abs(step - MEASURE_STEP_CM) > 1e-6 for step in steps):
            raise FetchError(f"{key}: {dimension_col} values are not spaced by {MEASURE_STEP_CM} cm")
        if abs(values[0] - low) > 1e-6 or abs(values[-1] - high) > 1e-6:
            raise FetchError(f"{key}: {dimension_col} range {values[0]}..{values[-1]} != {low}..{high}")


def build_document(key: str, xlsx: Path, cache_hit: bool) -> Dict[str, Any]:
    spec = SOURCES[key]
    records, dimension_col, sd_delta = build_records(key, xlsx)
    doc: Dict[str, Any] = {
        "indicator": spec["indicator"],
        "indicator_name": spec["indicator_name"],
        "sex": spec["sex"],
        "dimension": dimension_col,
        "unit": spec["unit"],
        "age_max_days": AGE_MAX_DAYS if dimension_col == "day" else None,
        "source_url": spec["url"],
        "source_sha256": _sha256(xlsx),
        "downloaded_at": _dt.date.today().isoformat(),
        "verified": False,
        "data": records,
    }
    doc["_sd_delta"] = round(sd_delta, 5)  # stripped before writing
    doc["_cache_hit"] = cache_hit
    return doc


def write_json(path: Path, document: Dict[str, Any]) -> None:
    payload = {
        "indicator": document["indicator"],
        "indicator_name": document["indicator_name"],
        "sex": document["sex"],
        "dimension": document["dimension"],
        "unit": document["unit"],
        "age_max_days": document["age_max_days"],
        "source_url": document["source_url"],
        "source_sha256": document["source_sha256"],
        "downloaded_at": document["downloaded_at"],
        "verified": document["verified"],
        "data": document["data"],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), suffix=".part")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        Path(tmp_name).replace(path)
    finally:
        Path(tmp_name).unlink(missing_ok=True)


def _anchor_point(dimension_col: str, raw_value: Any, where: str) -> Any:
    """Normalise a Day/Length/Height cell to the value used as a JSON key."""
    number = _as_float(raw_value, dimension_col, 0)
    if dimension_col == "day":
        if abs(number - round(number)) > 1e-9:
            raise FetchError(f"{where}: day is not an integer ({number})")
        return int(round(number))
    return round(number, 3)


def build_anchors_for_key(key: str, xlsx: Path) -> List[Dict[str, Any]]:
    """Extract the anchor rows for `key` (LMS + all 9 published SD columns)."""
    spec = SOURCES[key]
    header_idx, dimension_col, rows = read_sheet(xlsx)
    if dimension_col != spec["dimension"]:
        raise FetchError(f"{key}: expected dimension {spec['dimension']}, workbook has {dimension_col}")

    dim_col = _dim_column_index(header_idx, dimension_col)
    l_col, m_col, s_col = (header_idx[name] for name in _REQUIRED)
    missing = [header for header, _ in _SD_COLUMNS if header not in header_idx]
    if missing:
        raise FetchError(f"{key}: workbook is missing SD column(s): {', '.join(missing)}")

    by_value: Dict[Any, Tuple[Any, ...]] = {}
    for row in rows:
        if row is None or all(cell is None for cell in row):
            continue
        raw_dim = row[dim_col] if dim_col < len(row) else None
        if not _is_number(raw_dim):
            continue  # footnotes / blank trailing rows
        by_value.setdefault(_anchor_point(dimension_col, raw_dim, key), row)

    anchors: List[Dict[str, Any]] = []
    for point in ANCHOR_POINTS[key]:
        wanted = int(point) if dimension_col == "day" else round(float(point), 3)
        row = by_value.get(wanted)
        if row is None:
            raise FetchError(f"{key}: workbook has no row for {dimension_col}={wanted}")

        anchor: Dict[str, Any] = {
            "key": key,
            "indicator": spec["indicator"],
            "sex": spec["sex"],
            "dimension": dimension_col,
            _VALUE_FIELDS[dimension_col]: wanted,
            "L": _as_float(row[l_col], "L", wanted),
            "M": _as_float(row[m_col], "M", wanted),
            "S": _as_float(row[s_col], "S", wanted),
        }
        for header, field in _SD_COLUMNS:
            anchor[field] = _as_float(row[header_idx[header]], header, wanted)
        anchors.append(anchor)
    return anchors


def _verify_anchor_cells(xlsx: Path, anchors: List[Dict[str, Any]]) -> None:
    """Re-open `xlsx` and assert every fixture value equals the cell it came from.

    Deliberately a second, independent pass over the workbook: the fixture must
    never be able to drift from the source values.
    """
    if not anchors:
        raise FetchError(f"{xlsx.name}: no anchors to verify")
    dimension_col = anchors[0]["dimension"]

    wb = load_workbook(xlsx, read_only=True, data_only=True)
    try:
        ws = wb[wb.sheetnames[0]]
        header: Optional[Dict[str, int]] = None
        dim_col: Optional[int] = None
        seen: Dict[Any, Tuple[Any, ...]] = {}

        for row in ws.iter_rows(values_only=True):
            cells = [_normalise_header(cell).upper() for cell in row]
            if header is None:
                if all(name in cells for name in _REQUIRED) and any(
                    name in cells for name in ("DAY", "LENGTH", "HEIGHT")
                ):
                    header = {name: index for index, name in enumerate(cells) if name}
                    dim_col = _dim_column_index(header, dimension_col)
                continue
            if dim_col is None or dim_col >= len(row):
                continue
            raw_dim = row[dim_col]
            if not _is_number(raw_dim):
                continue
            seen.setdefault(_anchor_point(dimension_col, raw_dim, xlsx.name), row)

        if header is None or dim_col is None:
            raise FetchError(f"{xlsx.name}: re-read could not locate the SD header row")

        pairs: List[Tuple[str, int]] = [(name, header[name]) for name in _REQUIRED]
        pairs += [(field, header[column]) for column, field in _SD_COLUMNS]

        for anchor in anchors:
            value = anchor[_VALUE_FIELDS[dimension_col]]
            row = seen.get(value)
            if row is None:
                raise FetchError(f"{xlsx.name}: re-read found no row for {dimension_col}={value}")
            for field, column in pairs:
                expected = float(anchor[field])
                actual = _as_float(row[column], field, value)
                if abs(actual - expected) > 1e-12:
                    raise FetchError(
                        f"{xlsx.name}: {dimension_col}={value} {field}: fixture {expected!r} "
                        f"!= workbook {actual!r}"
                    )
    finally:
        wb.close()


def write_anchors(path: Path, anchors: List[Dict[str, Any]]) -> None:
    payload = {
        "_comment": ANCHORS_COMMENT,
        "source": "WHO Child Growth Standards (2006) expanded tables",
        "generated_by": "scripts/fetch_who_lms.py --anchors",
        "generated_at": _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat(),
        "verified": False,
        "anchors": anchors,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), suffix=".part")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        Path(tmp_name).replace(path)
    finally:
        Path(tmp_name).unlink(missing_ok=True)


def run_anchors(args: argparse.Namespace) -> int:
    """Write the committed SD anchor fixture (cache is reused when present)."""
    dest = Path(args.anchors)
    keys = list(ANCHOR_POINTS)
    total = sum(len(points) for points in ANCHOR_POINTS.values())

    print(f"WHO SD anchors -> {dest}", flush=True)
    print(f"cache: {args.cache}{' (force re-download)' if args.force else ''}", flush=True)
    print(f"anchors: {total} from {len(keys)} workbook(s)", flush=True)
    print(flush=True)

    anchors: List[Dict[str, Any]] = []
    try:
        for key in keys:
            spec = SOURCES[key]
            xlsx, downloaded = download(
                spec["url"], args.cache / f"{key}.xlsx", force=args.force, timeout=args.timeout
            )
            key_anchors = build_anchors_for_key(key, xlsx)
            _verify_anchor_cells(xlsx, key_anchors)
            anchors.extend(key_anchors)
            points = ", ".join(str(anchor[_VALUE_FIELDS[anchor["dimension"]]]) for anchor in key_anchors)
            print(
                f"[ok] {key:<11} {len(key_anchors)} anchors @ {points}"
                f"  cell-verified  {'cache' if not downloaded else 'new'}"
            )
    except FetchError as exc:
        print(f"[FAIL] {exc}", file=sys.stderr, flush=True)
        return 1

    write_anchors(dest, anchors)
    print()
    print(f"wrote {len(anchors)} anchor(s) -> {dest}")
    print("verified=false (pending medical review, T005)")
    return 0


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download WHO LMS expanded tables and convert them to JSON.")
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "knowledge" / "growth", help="output directory for JSON (default: knowledge/growth)")
    parser.add_argument("--cache", type=Path, default=REPO_ROOT / "scripts" / ".cache" / "who", help="directory for downloaded .xlsx cache (default: scripts/.cache/who)")
    parser.add_argument("--force", action="store_true", help="re-download even when a valid cached workbook exists")
    parser.add_argument("--only", default=None, help="comma-separated keys to process, e.g. wfa_boys,hcfa_girls")
    parser.add_argument("--timeout", type=int, default=_DOWNLOAD_TIMEOUT, help=f"per-request timeout in seconds (default: {_DOWNLOAD_TIMEOUT})")
    parser.add_argument(
        "--anchors",
        nargs="?",
        const=ANCHORS_DEFAULT_PATH,
        type=Path,
        default=None,
        metavar="PATH",
        help=(
            "write the committed SD anchor fixture instead of the 10 LMS files "
            f"(default path when no value is given: {ANCHORS_DEFAULT_PATH.relative_to(REPO_ROOT)})"
        ),
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def select_keys(only: Optional[str]) -> List[str]:
    if not only:
        return list(SOURCES)
    wanted = [part.strip() for part in only.split(",") if part.strip()]
    unknown = [key for key in wanted if key not in SOURCES]
    if unknown:
        raise SystemExit(f"unknown key(s): {', '.join(unknown)}\nvalid keys: {', '.join(SOURCES)}")
    return wanted


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    if args.anchors is not None:
        return run_anchors(args)

    keys = select_keys(args.only)
    failures: List[Tuple[str, str]] = []
    report: List[Dict[str, Any]] = []

    print(f"WHO LMS import -> {args.out}", flush=True)
    print(f"cache: {args.cache}{' (force re-download)' if args.force else ''}", flush=True)
    print(f"files: {len(keys)}", flush=True)
    print(flush=True)

    for key in keys:
        spec = SOURCES[key]
        out_path = args.out / f"who_lms_{key}.json"
        try:
            xlsx, downloaded = download(spec["url"], args.cache / f"{key}.xlsx", force=args.force, timeout=args.timeout)
            doc = build_document(key, xlsx, cache_hit=not downloaded)
            write_json(out_path, doc)
            values = [rec[spec["value_key"]] for rec in doc["data"]]
            report.append(
                {
                    "key": key,
                    "rows": len(doc["data"]),
                    "dimension": doc["dimension"],
                    "min": min(values),
                    "max": max(values),
                    "sha": doc["source_sha256"],
                    "sd_delta": doc["_sd_delta"],
                    "cache_hit": doc["_cache_hit"],
                    "path": out_path,
                }
            )
            unit_dim = "day" if doc["dimension"] == "day" else "cm"
            print(
                f"[ok] {key:<11} rows={len(doc['data']):<4} {doc['dimension']} {min(values)}..{max(values)} {unit_dim}"
                f"  sha256={doc['source_sha256'][:12]}  dz={doc['_sd_delta']:.4f}"
                f"  {'cache' if doc['_cache_hit'] else 'new'}"
                f"  -> {out_path}"
            )
        except FetchError as exc:
            failures.append((key, str(exc)))
            print(f"[FAIL] {key:<11} {exc}", file=sys.stderr, flush=True)

    print()
    if report:
        print(f"imported {len(report)}/{len(keys)} file(s)")
        for entry in report:
            print(
                f"  {Path(entry['path']).name:<30} rows={entry['rows']:<4} "
                f"{entry['dimension']} {entry['min']}..{entry['max']}  sha256={entry['sha'][:12]}"
            )
    if failures:
        print(f"{len(failures)} file(s) failed:", file=sys.stderr)
        for key, message in failures:
            detail = message[len(key) + 2:] if message.startswith(f"{key}: ") else message
            print(f"  {key}: {detail}", file=sys.stderr)
        return 1
    print("all requested files imported; verified=false (pending medical review, T005)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
