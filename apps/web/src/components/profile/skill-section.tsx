"use client";

import { useState } from "react";

import { createEntry, deleteEntry, updateEntry } from "@/lib/profile-client";
import type { SkillRow } from "@/lib/profile-types";

import { EmptyState, ErrorBanner, Field, SectionCard } from "./ui";

const LEVELS = [
  { value: "beginner", label: "Pemula" },
  { value: "intermediate", label: "Menengah" },
  { value: "advanced", label: "Mahir" },
] as const;

const LEVEL_LABELS: Record<string, string> = {
  beginner: "Pemula",
  intermediate: "Menengah",
  advanced: "Mahir",
};

export function SkillSection({
  items,
  onChanged,
}: {
  items: SkillRow[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<SkillRow | null>(null);
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
      ? await updateEntry<SkillRow>("skills", editing.id, payload)
      : await createEntry<SkillRow>("skills", payload);

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
    if (!window.confirm("Hapus skill ini?")) return;

    const result = await deleteEntry("skills", id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (editing?.id === id) setEditing(null);
    await onChanged();
  }

  return (
    <SectionCard title="Skill" description="Teknologi, alat, dan kemampuan yang dikuasai.">
      <ErrorBanner message={error} />

      {items.length === 0 ? (
        <EmptyState>Belum ada skill. Tambahkan beberapa yang relevan dengan posisi target.</EmptyState>
      ) : (
        <ul className="mb-6 grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                <p className="text-xs text-ink-soft">
                  {[
                    item.level ? LEVEL_LABELS[item.level] : null,
                    item.years !== null ? `${item.years} th` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
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
        className="grid gap-4 rounded-xl border border-line/70 p-4 sm:grid-cols-3"
      >
        <p className="text-sm font-semibold text-ink sm:col-span-3">
          {editing ? `Ubah: ${editing.name}` : "Tambah skill"}
        </p>

        <Field label="Nama skill" htmlFor="skill-name" error={fields.name}>
          <input
            id="skill-name"
            name="name"
            className="field"
            defaultValue={editing?.name ?? ""}
            maxLength={60}
            placeholder="TypeScript"
            required
          />
        </Field>

        <Field label="Tingkat" htmlFor="skill-level" error={fields.level}>
          <select
            id="skill-level"
            name="level"
            className="field"
            defaultValue={editing?.level ?? ""}
          >
            <option value="">Tidak disebutkan</option>
            {LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Pengalaman (tahun)" htmlFor="skill-years" error={fields.years}>
          <input
            id="skill-years"
            name="years"
            type="number"
            min={0}
            max={60}
            step={0.5}
            className="field"
            defaultValue={editing?.years ?? ""}
          />
        </Field>

        <div className="flex gap-2 sm:col-span-3">
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
