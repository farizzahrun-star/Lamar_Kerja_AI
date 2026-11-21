"""Tes cepat CV sendiri: PDF/DOCX/TXT -> JSON per bagian + cek grounding.

    python3 -m pip install --user pypdf
    python3 Training/eval/try_cv.py ~/Documents/cv-saya.pdf --model qwen3:4b

Tidak ada ground truth di sini — penilaian manual. Yang otomatis dicek:
field teks yang tidak muncul di CV ditandai `ungrounded` (= model mengarang).
Hasil disimpan di Training/results/ (gitignored): jangan commit isi CV.

ponytail: seluruh teks CV dikirim ke tiap bagian, tanpa potong heading. Deteksi
heading rapuh dan CV pribadi muat num_ctx 8192. Potong per bagian saat CV >8000
token (CV 4+ halaman).
"""

import argparse
import json
import re
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from schema import SCHEMAS, SECTIONS, SYS, user_prompt  # noqa: E402
from score import flatten, norm  # noqa: E402

# hanya field bebas-teks yang masuk akal dicek substring; tanggal/gpa/angka dilewati
TEXT_NAMES = {
    "full_name", "headline", "company", "title", "institution", "major", "name", "points",
}
MIN_CHARS = 50


def from_pdf(path):
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("pypdf belum ada. Jalankan: python3 -m pip install --user pypdf")
    return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)


def from_docx(path):
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
    xml = re.sub(r"</w:p>", "\n", xml)
    return re.sub(r"<[^>]+>", "", xml)


def extract(path):
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return from_pdf(path)
    if suffix == ".docx":
        return from_docx(path)
    if suffix in (".txt", ".md"):
        return path.read_text(encoding="utf-8", errors="ignore")
    sys.exit(f"format {suffix} belum didukung. Simpan CV sebagai PDF, DOCX, atau TXT.")


def ask(host, model, section, cv_text):
    payload = {
        "model": model,
        "think": False,
        "stream": False,
        "format": SCHEMAS[section],
        "options": {"temperature": 0, "num_ctx": 8192, "num_predict": 1024, "top_p": 0.9},
        "messages": [
            {"role": "system", "content": SYS},
            {"role": "user", "content": user_prompt(section, cv_text)},
        ],
    }
    req = urllib.request.Request(
        f"{host}/api/chat",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    body = json.load(urllib.request.urlopen(req, timeout=600))
    return body["message"]["content"]


def ungrounded(section, parsed, cv_text):
    """Field teks yang nilainya tidak ada di CV = kandidat halusinasi."""
    haystack = norm(cv_text)
    out = []
    for path, value in flatten(section, parsed).items():
        name = path.rsplit(".", 1)[-1].split("[")[0]
        if name in TEXT_NAMES and isinstance(value, str) and norm(value) not in haystack:
            out.append(f"{path} = {value!r}")
    return out


def run(path, model, host, out_path):
    raw = extract(path)
    cv_text = re.sub(r"[ \t]+", " ", raw).strip()
    if len(cv_text) < MIN_CHARS:
        sys.exit(
            f"teks CV cuma {len(cv_text)} karakter -> status skipped (kemungkinan PDF scan). "
            "Tidak dikirim ke model, sesuai docs/ai-training.md."
        )

    report = {"file": str(path), "model": model, "chars": len(cv_text), "sections": {}}
    print(f"{path.name}: {len(cv_text)} karakter, model {model}\n")
    print(f"{'bagian':<12} {'field':>5} {'ungrounded':>10} {'detik':>6}")
    print("-" * 38)
    for section in SECTIONS:
        started = time.time()
        try:
            parsed = json.loads(ask(host, model, section, cv_text))
        except Exception as exc:  # noqa: BLE001
            print(f"{section:<12} FAIL: {type(exc).__name__}: {exc}")
            report["sections"][section] = {"error": f"{type(exc).__name__}: {exc}"}
            continue
        bad = ungrounded(section, parsed, cv_text)
        seconds = round(time.time() - started, 1)
        fields = len(flatten(section, parsed))
        print(f"{section:<12} {fields:>5} {len(bad):>10} {seconds:>6}")
        report["sections"][section] = {
            "parsed": parsed,
            "ungrounded": bad,
            "latency_s": seconds,
        }
        if bad:
            for item in bad:
                print(f"  ! {item}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    total_bad = sum(len(s.get("ungrounded", [])) for s in report["sections"].values())
    print(f"\nhasil -> {out_path}")
    print(f"{'OK: semua field didukung teks CV' if not total_bad else f'{total_bad} field perlu dicek manual'}")
    print("Cek manual: null dipakai saat data tidak ada, tanggal YYYY-MM, is_current sesuai CV.")


def selftest():
    cv = "PENGALAMAN KERJA\n[PERUSAHAAN] | Software Engineer | 2022 - Sekarang\n - Menulis API"
    ok = {"experiences": [{"company": "[PERUSAHAAN]", "title": "Software Engineer",
                           "employment_type": None, "start_date": "2022-01", "end_date": None,
                           "is_current": True, "points": ["Menulis API"]}]}
    assert ungrounded("experiences", ok, cv) == []
    bad = json.loads(json.dumps(ok))
    bad["experiences"][0]["company"] = "PT Karangan Abadi"
    bad["experiences"][0]["points"].append("Memimpin 50 orang")
    assert ungrounded("experiences", bad, cv) == [
        "experiences[0].company = 'PT Karangan Abadi'",
        "experiences[0].points[1] = 'Memimpin 50 orang'",
    ]
    assert ungrounded("skills", {"skills": []}, cv) == []
    print("selftest ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cv", nargs="?", help="path CV (.pdf/.docx/.txt)")
    ap.add_argument("--model", default="qwen3:4b")
    ap.add_argument("--host", default="http://localhost:11434")
    ap.add_argument("--out", help="default: Training/results/try-<namafile>.json")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if not a.cv:
        ap.error("path CV wajib diisi (atau pakai --selftest)")
    path = Path(a.cv).expanduser()
    if not path.exists():
        sys.exit(f"file tidak ada: {path}")
    out = Path(a.out) if a.out else HERE.parent / "results" / f"try-{path.stem}.json"
    run(path, a.model, a.host, out)


if __name__ == "__main__":
    main()
