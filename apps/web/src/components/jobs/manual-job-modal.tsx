"use client";

import { WORK_MODES, WORK_MODE_LABELS, type WorkMode } from "@lamarkerja/shared";
import { useState } from "react";

import { ErrorBanner, Field } from "@/components/profile/ui";
import { importJobsCsv, submitManualJob } from "@/lib/phase2-client";
import type { CsvImportResponse, ManualIngestResult } from "@/lib/phase2-types";

const SAMPLE_CSV = [
  "title,company,location,work_mode,description,url,posted_at,salary_min,salary_max,hr_email",
  '"Backend Engineer (TypeScript)","PT Awan Sintetis",Jakarta,hybrid,"Membangun layanan API dan antrean background. Kirim CV ke hr@awan-sintetis.example.com",https://karir.awan-sintetis.example.com/backend,2026-11-26,14000000,20000000,hr@awan-sintetis.example.com',
  '"Fullstack Developer","Studio Produk Fiktif",Bandung,remote,"Mengelola frontend Next.js dan PostgreSQL.",https://glints.com/id/opportunities/jobs/contoh-fullstack,2026-11-26,12000000,17000000,',
].join("\n");

type TabMode = "url" | "text" | "csv";

export function ManualJobModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (result: ManualIngestResult) => void;
}) {
  const [tab, setTab] = useState<TabMode>("url");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [csvReport, setCsvReport] = useState<CsvImportResponse | null>(null);

  // Fields URL & Text
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [workMode, setWorkMode] = useState<WorkMode | "">("");
  const [hrEmail, setHrEmail] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [description, setDescription] = useState("");
  const [csvText, setCsvText] = useState("");

  if (!open) return null;

  function resetFeedback() {
    setError(undefined);
    setFieldErrors({});
    setCsvReport(null);
  }

  async function handleSubmitManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    setSubmitting(true);

    const payload =
      tab === "url"
        ? {
            mode: "url" as const,
            url,
            title,
            company,
            location: location || null,
            work_mode: workMode || null,
            hr_email: hrEmail || null,
            salary_min: salaryMin ? Number(salaryMin) : null,
            salary_max: salaryMax ? Number(salaryMax) : null,
            description: description || null,
            posted_at: null,
            platform: null,
          }
        : {
            mode: "text" as const,
            title,
            company,
            location: location || null,
            work_mode: workMode || null,
            url: url || null,
            hr_email: hrEmail || null,
            salary_min: salaryMin ? Number(salaryMin) : null,
            salary_max: salaryMax ? Number(salaryMax) : null,
            description,
            posted_at: null,
          };

    const result = await submitManualJob(payload);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      setFieldErrors(result.fields ?? {});
      return;
    }

    onImported(result.data);
  }

  async function handleCsvFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    resetFeedback();
    if (file.size > 1_000_000) {
      setError("Ukuran file CSV maksimal 1 MB.");
      return;
    }
    const text = await file.text();
    setCsvText(text);
  }

  async function handleSubmitCsv(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    if (!csvText.trim()) {
      setError("Tempel isi CSV atau pilih file .csv terlebih dahulu.");
      return;
    }

    setSubmitting(true);
    const result = await importJobsCsv(csvText);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setCsvReport(result.data);
    onImported(result.data);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-job-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[1px]"
    >
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">
              Cadangan Manual
            </p>
            <h2 id="manual-job-modal-title" className="mt-1 font-serif text-2xl text-ink">
              Tambah lowongan secara manual
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              Dipakai saat Local Runner belum berjalan atau Anda menemukan lowongan dari sumber
              lain. Email HR pada deskripsi dideteksi otomatis.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost" aria-label="Tutup modal">
            Tutup ✕
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              { id: "url", label: "URL & Detail" },
              { id: "text", label: "Tempel Teks" },
              { id: "csv", label: "Import CSV" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                resetFeedback();
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                tab === item.id
                  ? "bg-accent text-white"
                  : "border border-line bg-paper text-ink-soft hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>

        {tab === "csv" ? (
          <form onSubmit={handleSubmitCsv} className="space-y-4">
            <div className="rounded-xl border border-line bg-paper p-3.5 text-xs leading-relaxed text-ink-soft">
              <p className="font-semibold text-ink">Format kolom CSV (`docs/sources.md`):</p>
              <p className="mt-1">
                Wajib: <code>title, company</code> · Opsional:{" "}
                <code>
                  location, work_mode, description, url, posted_at, salary_min, salary_max,
                  external_id, source_name, hr_email
                </code>
              </p>
              <button
                type="button"
                className="mt-2 font-semibold text-accent-deep underline-offset-4 hover:underline"
                onClick={() => {
                  resetFeedback();
                  setCsvText(SAMPLE_CSV);
                }}
              >
                Isi dengan contoh CSV sintetis
              </button>
            </div>

            <Field label="Pilih file CSV (opsional)" htmlFor="csv-file-input">
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFile}
                className="block w-full text-xs text-ink-soft file:mr-3 file:rounded-lg file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink"
              />
            </Field>

            <Field label="Isi CSV" htmlFor="csv-text-input">
              <textarea
                id="csv-text-input"
                rows={7}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="title,company,location,work_mode,description,url,posted_at"
                className="field font-mono text-xs"
              />
            </Field>

            {csvReport ? (
              <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3.5 text-xs text-accent-deep">
                <p className="font-semibold">
                  Import selesai: {csvReport.created} lowongan baru, {csvReport.deduplicated} duplikat
                  diperbarui, {csvReport.skipped} baris dilewati.
                </p>
                {csvReport.errors.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-red-700">
                    {csvReport.errors.slice(0, 5).map((item) => (
                      <li key={`${item.rowNumber}-${item.message}`}>
                        Baris {item.rowNumber}: {item.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">
                Tutup
              </button>
              <button type="submit" className="btn-primary w-auto px-5" disabled={submitting}>
                {submitting ? "Mengimpor…" : "Import CSV"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmitManual} className="space-y-4">
            {tab === "url" ? (
              <Field
                label="URL Lowongan"
                htmlFor="manual-url"
                error={fieldErrors.url}
                hint="Server tidak melakukan scraping langsung dari URL untuk menjaga keamanan IP; lengkapi judul & perusahaan di bawah."
              >
                <input
                  id="manual-url"
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://glints.com/id/opportunities/jobs/..."
                  className="field"
                />
              </Field>
            ) : (
              <Field label="URL Lowongan (opsional)" htmlFor="manual-text-url" error={fieldErrors.url}>
                <input
                  id="manual-text-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="field"
                />
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Judul Posisi" htmlFor="manual-title" error={fieldErrors.title}>
                <input
                  id="manual-title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Backend Developer"
                  className="field"
                />
              </Field>

              <Field label="Perusahaan" htmlFor="manual-company" error={fieldErrors.company}>
                <input
                  id="manual-company"
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="PT Contoh Teknologi"
                  className="field"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Lokasi" htmlFor="manual-location" error={fieldErrors.location}>
                <input
                  id="manual-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Jakarta / Remote"
                  className="field"
                />
              </Field>

              <Field label="Mode Kerja" htmlFor="manual-work-mode" error={fieldErrors.work_mode}>
                <select
                  id="manual-work-mode"
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value as WorkMode | "")}
                  className="field"
                >
                  <option value="">Tidak ditentukan</option>
                  {WORK_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {WORK_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Email HR (opsional)" htmlFor="manual-hr-email" error={fieldErrors.hr_email}>
                <input
                  id="manual-hr-email"
                  type="email"
                  value={hrEmail}
                  onChange={(e) => setHrEmail(e.target.value)}
                  placeholder="hr@perusahaan.com"
                  className="field"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Gaji Min (IDR)" htmlFor="manual-salary-min" error={fieldErrors.salary_min}>
                <input
                  id="manual-salary-min"
                  type="number"
                  min={0}
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="10000000"
                  className="field"
                />
              </Field>

              <Field label="Gaji Max (IDR)" htmlFor="manual-salary-max" error={fieldErrors.salary_max}>
                <input
                  id="manual-salary-max"
                  type="number"
                  min={0}
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder="16000000"
                  className="field"
                />
              </Field>
            </div>

            <Field
              label={tab === "text" ? "Teks Deskripsi Lowongan" : "Deskripsi Lowongan (opsional)"}
              htmlFor="manual-description"
              error={fieldErrors.description}
            >
              <textarea
                id="manual-description"
                rows={5}
                required={tab === "text"}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tempel deskripsi, requirement, dan kontak HR bila ada..."
                className="field"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">
                Batal
              </button>
              <button type="submit" className="btn-primary w-auto px-5" disabled={submitting}>
                {submitting ? "Menyimpan…" : "Simpan Lowongan"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
