"use client";

import { useState } from "react";

import { createEntry, deleteEntry, updateEntry } from "@/lib/profile-client";
import type { LanguageRow } from "@/lib/profile-types";

import { EmptyState, ErrorBanner, Field, SectionCard } from "./ui";

export function LanguageSection({
  items,
  onChanged,
}: {
  items: LanguageRow[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<LanguageRow | null>(null);
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
      ? await updateEntry<LanguageRow>("languages", editing.id, payload)
      : await createEntry<LanguageRow>("languages", payload);

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
    if (!window.confirm("Hapus bahasa ini?")) return;

    const result = await deleteEntry("languages", id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (editing?.id === id) setEditing(null);
    await onChanged();
  }

  return (
    <SectionCard title="Bahasa" description="Bahasa yang dikuasai beserta tingkat kemampuannya.">
      <ErrorBanner message={error} />

      {items.length === 0 ? (
        <EmptyState>Belum ada bahasa. Tambahkan minimal Bahasa Indonesia atau Inggris.</EmptyState>
      ) : (
        <ul className="mb-6 grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                <p className="text-xs text-ink-soft">{item.proficiency ?? "—"}</p>
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
        className="grid gap-4 rounded-xl border border-line/70 p-4 sm:grid-cols-2"
      >
        <p className="text-sm font-semibold text-ink sm:col-span-2">
          {editing ? `Ubah: ${editing.name}` : "Tambah bahasa"}
        </p>

        <Field label="Bahasa" htmlFor="lang-name" error={fields.name}>
          <input
            id="lang-name"
            name="name"
            className="field"
            defaultValue={editing?.name ?? ""}
            maxLength={60}
            placeholder="Bahasa Inggris"
            required
          />
        </Field>

        <Field label="Tingkat" htmlFor="lang-proficiency" error={fields.proficiency}>
          <input
            id="lang-proficiency"
            name="proficiency"
            className="field"
            defaultValue={editing?.proficiency ?? ""}
            maxLength={40}
            placeholder="Fasih / Profesional / Dasar"
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
