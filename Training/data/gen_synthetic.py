"""Generator dataset sintetis (deterministik, tanpa LLM, tanpa biaya).

Satu baris = satu bagian CV. Input-output dianonimisasi dengan pemetaan yang sama
([NAMA], [PERUSAHAAN], [KAMPUS], [KOTA], [EMAIL], [TELEPON], [PROFIL]).

Split per CV sumber (bukan acak antar baris): train 80 / val 10 / test 10.

    python Training/data/gen_synthetic.py --cvs 400 --out Training/data

ponytail: template pool sengaja kecil; ceiling = model belajar pola template,
bukan kekacauan CV nyata. Ganti dengan CV consented (ADR-025) saat tersedia.
"""

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from schema import SYS, task_name, user_prompt  # noqa: E402

TITLES = [
    "Software Engineer",
    "Backend Engineer",
    "Frontend Developer",
    "Data Analyst",
    "QA Engineer",
    "Marketing Staff",
    "Finance Staff",
    "HR Officer",
    "Graphic Designer",
    "Operations Staff",
    "Sales Executive",
    "Customer Support",
]

MAJORS = [
    "Teknik Informatika",
    "Sistem Informasi",
    "Ilmu Komputer",
    "Manajemen",
    "Akuntansi",
    "Psikologi",
    "Desain Komunikasi Visual",
    "Teknik Industri",
]

SKILLS = [
    "Python", "JavaScript", "TypeScript", "SQL", "Excel", "Figma", "Docker",
    "Git", "React", "Node.js", "Tableau", "Canva", "Adobe Illustrator",
    "Komunikasi", "Negosiasi", "Manajemen Proyek", "Public Speaking",
]

HEADLINES = {
    "id": {
        "fresh": ["Fresh Graduate {major}", "Lulusan Baru {major}", "Junior {title}"],
        "mid": ["{title} dengan 3 tahun pengalaman", "{title}"],
        "senior": ["Senior {title}", "{title} | 8 tahun pengalaman"],
    },
    "en": {
        "fresh": ["Fresh Graduate in {major}", "Junior {title}"],
        "mid": ["{title} with 3 years of experience", "{title}"],
        "senior": ["Senior {title}", "{title} | 8 years of experience"],
    },
}

BULLETS = {
    "id": [
        "Mengembangkan dan memelihara modul layanan internal",
        "Menangani 40+ tiket dukungan pengguna per minggu",
        "Menyusun laporan bulanan untuk manajemen",
        "Melakukan pengujian regresi sebelum rilis",
        "Meningkatkan waktu muat halaman sekitar 30%",
        "Mengoordinasikan tim lintas fungsi berisi 5 orang",
    ],
    "en": [
        "Built and maintained internal service modules",
        "Handled 40+ user support tickets per week",
        "Prepared monthly reports for management",
        "Performed regression testing before release",
        "Improved page load time by about 30%",
        "Coordinated a cross-functional team of 5 people",
    ],
}

MONTHS = {
    "id": ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
}

NOW = {"id": "Sekarang", "en": "Present"}
EMPLOYMENT = {
    "id": {
        "full_time": "Full-time",
        "part_time": "Part-time",
        "contract": "Kontrak",
        "internship": "Magang",
        "freelance": "Freelance",
    },
    "en": {
        "full_time": "Full-time",
        "part_time": "Part-time",
        "contract": "Contract",
        "internship": "Internship",
        "freelance": "Freelance",
    },
}
LEVELS = {"id": ["SMA", "D3", "S1", "S1", "S2"], "en": ["SMA", "D3", "S1", "S1", "S2"]}


def _date(rng, lang, only_year=False):
    y, m = rng.randint(2012, 2024), rng.randint(1, 12)
    return y, m, (str(y) if only_year else f"{MONTHS[lang][m - 1]} {y}")


def make_cv(rng, idx):
    """Return (chunks: dict[section -> teks], truth: dict[section -> obj])."""
    lang = rng.choices(["id", "en", "mix"], weights=[50, 20, 30])[0]
    persona = rng.choices(["fresh", "mid", "senior"], weights=[25, 40, 35])[0]
    messy = rng.random() < 0.15
    has_skills = rng.random() > 0.08
    has_edu = rng.random() > 0.08
    only_year_dates = rng.random() < 0.15
    main_lang = "id" if lang in ("id", "mix") else "en"

    title = rng.choice(TITLES)
    major = rng.choice(MAJORS)
    headline = rng.choice(HEADLINES[main_lang][persona]).format(title=title, major=major)

    # ---------- identity ----------
    lines = ["CURRICULUM VITAE", "[NAMA]", headline]
    contact = ["[KOTA]", "[EMAIL]"]
    has_phone = rng.random() > 0.2
    if has_phone:
        contact.append("[TELEPON]")
    has_link = rng.random() > 0.35
    if has_link:
        contact.append("https://[PROFIL]")
    lines.append(" | ".join(contact))
    identity_truth = {
        "identity": {
            "full_name": "[NAMA]",
            "headline": headline,
            "email": "[EMAIL]",
            "phone": "[TELEPON]" if has_phone else None,
            "city": "[KOTA]",
            "links": ["https://[PROFIL]"] if has_link else [],
        }
    }
    header = "\n".join(lines)

    # ---------- experiences ----------
    n_exp = {"fresh": rng.randint(1, 2), "mid": rng.randint(2, 3), "senior": rng.randint(3, 4)}[persona]
    exp_truth, exp_lines = [], []
    year_cursor = 2024
    for k in range(n_exp):
        etype = "internship" if (persona == "fresh" and k == 0) else rng.choice(
            ["full_time", "full_time", "contract", "freelance", "part_time"]
        )
        sy, sm, s_txt = _date(rng, main_lang, only_year_dates)
        sy = min(sy, year_cursor - 1)
        s_txt = f"{sy}" if only_year_dates else f"{MONTHS[main_lang][sm - 1]} {sy}"
        current = k == 0 and rng.random() > 0.55
        if current:
            end_txt, end_val, is_current, ey = NOW[main_lang], None, True, None
        else:
            ey = sy + rng.randint(1, 3)
            ey = min(ey, 2025)
            em = rng.randint(1, 12)
            end_txt = f"{ey}" if only_year_dates else f"{MONTHS[main_lang][em - 1]} {ey}"
            end_val, is_current = f"{ey}-{em:02d}", False
        year_cursor = sy
        bullets = rng.sample(BULLETS[main_lang], rng.randint(2, 4))
        exp_truth.append(
            {
                "company": "[PERUSAHAAN]",
                "title": title if k == 0 else rng.choice(TITLES),
                "employment_type": etype,
                "start_date": f"{sy}-{sm:02d}" if not only_year_dates else f"{sy}-01",
                "end_date": end_val,
                "is_current": is_current,
                "points": bullets,
            }
        )
        exp_lines.append(
            "[PERUSAHAAN] | {} | {} | {} - {}".format(
                exp_truth[-1]["title"], EMPLOYMENT[main_lang][etype], s_txt, end_txt
            )
        )
        exp_lines.extend(f" - {b}" for b in bullets)
        exp_lines.append("")
    exp_chunk = "PENGALAMAN KERJA\n" + "\n".join(exp_lines).strip()

    # ---------- educations ----------
    edu_truth, edu_lines = [], []
    if has_edu:
        level = rng.choice(LEVELS[main_lang])
        sy = rng.randint(2012, 2020)
        ongoing = rng.random() < 0.08
        ey = None if ongoing else sy + {"SMA": 3, "D3": 3, "S1": 4, "S2": 2}[level]
        has_gpa = level != "SMA" and rng.random() > 0.25
        gpa = round(rng.uniform(2.9, 3.95), 2) if has_gpa else None
        year_txt = f"{sy} - {'Sekarang' if ongoing and main_lang == 'id' else ('Present' if ongoing else ey)}"
        parts = ["[KAMPUS]", f"{level} {major}"]
        if gpa:
            parts.append(f"IPK {gpa}" if main_lang == "id" else f"GPA {gpa}")
        edu_lines.append(" | ".join(parts))
        edu_lines.append(year_txt)
        edu_truth.append(
            {
                "institution": "[KAMPUS]",
                "level": level,
                "major": major,
                "gpa": gpa,
                "start_year": sy,
                "end_year": None if ongoing else ey,
            }
        )
    # contoh negatif: pendidikan tidak ada di CV
    edu_chunk = "PENDIDIKAN\n" + "\n".join(edu_lines) if edu_lines else header

    # ---------- skills ----------
    skill_truth, skill_lines = [], []
    if has_skills:
        for name in rng.sample(SKILLS, rng.randint(4, 8)):
            has_level = rng.random() > 0.4
            level = rng.choice(["beginner", "intermediate", "advanced"]) if has_level else None
            years = rng.choice([1, 2, 3, 5, None]) if rng.random() > 0.7 else None
            label = {"beginner": "Beginner", "intermediate": "Intermediate", "advanced": "Advanced"}
            meta = [label[level]] if has_level else []
            if years:
                meta.append(f"{years} thn" if main_lang == "id" else f"{years} yrs")
            skill_lines.append(f"{name} ({', '.join(meta)})" if meta else name)
            skill_truth.append({"name": name, "level": level, "years": years})
    skill_chunk = "KEAHLIAN\n" + "\n".join(skill_lines) if skill_lines else header

    if messy:
        # kolom ganda + footer halaman: uji ketahanan ekstraksi teks
        exp_chunk = "Halaman 1/2\n" + exp_chunk.replace(" | ", "\t")
        skill_chunk = "Halaman 2/2\n" + skill_chunk.replace("\n", "  ")

    return (
        {
            "identity": header,
            "experiences": exp_chunk,
            "educations": edu_chunk,
            "skills": skill_chunk,
        },
        {
            "identity": identity_truth,
            "experiences": {"experiences": exp_truth},
            "educations": {"educations": edu_truth},
            "skills": {"skills": skill_truth},
        },
    )


def _audit(section, chunk, truth, row_id):
    """Anti-halusinasi: setiap fakta di ground truth wajib tertulis di input."""
    items = truth[section] if isinstance(truth[section], list) else [truth[section]]
    for item in items:
        if section == "skills":
            assert item["name"].lower() in chunk, f"{row_id}: skill {item['name']} tidak ada di teks"
            if item["years"] is not None:
                assert f"{item['years']} " in chunk, f"{row_id}: years {item['years']} tidak ada"
        for key in ("company", "institution", "major", "title", "headline"):
            val = item.get(key)
            if val:
                assert val.lower() in chunk, f"{row_id}: {key} '{val}' tidak ada di teks"
        for point in item.get("points", []):
            assert point.lower() in chunk, f"{row_id}: point tidak ada di teks"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cvs", type=int, default=400)
    ap.add_argument("--seed", type=int, default=3407)
    ap.add_argument("--out", default=str(Path(__file__).parent))
    ap.add_argument("--prefix", default="dataset-cv-v1")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    ids = list(range(args.cvs))
    rng.shuffle(ids)
    n_val = max(1, args.cvs // 10)
    n_test = max(1, args.cvs // 10)
    split_of = {i: "train" for i in ids}
    for i in ids[:n_test]:
        split_of[i] = "test"
    for i in ids[n_test : n_test + n_val]:
        split_of[i] = "val"

    rows = {"train": [], "val": [], "test": []}
    for i in range(args.cvs):
        chunks, truth = make_cv(rng, i)
        for section, chunk in chunks.items():
            rows[split_of[i]].append(
                {
                    "id": f"cv-{i:04d}-{section}",
                    "task": task_name(section),
                    "section": section,
                    "messages": [
                        {"role": "system", "content": SYS},
                        {"role": "user", "content": user_prompt(section, chunk)},
                        {
                            "role": "assistant",
                            "content": json.dumps(
                                truth[section], separators=(",", ":"), ensure_ascii=False
                            ),
                        },
                    ],
                }
            )

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for split, data in rows.items():
        path = out / f"{args.prefix}-{split}.jsonl"
        with path.open("w", encoding="utf-8") as f:
            for row in data:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"{path} : {len(data)} baris")

    # self-check: tidak ada CV yang bocor ke dua split, output JSON valid per schema
    seen = {}
    for split, data in rows.items():
        for row in data:
            cv = row["id"].rsplit("-", 1)[0]
            assert seen.setdefault(cv, split) == split, f"{cv} bocor ke {split}"
            truth = json.loads(row["messages"][-1]["content"])
            chunk = row["messages"][1]["content"].lower()
            assert json.dumps(truth)
            _audit(row["section"], chunk, truth, row["id"])
    print(f"ok: {args.cvs} CV terpisah per sumber, total {sum(map(len, rows.values()))} contoh")


if __name__ == "__main__":
    main()
