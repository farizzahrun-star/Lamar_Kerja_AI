"use client";

import { useState } from "react";

import { createEntry, deleteEntry, updateEntry } from "@/lib/profile-client";
import type { EducationRow } from "@/lib/profile-types";

import { EmptyState, ErrorBanner, Field, SectionCard } from "./ui";

const LEVELS = ["SMA", "SMK", "D3", "S1", "S2", "S3"] as const;

function yearRange(start: number | null, end: number | null) {
  if (!start && !end) return "";
  return [start ?? "…", end ?? "sekarang"].join(" – ");
}

export function EducationSection({
  items,
  onChanged,
}: {
  items: EducationRow[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<EducationRow | null>(null);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    setSaving(true);
    setError(undefined);
    setFields({});

    const result = editing
      ? await updateEntry<EducationRow>("educations", editing.id, payload)
      : await createEntry<EducationRow>("educations", payload);

    if (!result.ok) {
      setSaving(false);
      setError(result.message);
      setFields(result.fields ?? {});
      return;
    }

    await onChanged();
    setSaving(false);
    if (editing) {
      setEditing(null);
    } else {
      form.reset();
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Hapus pendidikan ini?")) return;

    const result = await deleteEntry("educations", id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (editing?.id === id) setEditing(null);
    await onChanged();
  }

  return (
    <SectionCard
      title="Pendidikan"
      description="Riwayat pendidikan formal, terbaru lebih dulu."
    >
      <ErrorBanner message={error} />

      {items.length === 0 ? (
        <EmptyState>Belum ada pendidikan. Tambahkan minimal satu.</EmptyState>
      ) : (
        <ul className="mb-6 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {item.institution}
                  {item.level ? (
                    <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
                      {item.level}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {[item.major, yearRange(item.start_year, item.end_year)]
                    .filter(Boolean)
                    .join(" · ")}
                  {item.gpa !== null ? ` · IPK ${item.gpa}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <button type="button" className="btn-ghost" onClick={() => setEditing(item)}>
                  Ubah
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => void handleDelete(item.id)}
                >
                  Hapus
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        key={editing?.id ?? "new"}
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-xl border border-line/70 p-4 sm:grid-cols-2"
      >
        <p className="text-sm font-semibold text-ink sm:col-span-2">
          {editing ? `Ubah: ${editing.institution}` : "Tambah pendidikan"}
        </p>

        <Field label="Jenjang" htmlFor="edu-level" error={fields.level}>
          <select
            id="edu-level"
            name="level"
            className="field"
            defaultValue={editing?.level ?? ""}
          >
            <option value="">Tidak disebutkan</option>
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Institusi" htmlFor="edu-institution" error={fields.institution}>
          <input
            id="edu-institution"
            name="institution"
            className="field"
            defaultValue={editing?.institution ?? ""}
            maxLength={160}
            required
          />
        </Field>

        <Field label="Jurusan" htmlFor="edu-major" error={fields.major}>
          <input
            id="edu-major"
            name="major"
            className="field"
            defaultValue={editing?.major ?? ""}
            maxLength={160}
          />
        </Field>

        <Field label="IPK" htmlFor="edu-gpa" error={fields.gpa} hint="Skala 0–4, maksimal 2 desimal.">
          <input
            id="edu-gpa"
            name="gpa"
            type="number"
            min={0}
            max={4}
            step={0.01}
            className="field"
            defaultValue={editing?.gpa ?? ""}
          />
        </Field>

        <Field label="Tahun mulai" htmlFor="edu-start" error={fields.start_year}>
          <input
            id="edu-start"
            name="start_year"
            type="number"
            min={1950}
            max={2100}
            className="field"
            defaultValue={editing?.start_year ?? ""}
          />
        </Field>

        <Field label="Tahun selesai" htmlFor="edu-end" error={fields.end_year}>
          <input
            id="edu-end"
            name="end_year"
            type="number"
            min={1950}
            max={2100}
            className="field"
            defaultValue={editing?.end_year ?? ""}
          />
        </Field>

        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="btn-secondary" disabled={saving}>
            {saving ? "Menyimpan…" : editing ? "Simpan perubahan" : "Tambah"}
          </button>
          {editing ? (
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
              Batal
            </button>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}
