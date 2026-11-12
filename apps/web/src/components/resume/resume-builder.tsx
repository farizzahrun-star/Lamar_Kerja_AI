"use client";

import type { ResumeTemplate } from "@lamarkerja/shared";
import { useState } from "react";

import { EmptyState, ErrorBanner, SectionCard } from "@/components/profile/ui";
import { createResume } from "@/lib/profile-client";
import type { ResumeListItem } from "@/lib/profile-types";

const TEMPLATES: readonly {
  id: ResumeTemplate;
  name: string;
  badge: string;
  description: string;
}[] = [
  {
    id: "A",
    name: "Template A — Fresh Graduate",
    badge: "Pendidikan dulu",
    description:
      "Menempatkan pendidikan, IPK, dan keahlian di bagian atas sebelum pengalaman atau magang.",
  },
  {
    id: "B",
    name: "Template B — Berpengalaman",
    badge: "Pengalaman dulu",
    description:
      "Menonjolkan rekam jejak kerja, pencapaian terukur, dan kompetensi inti untuk kandidat berpengalaman.",
  },
];

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ResumeBuilder({ initialResumes }: { initialResumes: ResumeListItem[] }) {
  const [resumes, setResumes] = useState<ResumeListItem[]>(initialResumes);
  const [template, setTemplate] = useState<ResumeTemplate>(
    initialResumes[0]?.template ?? "A",
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialResumes[0]?.id ?? null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>();

  const selected = resumes.find((item) => item.id === selectedId) ?? resumes[0] ?? null;

  async function handleGenerate() {
    setGenerating(true);
    setError(undefined);

    const result = await createResume(template);
    setGenerating(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setResumes((current) => [result.data, ...current]);
    setSelectedId(result.data.id);
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Pilih template & render CV"
        description="Setiap kali Anda membuat CV, versi baru disimpan agar riwayat lamaran tetap konsisten."
      >
        <ErrorBanner message={error} />

        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Pilih template CV">
          {TEMPLATES.map((item) => {
            const active = template === item.id;
            return (
              <label
                key={item.id}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  active
                    ? "border-accent bg-accent-soft/40"
                    : "border-line bg-paper hover:bg-paper-deep/60"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="template"
                      value={item.id}
                      checked={active}
                      onChange={() => setTemplate(item.id)}
                      className="size-4 accent-accent"
                    />
                    <span className="text-sm font-semibold text-ink">{item.name}</span>
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
                    {item.badge}
                  </span>
                </span>
                <p className="mt-2 pl-6 text-xs leading-relaxed text-ink-soft">
                  {item.description}
                </p>
              </label>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-soft">
            Ukuran A4 standar · Dirender langsung dari data profil Anda tanpa AI.
          </p>
          <button
            type="button"
            className="btn-primary w-auto px-5"
            onClick={() => void handleGenerate()}
            disabled={generating}
          >
            {generating ? "Merender PDF…" : `Buat CV PDF (Template ${template})`}
          </button>
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <SectionCard title="Riwayat versi" description="Klik versi untuk melihat preview.">
          {resumes.length === 0 ? (
            <EmptyState>Belum ada CV yang dirender.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {resumes.map((item) => {
                const isSelected = selected?.id === item.id;
                return (
                  <li
                    key={item.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      isSelected ? "border-accent bg-accent-soft/30" : "border-line bg-paper"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className="text-left text-sm font-semibold text-ink hover:underline"
                      >
                        Versi {item.version} · Template {item.template}
                      </button>
                      <a
                        href={`/api/resumes/${item.id}/file?download=1`}
                        className="btn-ghost"
                        aria-label={`Unduh versi ${item.version}`}
                      >
                        Unduh
                      </a>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      {formatTimestamp(item.created_at)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={
            selected
              ? `Preview · Versi ${selected.version} (Template ${selected.template})`
              : "Preview PDF"
          }
          description="Pratinjau dokumen A4 yang siap dikirim."
          action={
            selected ? (
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/resumes/${selected.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost"
                >
                  Buka di tab baru ↗
                </a>
                <a
                  href={`/api/resumes/${selected.id}/file?download=1`}
                  className="btn-secondary"
                >
                  Unduh PDF
                </a>
              </div>
            ) : null
          }
        >
          {selected ? (
            <iframe
              key={selected.id}
              title={`Preview CV versi ${selected.version}`}
              src={`/api/resumes/${selected.id}/file`}
              className="h-[640px] w-full rounded-xl border border-line bg-paper"
            />
          ) : (
            <EmptyState>
              Pilih template di atas lalu klik <strong>Buat CV PDF</strong> untuk melihat preview.
            </EmptyState>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
