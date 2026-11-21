"""Kontrak schema + prompt untuk task cv.parse.

Satu sumber kebenaran: dipakai generator dataset, trainer, dan evaluator.
Kunci schema = kunci dataset (docs/ai-training.md). Ubah schema -> dataset baru.
"""

SYS = (
    "Anda mengekstrak data dari SATU bagian CV. Output hanya JSON sesuai schema. "
    "Jangan menambah fakta. Gunakan null bila ragu. "
    "Salin nilai apa adanya, termasuk placeholder seperti [NAMA]."
)

SECTIONS = ("identity", "experiences", "educations", "skills")


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


if __name__ == "__main__":
    # self-check: schema harus bisa diserialisasi dan prompt memuat bagian yang benar
    import json

    for s in SECTIONS:
        json.dumps(SCHEMAS[s])
        p = user_prompt(s, "contoh teks")
        assert f"BAGIAN: {s}" in p and p.startswith("/no_think")
        assert '"type":"object"' in p
    print("schema ok:", ", ".join(SECTIONS))
