"""Harness evaluasi cv.parse: field-level P/R/F1, schema validity, hallucination.

    # 1. jalankan model pada test set (Ollama lokal, CPU)
    python Training/eval/score.py predict --ref Training/data/dataset-cv-v1-test.jsonl \
        --model qwen3:4b --out preds-qwen3.jsonl

    # 2. hitung metrik
    python Training/eval/score.py score --ref Training/data/dataset-cv-v1-test.jsonl \
        --pred preds-qwen3.jsonl --out results/2026-11-20-baseline.json

Ambang Phase 1 ada di docs/ai-training.md (F1 >= 0.82, hallucination <= 2%,
schema_validity >= 98%). predict butuh Ollama hidup di localhost:11434.

ponytail: item list dicocokkan per index, bukan optimal assignment; cukup untuk
mendeteksi regresi. Upgrade ke Hungarian matching kalau false-negative jadi isu.
"""

import argparse
import json
import math
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from schema import SCHEMAS, SECTIONS  # noqa: E402

SYNONYMS = {
    "js": "javascript", "reactjs": "react", "node": "node.js", "nodejs": "node.js",
    "ts": "typescript", "postgres": "postgresql", "excel": "ms excel",
    "gpa": "ipk",
}
FUZZY_FIELDS = {"company", "institution"}
NUMERIC_FIELDS = {"gpa", "years", "start_year", "end_year"}


def norm(value):
    s = str(value).lower().strip()
    s = SYNONYMS.get(s, s)
    s = re.sub(r"[^\w\[\]\s./#+-]", " ", s)
    return re.sub(r"\s+", " ", s).strip(" .-/#+")


def token_overlap(a, b):
    ta, tb = set(norm(a).split()), set(norm(b).split())
    return len(ta & tb) / max(1, len(tb))


def months(yyyy_mm):
    m = re.match(r"(\d{4})-(\d{2})", str(yyyy_mm))
    return int(m.group(1)) * 12 + int(m.group(2)) if m else None


def flatten(section, obj):
    """JSON model -> {path: value}. Null/array kosong dibuang (tidak dinilai)."""
    out = {}
    if not isinstance(obj, dict) or section not in obj:
        return out
    body = obj[section]
    if section == "identity":
        for k, v in (body or {}).items():
            if k == "links":
                for i, link in enumerate(v or []):
                    out[f"identity.links[{i}]"] = link
            elif v not in (None, "", []):
                out[f"identity.{k}"] = v
        return out
    if not isinstance(body, list):
        return out
    for i, item in enumerate(body):
        if not isinstance(item, dict):
            continue
        for k, v in item.items():
            if k == "points":
                for j, point in enumerate(v or []):
                    out[f"{section}[{i}].points[{j}]"] = point
            elif k == "is_current":
                out[f"{section}[{i}].is_current"] = bool(v)
            elif v not in (None, "", []):
                out[f"{section}[{i}].{k}"] = v
    return out


def same(field, pred, truth):
    name = field.rsplit(".", 1)[-1].split("[")[0]
    if name in NUMERIC_FIELDS:
        try:
            return abs(float(pred) - float(truth)) <= (0.05 if name == "gpa" else 0)
        except (TypeError, ValueError):
            return False
    if name == "is_current":
        return bool(pred) == bool(truth)
    if name in ("start_date", "end_date"):
        a, b = months(pred), months(truth)
        if a is None or b is None:
            return norm(pred) == norm(truth)
        return abs(a - b) <= (1 if name == "end_date" else 0)
    if name in FUZZY_FIELDS:
        return token_overlap(pred, truth) >= 0.85
    return norm(pred) == norm(truth)


def valid_section(section, obj):
    if not isinstance(obj, dict) or section not in obj:
        return False
    body = obj[section]
    return isinstance(body, (dict, list))


def cv_text(user_content):
    return user_content.split('"""')[1] if '"""' in user_content else user_content


def score(ref_path, pred_path, out_path=None):
    ref = {}
    with open(ref_path, encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            ref[row["id"]] = {
                "section": row["section"],
                "truth": json.loads(row["messages"][-1]["content"]),
                "cv": norm(cv_text(row["messages"][1]["content"])),
            }

    agg = {s: {"pred": 0, "truth": 0, "hit": 0, "hall": 0, "n": 0, "valid": 0}
           for s in SECTIONS}
    latencies = []
    with open(pred_path, encoding="utf-8") as f:
        for line in f:
            p = json.loads(line)
            if p["id"] not in ref:
                continue
            item = ref[p["id"]]
            s = item["section"]
            a = agg[s]
            a["n"] += 1
            if p.get("latency_ms"):
                latencies.append(p["latency_ms"])
            obj = p.get("parsed")
            if not valid_section(s, obj):
                continue
            a["valid"] += 1
            pred = flatten(s, obj)
            truth = flatten(s, item["truth"])
            a["pred"] += len(pred)
            a["truth"] += len(truth)
            for field, value in pred.items():
                if field in truth and same(field, value, truth[field]):
                    a["hit"] += 1
                elif norm(value) not in item["cv"]:
                    a["hall"] += 1  # field tak didukung teks CV
            for field in truth:
                if field in pred and same(field, pred[field], truth[field]):
                    continue

    total = {"pred": 0, "truth": 0, "hit": 0, "hall": 0, "n": 0, "valid": 0}
    report = {"per_section": {}}
    for s, a in agg.items():
        for k in total:
            total[k] += a[k]
        p = a["hit"] / a["pred"] if a["pred"] else 0.0
        r = a["hit"] / a["truth"] if a["truth"] else 0.0
        f1 = 2 * p * r / (p + r) if p + r else 0.0
        report["per_section"][s] = {
            "n": a["n"],
            "schema_validity": round(a["valid"] / a["n"], 4) if a["n"] else 0.0,
            "precision": round(p, 4),
            "recall": round(r, 4),
            "f1": round(f1, 4),
            "hallucination_rate": round(a["hall"] / a["pred"], 4) if a["pred"] else 0.0,
            "omission_rate": round(1 - r, 4),
        }

    p = total["hit"] / total["pred"] if total["pred"] else 0.0
    r = total["hit"] / total["truth"] if total["truth"] else 0.0
    latencies.sort()
    report["overall"] = {
        "n": total["n"],
        "schema_validity": round(total["valid"] / total["n"], 4) if total["n"] else 0.0,
        "precision": round(p, 4),
        "recall": round(r, 4),
        "field_f1": round(2 * p * r / (p + r), 4) if p + r else 0.0,
        "hallucination_rate": round(total["hall"] / total["pred"], 4) if total["pred"] else 0.0,
        "omission_rate": round(1 - r, 4),
        "latency_p50_ms": latencies[len(latencies) // 2] if latencies else None,
        "latency_p95_ms": latencies[min(len(latencies) - 1, math.ceil(len(latencies) * 0.95) - 1)]
        if latencies else None,
    }
    gates = {
        "field_f1>=0.82": report["overall"]["field_f1"] >= 0.82,
        "hallucination<=0.02": report["overall"]["hallucination_rate"] <= 0.02,
        "schema_validity>=0.98": report["overall"]["schema_validity"] >= 0.98,
        "omission<=0.15": report["overall"]["omission_rate"] <= 0.15,
    }
    report["gates"] = gates
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if out_path:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_text(json.dumps(report, indent=2, ensure_ascii=False))
    return report


def predict(ref_path, model, out_path, host):
    rows = [json.loads(line) for line in open(ref_path, encoding="utf-8")]
    out = []
    for i, row in enumerate(rows, 1):
        section = row["section"]
        payload = {
            "model": model,
            "think": False,
            "stream": False,
            "format": SCHEMAS[section],
            "options": {"temperature": 0, "num_ctx": 8192, "num_predict": 1024, "top_p": 0.9},
            "messages": row["messages"][:-1],
        }
        started = time.time()
        try:
            req = urllib.request.Request(
                f"{host}/api/chat",
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
            )
            body = json.load(urllib.request.urlopen(req, timeout=300))
            raw = body["message"]["content"]
            parsed = json.loads(raw)
        except Exception as exc:  # noqa: BLE001 - satu contoh gagal tidak boleh menghentikan eval
            raw, parsed = f"{type(exc).__name__}: {exc}", None
        out.append({
            "id": row["id"],
            "section": section,
            "raw": raw,
            "parsed": parsed,
            "latency_ms": int((time.time() - started) * 1000),
        })
        print(f"[{i}/{len(rows)}] {row['id']} {'ok' if parsed else 'FAIL'}", flush=True)
    Path(out_path).write_text(
        "".join(json.dumps(o, ensure_ascii=False) + "\n" for o in out)
    )
    print(f"prediksi -> {out_path}")


def selftest():
    assert norm("  Software  Engineer. ") == "software engineer"
    assert token_overlap("[PERUSAHAAN] Teknologi", "[PERUSAHAAN] teknologi") >= 0.85
    assert same("experiences[0].company", "[PERUSAHAAN] Teknologi", "[PERUSAHAAN] teknologi")
    assert same("experiences[0].start_date", "2022-03", "2022-03")
    assert not same("experiences[0].start_date", "2022-02", "2022-03")
    assert same("experiences[0].end_date", "2023-02", "2023-03")  # toleransi 1 bulan
    assert same("skills[0].name", "js", "javascript")
    assert same("educations[0].gpa", 3.6, 3.62)
    assert not same("educations[0].gpa", 3.5, 3.62)
    f = flatten("experiences", {"experiences": [
        {"company": "X", "title": "Y", "employment_type": None, "start_date": "2022-01",
         "end_date": None, "is_current": True, "points": ["a", "b"]}]})
    assert set(f) == {
        "experiences[0].company", "experiences[0].title", "experiences[0].start_date",
        "experiences[0].is_current", "experiences[0].points[0]", "experiences[0].points[1]",
    }, f
    assert flatten("skills", {"skills": []}) == {}
    print("selftest ok")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=False)
    sp = sub.add_parser("predict")
    sp.add_argument("--ref", required=True)
    sp.add_argument("--model", default="qwen3:4b")
    sp.add_argument("--out", required=True)
    sp.add_argument("--host", default="http://localhost:11434")
    ss = sub.add_parser("score")
    ss.add_argument("--ref", required=True)
    ss.add_argument("--pred", required=True)
    ss.add_argument("--out")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if a.cmd == "predict":
        return predict(a.ref, a.model, a.out, a.host)
    if a.cmd == "score":
        return score(a.ref, a.pred, a.out)
    ap.print_help()


if __name__ == "__main__":
    main()
