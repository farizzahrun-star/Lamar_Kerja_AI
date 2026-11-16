"use client";

import { CV_MAX_SIZE_BYTES } from "@lamarkerja/shared";
import Link from "next/link";
import { useRef, useState } from "react";

import { EmptyState, ErrorBanner, SectionCard } from "@/components/profile/ui";
import { uploadCv } from "@/lib/profile-client";
import type { UploadedCvItem } from "@/lib/profile-types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CvUploadCard({
  initialItems = [],
  consentActive,
  onUploadSuccess,
}: {
  initialItems?: UploadedCvItem[];
  consentActive: boolean;
  onUploadSuccess?: (item: UploadedCvItem) => void;
}) {
  const [items, setItems] = useState<UploadedCvItem[]>(initialItems);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<{ type: "success" | "warn"; message: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!consentActive) {
      setError(
        "Persetujuan pemrosesan AI wajib diberikan sebelum mengunggah CV. Silakan centang persetujuan di atas terlebih dahulu.",
      );
      return;
    }

    if (file.size > CV_MAX_SIZE_BYTES) {
      setError(
        `Ukuran berkas (${formatBytes(file.size)}) melebihi batas maksimal ${CV_MAX_SIZE_BYTES / (1024 * 1024)} MB.`,
      );
      return;
    }

    setError(undefined);
    setNotice(undefined);
    setUploading(true);

    const result = await uploadCv(file);
    setUploading(false);

    if (!result.ok) {
      if (result.code === "CONSENT_REQUIRED") {
        setError(
          "Persetujuan pemrosesan AI diperlukan sebelum mengunggah berkas. Mohon centang persetujuan di atas.",
        );
      } else {
        setError(result.message);
      }
      return;
    }

    const newItem = result.data;
    setItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);
    onUploadSuccess?.(newItem);

    if (newItem.status === "skipped") {
      setNotice({
        type: "warn",
        message:
          newItem.message ??
          "PDF hasil scan atau tidak memiliki layer teks memadai. Ekstraksi otomatis dilewati, silakan isi data diri secara manual.",
      });
    } else {
      const queued = newItem.parseRunsQueued ?? 0;
      setNotice({
        type: "success",
        message:
          newItem.message ??
          (queued > 0
            ? `Berkas CV berhasil diunggah, ${newItem.charCount} karakter teks diekstrak, dan ${queued} antrean parsing AI dibuat.`
            : `Berkas CV berhasil diunggah dan ${newItem.charCount} karakter teks berhasil diekstrak.`),
      });
    }
  }

  function onFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
    // Reset file input agar bisa mengunggah file yang sama jika perlu
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  }

  return (
    <SectionCard
      title="Unggah Berkas CV (Opsional)"
      description="Unggah berkas CV lama (PDF atau DOCX maks. 10 MB). Teks akan diekstrak secara otomatis di server lokal untuk membantu pengisian profil."
    >
      <ErrorBanner message={error} />

      {notice ? (
        <div
          role="status"
          className={`mb-4 rounded-xl border px-3.5 py-2.5 text-sm ${
            notice.type === "warn"
              ? "border-amber/25 bg-amber/10 text-amber"
              : "border-accent/25 bg-accent-soft/40 text-accent-deep"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      {!consentActive ? (
        <div className="mb-4 rounded-xl border border-line bg-paper p-3.5 text-xs text-ink-soft">
          💡 <strong>Catatan:</strong> Fitur ekstraksi dan pemrosesan CV memerlukan persetujuan AI
          aktif pada formulir persetujuan di atas.
        </div>
      ) : null}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragOver
            ? "border-accent bg-accent-soft/20"
            : "border-line bg-paper/50 hover:border-ink-soft/40"
        } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={onFileInputChange}
          disabled={uploading}
        />

        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <svg
            className="size-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <p className="text-sm font-semibold text-ink">
          {uploading ? "Sedang mengekstrak teks dokumen…" : "Seret berkas CV ke sini atau"}
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          Format PDF atau DOCX (Maksimal 10 MB). Retensi penyimpanan 30 hari.
        </p>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn-secondary mt-4 text-xs"
        >
          {uploading ? "Memproses…" : "Pilih berkas dari perangkat"}
        </button>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wider text-ink-soft uppercase">
            Riwayat CV Terunggah ({items.length})
          </h3>
          {items.some((item) => item.status === "extracted") ? (
            <Link
              href="/profile/cv/review"
              className="text-xs font-semibold text-accent-deep hover:underline"
            >
              Tinjau saran AI →
            </Link>
          ) : null}
        </div>

        {items.length === 0 ? (
          <EmptyState>Belum ada berkas CV yang diunggah.</EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {items.map((item) => {
              const isScan = item.status === "skipped";
              const isExtracted = item.status === "extracted";

              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{item.original_filename}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {formatBytes(item.size_bytes)} · Diunggah pada {formatDate(item.created_at)}
                      {" · "}
                      Retensi hingga {formatDate(item.delete_after)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isExtracted ? (
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-deep">
                        Teks terbaca ({item.charCount} karakter)
                      </span>
                    ) : isScan ? (
                      <span className="rounded-full bg-amber/10 px-2.5 py-0.5 text-xs font-semibold text-amber">
                        Scan / teks kosong
                      </span>
                    ) : (
                      <span className="rounded-full bg-line px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                        {item.status}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
