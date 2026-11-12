"use client";

import { useState } from "react";

import { createEntry, deleteEntry, updateEntry } from "@/lib/profile-client";
import type { ExperienceRow } from "@/lib/profile-types";

import { EmptyState, ErrorBanner, Field, SectionCard } from "./ui";

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Kontrak" },
  { value: "internship", label: "Magang" },
  { value: "freelance", label: "Freelance" },
] as const;

const MAX_POINTS = 20;
const MAX_POINT_LENGTH = 300;

function formatMonth(value: string | null) {
  if (!value) return null;
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

function dateRange(item: ExperienceRow) {
  const start = formatMonth(item.start_date);
  const end = item.is_current ? "sekarang" : formatMonth(item.end_date);
  if (!start && !end) return "";
  return [start ?? "…", end ?? "…"].join(" – ");
}

export function ExperienceSection({
  items,
  onChanged,
}: {
  items: ExperienceRow[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<ExperienceRow | null>(null);
  const [points, setPoints] = useState<string[]>([]);
  const [isCurrent, setIsCurrent] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function startCreate() {
    setEditing(null);
    setPoints([]);
    setIsCurrent(false);
    setFields({});
    setError(undefined);
  }

  function startEdit(item: ExperienceRow) {
    setEditing(item);
    setPoints(item.points.map((point) => point.content));
    setIsCurrent(item.is_current);
    setFields({});
    setError(undefined);
  }

  function updatePoint(index: number, value: string) {
    setPoints((current) => current.map((point, i) => (i === index ? value : point)));
  }

  function addPoint() {
    setPoints((current) => (current.length >= MAX_POINTS ? current : [...current, ""]));
  }

  function removePoint(index: number) {
    setPoints((current) => current.filter((_, i) => i !== index));
  }

  function movePoint(index: number, direction: -1 | 1) {
    setPoints((current) => {
      const target = index + direction;
      const fromValue = current[index];
      const toValue = current[target];
      if (fromValue === undefined || toValue === undefined) return current;
      const next = [...current];
      next[index] = toValue;
      next[target] = fromValue;
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      company: formData.get("company"),
      title: formData.get("title"),
      employment_type: formData.get("employment_type"),
      start_date: formData.get("start_date"),
      end_date: isCurrent ? "" : formData.get("end_date"),
      is_current: isCurrent,
      description: formData.get("description"),
      points: points.map((point) => point.trim()).filter((point) => point.length > 0),
    };

    setSaving(true);
    setError(undefined);
    setFields({});

    const result = editing
      ? await updateEntry<ExperienceRow>("experiences", editing.id, payload)
      : await createEntry<ExperienceRow>("experiences", payload);

    if (!result.ok) {
      setSaving(false);
      setError(result.message);
      setFields(result.fields ?? {});
      return;
    }

    await onChanged();
    setSaving(false);
    if (!editing) form.reset();
    startCreate();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Hapus pengalaman ini?")) return;

    const result = await deleteEntry("experiences", id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (editing?.id === id) startCreate();
    await onChanged();
  }

  return (
    <SectionCard title="Pengalaman kerja" description="Posisi terbaru lebih dulu, plus poin pencapaian.">
      <ErrorBanner message={error} />

      {items.length === 0 ? (
        <EmptyState>Belum ada pengalaman. Tambahkan bila sudah pernah bekerja atau magang.</EmptyState>
      ) : (
        <ul className="mb-6 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {item.title}
                  <span className="font-normal text-ink-soft"> · {item.company}</span>
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {[dateRange(item), item.employment_type?.replace("_", " ")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {item.points.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-ink-soft">
                    {item.points.map((point) => (
                      <li key={point.id}>{point.content}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="flex gap-1">
                <button type="button" className="btn-ghost" onClick={() => startEdit(item)}>
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
          {editing ? `Ubah: ${editing.title}` : "Tambah pengalaman"}
        </p>

        <Field label="Posisi" htmlFor="exp-title" error={fields.title}>
          <input
            id="exp-title"
            name="title"
            className="field"
            defaultValue={editing?.title ?? ""}
            maxLength={160}
            required
          />
        </Field>

        <Field label="Perusahaan" htmlFor="exp-company" error={fields.company}>
          <input
            id="exp-company"
            name="company"
            className="field"
            defaultValue={editing?.company ?? ""}
            maxLength={160}
            required
          />
        </Field>

        <Field label="Jenis kerja" htmlFor="exp-type" error={fields.employment_type}>
          <select
            id="exp-type"
            name="employment_type"
            className="field"
            defaultValue={editing?.employment_type ?? ""}
          >
            <option value="">Tidak disebutkan</option>
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="is_current"
              checked={isCurrent}
              onChange={(event) => setIsCurrent(event.target.checked)}
              className="size-4 rounded border-line"
            />
            Masih bekerja di sini
          </label>
        </div>

        <Field label="Tanggal mulai" htmlFor="exp-start" error={fields.start_date}>
          <input
            id="exp-start"
            name="start_date"
            type="date"
            className="field"
            defaultValue={editing?.start_date ?? ""}
          />
        </Field>

        <Field label="Tanggal selesai" htmlFor="exp-end" error={fields.end_date}>
          <input
            id="exp-end"
            name="end_date"
            type="date"
            className="field disabled:opacity-50"
            defaultValue={editing?.end_date ?? ""}
            disabled={isCurrent}
          />
        </Field>

        <Field
          label="Deskripsi singkat"
          htmlFor="exp-description"
          error={fields.description}
          className="sm:col-span-2"
        >
          <textarea
            id="exp-description"
            name="description"
            rows={3}
            className="field resize-y"
            defaultValue={editing?.description ?? ""}
            maxLength={2000}
            placeholder="Konteks peran, tim, dan ruang lingkup."
          />
        </Field>

        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Poin pencapaian</span>
            <button
              type="button"
              className="btn-ghost"
              onClick={addPoint}
              disabled={points.length >= MAX_POINTS}
            >
              + Tambah poin
            </button>
          </div>

          {points.length === 0 ? (
            <p className="text-xs text-ink-soft">
              Belum ada poin. Poin yang spesifik dan terukur membuat CV lebih kuat.
            </p>
          ) : (
            <ul className="space-y-2">
              {points.map((point, index) => (
                <li key={index} className="flex items-start gap-1.5">
                  <textarea
                    value={point}
                    onChange={(event) => updatePoint(index, event.target.value)}
                    rows={2}
                    maxLength={MAX_POINT_LENGTH}
                    aria-label={`Poin ${index + 1}`}
                    className="field resize-y text-sm"
                    placeholder="Contoh: Memangkas waktu build 40% lewat cache CI."
                  />
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-label={`Naikkan poin ${index + 1}`}
                      onClick={() => movePoint(index, -1)}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-label={`Turunkan poin ${index + 1}`}
                      onClick={() => movePoint(index, 1)}
                      disabled={index === points.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      aria-label={`Hapus poin ${index + 1}`}
                      onClick={() => removePoint(index)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {fields.points ? (
            <p className="mt-1 text-xs font-medium text-red-700">{fields.points}</p>
          ) : null}
        </div>

        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="btn-secondary" disabled={saving}>
            {saving ? "Menyimpan…" : editing ? "Simpan perubahan" : "Tambah"}
          </button>
          {editing ? (
            <button type="button" className="btn-ghost" onClick={startCreate}>
              Batal
            </button>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}
