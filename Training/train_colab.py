"""QLoRA Qwen3-4B untuk task cv.parse — dijalankan di Google Colab (GPU T4 16 GB).

Jalankan dari Colab, bukan laptop:

    !pip install -q unsloth
    !python train_colab.py --stage train --data dataset-cv-v1-train.jsonl --val dataset-cv-v1-val.jsonl
    !python train_colab.py --stage export
    !python train_colab.py --stage gguf

Hasil: adapter LoRA di outputs/adapter, merged 16-bit di outputs/merged,
Q4_K_M GGUF di outputs/gguf (untuk `ollama create lamar-cv:q4`).

ponytail: satu model, satu schema, tanpa sweep hyperparameter. Kalau gate F1 tidak
lewat setelah 1 run, ubah data/prompt dulu, bukan jumlah eksperimen.
"""

import argparse
import json
import subprocess
from pathlib import Path

BASE = "Qwen/Qwen3-4B"
OUT = Path("outputs")
ADAPTER = OUT / "adapter"
MERGED = OUT / "merged"
GGUF = OUT / "gguf"


def load(model_path, max_seq, trainable=True):
    from unsloth import FastLanguageModel

    model, tok = FastLanguageModel.from_pretrained(
        model_name=model_path, max_seq_length=max_seq, load_in_4bit=True
    )
    if not trainable:  # export: adapter sudah termuat, jangan bungkus ulang
        return model, tok
    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        use_gradient_checkpointing="unsloth",
        random_state=3407,
    )
    return model, tok


def render(tok, messages):
    """Completion-only: prompt = semua pesan kecuali yang terakhir."""
    try:
        prompt = tok.apply_chat_template(
            messages[:-1], tokenize=False, add_generation_prompt=True, enable_thinking=False
        )
        reply = messages[-1]["content"] + tok.eos_token
        return prompt + reply
    except TypeError:  # template lama tanpa enable_thinking
        prompt = tok.apply_chat_template(
            messages[:-1], tokenize=False, add_generation_prompt=True
        )
        return prompt + messages[-1]["content"] + tok.eos_token


def stage_train(args):
    from datasets import load_dataset
    from trl import SFTConfig, SFTTrainer
    from unsloth.chat_templates import train_on_responses_only

    model, tok = load(args.model, args.max_seq)
    data = load_dataset(
        "json", data_files={"train": args.data, "validation": args.val}
    )
    data = data.map(lambda r: {"text": render(tok, r["messages"])}).remove_columns(
        ["id", "task", "section", "messages"]
    )
    if args.limit:
        data = data.select(range(args.limit))

    trainer = SFTTrainer(
        model=model,
        processing_class=tok,
        train_dataset=data["train"],
        eval_dataset=data["validation"],
        args=SFTConfig(
            output_dir=str(OUT / "checkpoints"),
            dataset_text_field="text",
            max_seq_length=args.max_seq,
            per_device_train_batch_size=2,
            gradient_accumulation_steps=8,
            num_train_epochs=args.epochs,
            learning_rate=1e-4,
            lr_scheduler_type="cosine",
            warmup_ratio=0.03,
            weight_decay=0.01,
            optim="adamw_8bit",
            logging_steps=10,
            eval_strategy="epoch",
            save_strategy="epoch",
            save_total_limit=2,
            load_best_model_at_end=True,
            metric_for_best_model="eval_loss",
            seed=3407,
            report_to="none",
        ),
    )
    trainer = train_on_responses_only(
        trainer,
        instruction_part="<|im_start|>user\n",
        response_part="<|im_start|>assistant\n",
    )
    trainer.train()
    ADAPTER.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(ADAPTER))
    tok.save_pretrained(str(ADAPTER))
    print(f"adapter -> {ADAPTER}")


def stage_export(args):
    model, tok = load(str(ADAPTER), args.max_seq, trainable=False)
    model.save_pretrained_merged(str(MERGED), tok, save_method="merged_16bit")
    print(f"merged -> {MERGED}")


def stage_gguf(args):
    cpp = Path("llama.cpp")
    if not cpp.exists():
        subprocess.run(
            ["git", "clone", "--depth", "1", "https://github.com/ggml-org/llama.cpp", str(cpp)],
            check=True,
        )
        subprocess.run(
            ["pip", "install", "-q", "-r", str(cpp / "requirements.txt")], check=True
        )
    GGUF.mkdir(parents=True, exist_ok=True)
    f16 = GGUF / "qwen3-4b-cv-lamar.f16.gguf"
    q4 = GGUF / "qwen3-4b-cv-lamar.Q4_K_M.gguf"
    subprocess.run(
        [sys_python(), str(cpp / "convert_hf_to_gguf.py"), str(MERGED), "--outfile", str(f16)],
        check=True,
    )
    subprocess.run(
        ["cmake", "-B", "llama.cpp/build", "-DGGML_METAL=OFF", "-DLLAMA_CURL=OFF"],
        check=True,
    )
    subprocess.run(
        ["cmake", "--build", "llama.cpp/build", "--target", "llama-quantize", "-j", "4"],
        check=True,
    )
    subprocess.run(
        ["llama.cpp/build/bin/llama-quantize", str(f16), str(q4), "Q4_K_M"], check=True
    )
    (GGUF / "Modelfile").write_text(
        f"FROM ./{q4.name}\n"
        "PARAMETER num_ctx 8192\nPARAMETER temperature 0\nPARAMETER num_predict 1024\n"
        'SYSTEM "Anda adalah mesin ekstraksi data CV. Output hanya JSON valid sesuai schema. '
        'Jangan menambah fakta yang tidak tertulis. Gunakan null bila ragu."\n'
    )
    print(f"gguf -> {q4}\nModelfile -> {GGUF / 'Modelfile'}")
    print("download kedua file itu, lalu di mesin lokal: ollama create lamar-cv:q4 -f Modelfile")


def sys_python():
    import sys

    return sys.executable


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["train", "export", "gguf"], default="train")
    ap.add_argument("--model", default=BASE)
    ap.add_argument("--data", default="dataset-cv-v2-train.jsonl")
    ap.add_argument("--val", default="dataset-cv-v2-val.jsonl")
    ap.add_argument("--epochs", type=float, default=3)
    ap.add_argument("--max-seq", type=int, default=4096)
    ap.add_argument("--limit", type=int, default=0, help="smoke test: pakai N contoh saja")
    args = ap.parse_args()
    {"train": stage_train, "export": stage_export, "gguf": stage_gguf}[args.stage](args)


if __name__ == "__main__":
    main()
