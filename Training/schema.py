"""Kontrak schema + prompt untuk task cv.parse.

Satu sumber kebenaran: dipakai generator dataset, trainer, dan evaluator.
Kunci schema = kunci dataset (docs/ai-training.md). Ubah schema -> dataset baru.
"""

import copy
import re

SYS = (
    "Anda mengekstrak data dari SATU bagian CV. Output hanya JSON sesuai schema. "
    "Jangan menambah fakta. Gunakan null bila ragu. "
    "Salin nilai apa adanya, termasuk placeholder seperti [NAMA]. "
    "Tanggal selalu YYYY-MM; jika hanya tahun pakai YYYY-01. "
    "Jika is_current true, end_date harus null. "
    "Isi employment_type, level, years, gpa hanya bila tertulis di CV. "
    "Ambil SEMUA skill dari semua blok keahlian, termasuk tools dan bahasa pemrograman. "
    "Bahasa asing masuk ke bagian languages, bukan skills."
)

SECTIONS = (
    "identity", "experiences", "educations", "skills",
    "certifications", "projects", "languages",
)


def _obj(props, required=None):
    return {
        "type": "object",
        "properties": props,
        "required": required or list(props),
    }


_NULLABLE_STR = {"type": ["string", "null"]}

SCHEMAS = {
    "identity": _obj(
        {
            "identity": _obj(
                {
                    "full_name": _NULLABLE_STR,
                    "headline": _NULLABLE_STR,
                    "summary": _NULLABLE_STR,
                    "email": _NULLABLE_STR,
                    "phone": _NULLABLE_STR,
                    "city": _NULLABLE_STR,
                    "links": {"type": "array", "items": {"type": "string"}},
                }
            )
        }
    ),
    "experiences": _obj(
        {
            "experiences": {
                "type": "array",
                "items": _obj(
                    {
                        "company": {"type": "string"},
                        "title": {"type": "string"},
                        "employment_type": {
                            "type": ["string", "null"],
                            "enum": [
                                "full_time",
                                "part_time",
                                "contract",
                                "internship",
                                "freelance",
                                None,
                            ],
                        },
                        "start_date": _NULLABLE_STR,
                        "end_date": _NULLABLE_STR,
                        "is_current": {"type": "boolean"},
                        "points": {"type": "array", "items": {"type": "string"}},
                    }
                ),
            }
        }
    ),
    "educations": _obj(
        {
            "educations": {
                "type": "array",
                "items": _obj(
                    {
                        "institution": {"type": "string"},
                        "level": {
                            "type": ["string", "null"],
                            "enum": ["SMA", "D3", "S1", "S2", "S3", None],
                        },
                        "major": _NULLABLE_STR,
                        "gpa": {"type": ["number", "null"]},
                        "start_year": {"type": ["integer", "null"]},
                        "end_year": {"type": ["integer", "null"]},
                    }
                ),
            }
        }
    ),
    "skills": _obj(
        {
            "skills": {
                "type": "array",
                "items": _obj(
                    {
                        "name": {"type": "string"},
                        "level": {
                            "type": ["string", "null"],
                            "enum": [
                                "beginner",
                                "intermediate",
                                "advanced",
                                None,
                            ],
                        },
                        "years": {"type": ["number", "null"]},
                    }
                ),
            }
        }
    ),
    "certifications": _obj(
        {
            "certifications": {
                "type": "array",
                "items": _obj(
                    {
                        "name": {"type": "string"},
                        "issuer": _NULLABLE_STR,
                        "issue_date": _NULLABLE_STR,
                        "expiry_date": _NULLABLE_STR,
                        "credential_id": _NULLABLE_STR,
                        "achievements": {"type": "array", "items": {"type": "string"}},
                    }
                ),
            }
        }
    ),
    "projects": _obj(
        {
            "projects": {
                "type": "array",
                "items": _obj(
                    {
                        "name": {"type": "string"},
                        "role": _NULLABLE_STR,
                        "organization": _NULLABLE_STR,
                        "start_date": _NULLABLE_STR,
                        "end_date": _NULLABLE_STR,
                        "outcome": _NULLABLE_STR,
                        "points": {"type": "array", "items": {"type": "string"}},
                    }
                ),
            }
        }
    ),
    "languages": _obj(
        {
            "languages": {
                "type": "array",
                "items": _obj(
                    {
                        "name": {"type": "string"},
                        "proficiency": {
                            "type": ["string", "null"],
                            "enum": [
                                "native", "fluent", "professional_working",
                                "intermediate", "basic", None,
                            ],
                        },
                    }
                ),
            }
        }
    ),
}


def user_prompt(section: str, chunk: str) -> str:
    import json

    schema = json.dumps(SCHEMAS[section], separators=(",", ":"), ensure_ascii=False)
    return (
        "/no_think\n"
        f"BAGIAN: {section}\n"
        f"SCHEMA: {schema}\n"
        'TEKS CV:\n"""\n'
        f"{chunk.strip()}\n"
        '"""'
    )


def task_name(section: str) -> str:
    return f"cv_extract_{section}"


# ---------------------------------------------------------------- normalizer
MONTHS = {
    "januari": 1, "january": 1, "jan": 1,
    "februari": 2, "february": 2, "feb": 2,
    "maret": 3, "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "mei": 5, "may": 5,
    "juni": 6, "june": 6, "jun": 6,
    "juli": 7, "july": 7, "jul": 7,
    "agustus": 8, "august": 8, "agu": 8, "aug": 8,
    "september": 9, "sep": 9,
    "oktober": 10, "october": 10, "okt": 10, "oct": 10,
    "november": 11, "nov": 11,
    "desember": 12, "december": 12, "des": 12, "dec": 12,
}
NOW_WORDS = {"present", "sekarang", "saat ini", "current", "now", "ongoing"}
DATE_FIELDS = ("start_date", "end_date", "issue_date", "expiry_date")


def to_yyyymm(value):
    """'February 2026' / '2025' / '02/2026' -> 'YYYY-MM'. Tak dikenali -> apa adanya."""
    if not isinstance(value, str):
        return value
    s = value.strip().lower().replace(".", "")
    if s in NOW_WORDS:
        return None
    m = re.match(r"(\d{4})-(\d{1,2})", s)
    if m and 1 <= int(m.group(2)) <= 12:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    m = re.match(r"([a-z]+)\s+(\d{4})", s)
    if m and m.group(1) in MONTHS:
        return f"{m.group(2)}-{MONTHS[m.group(1)]:02d}"
    m = re.match(r"(\d{1,2})[/-](\d{4})", s)
    if m and 1 <= int(m.group(1)) <= 12:
        return f"{m.group(2)}-{int(m.group(1)):02d}"
    m = re.match(r"(\d{4})$", s)
    if m:
        return f"{m.group(1)}-01"
    return value


def normalize(section, obj):
    """Perbaikan deterministik output model: tanggal + konsistensi is_current."""
    obj = copy.deepcopy(obj)
    body = obj.get(section) if isinstance(obj, dict) else None
    if isinstance(body, list):
        for item in body:
            if not isinstance(item, dict):
                continue
            for field in DATE_FIELDS:
                if field in item:
                    item[field] = to_yyyymm(item[field])
            if isinstance(item.get("issuer"), str):
                item["issuer"] = re.sub(
                    r"^(by|issued by)\s+", "", item["issuer"], flags=re.I
                ).strip()
            if item.get("is_current"):
                item["end_date"] = None
    elif isinstance(body, dict):
        for field in DATE_FIELDS:
            if field in body:
                body[field] = to_yyyymm(body[field])
    return obj


EMPLOYMENT_WORDS = {
    "full-time", "full time", "part-time", "part time", "contract", "kontrak",
    "internship", "intern", "magang", "freelance", "freelancer",
}
LEVEL_WORDS = ("beginner", "intermediate", "advanced", "expert", "pemula", "mahir", "lanjutan")
DURATION_WORDS = ("tahun", "years", "year", "yrs", "thn")


def _near(lines, needle):
    """Hanya baris yang menyebut nilai. Kalau tak ketemu -> kosong (= tak ada bukti)."""
    n = re.sub(r"\s+", " ", str(needle or "")).strip().lower()
    for line in lines:
        if n and n in line:
            return line
    return ""


def _around(cv_text, needle, span=150):
    """Potong teks di sekitar nama perusahaan: tipe kerja sering di baris berikutnya."""
    n = re.sub(r"\s+", " ", str(needle or "")).strip().lower()
    hay = re.sub(r"\s+", " ", cv_text).lower()
    i = hay.find(n)
    return hay[i : i + len(n) + span] if i >= 0 else ""


def enforce_grounding(section, obj, cv_text):
    """Confidence gate sederhana: metadata yang tidak tertulis di CV jadi null.

    Ini menangani kebiasaan model mengarang employment_type/level/years walau
    prompt sudah melarang. Fakta dihapus, bukan ditambah — aman untuk halusinasi.
    """
    obj = copy.deepcopy(obj)
    body = obj.get(section) if isinstance(obj, dict) else None
    if not isinstance(body, list):
        return obj
    lines = [re.sub(r"\s+", " ", ln).strip().lower() for ln in cv_text.splitlines() if ln.strip()]

    for item in body:
        if not isinstance(item, dict):
            continue
        if section == "experiences" and item.get("employment_type"):
            snippet = _around(cv_text, item.get("company"))
            if not any(word in snippet for word in EMPLOYMENT_WORDS):
                item["employment_type"] = None
        elif section == "skills":
            snippet = _near(lines, item.get("name"))
            if item.get("level") and not any(word in snippet for word in LEVEL_WORDS):
                item["level"] = None
            if item.get("years") is not None and not any(
                word in snippet for word in DURATION_WORDS
            ):
                item["years"] = None
    return obj


if __name__ == "__main__":
    # self-check: schema harus bisa diserialisasi dan prompt memuat bagian yang benar
    import json

    for s in SECTIONS:
        json.dumps(SCHEMAS[s])
        p = user_prompt(s, "contoh teks")
        assert f"BAGIAN: {s}" in p and p.startswith("/no_think")
        assert '"type":"object"' in p
    assert to_yyyymm("February 2026") == "2026-02"
    assert to_yyyymm("Mei 2022") == "2022-05"
    assert to_yyyymm("2025") == "2025-01"
    assert to_yyyymm("02/2026") == "2026-02"
    assert to_yyyymm("Present") is None
    assert to_yyyymm("2022-3") == "2022-03"
    fixed = normalize("experiences", {"experiences": [{
        "start_date": "January 2024", "end_date": "March 2025", "is_current": True}]})
    assert fixed["experiences"][0]["start_date"] == "2024-01"
    assert fixed["experiences"][0]["end_date"] is None
    cert = normalize("certifications", {"certifications": [{"issuer": "by Digital Skola"}]})
    assert cert["certifications"][0]["issuer"] == "Digital Skola"
    cv = (
        "Brand Manager | Beyondjersey.id | February 2026\n"
        " - Manage daily business operations, order processing, and shipping coordination for the team\n"
        " - Conduct market research to understand customer needs across several market segments\n"
        "Field Assistant | PTPN | June 2025 | Internship\n"
        "Python (Advanced), 3 years of R\n"
        "Excel\n"
        "Git\n"
    )
    exp = enforce_grounding("experiences", {"experiences": [
        {"company": "Beyondjersey.id", "employment_type": "full_time"},
        {"company": "PTPN", "employment_type": "internship"}]}, cv)
    assert exp["experiences"][0]["employment_type"] is None
    assert exp["experiences"][1]["employment_type"] == "internship"
    sk = enforce_grounding("skills", {"skills": [
        {"name": "Python", "level": "advanced", "years": 3},
        {"name": "Excel", "level": "advanced", "years": 1}]}, cv)
    assert sk["skills"][0] == {"name": "Python", "level": "advanced", "years": 3}
    assert sk["skills"][1] == {"name": "Excel", "level": None, "years": None}
    print("schema ok:", ", ".join(SECTIONS))
