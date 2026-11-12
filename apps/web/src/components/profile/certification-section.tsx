"use client";

import { useState } from "react";

import { createEntry, deleteEntry, updateEntry } from "@/lib/profile-client";
import type { CertificationRow } from "@/lib/profile-types";

import { EmptyState, ErrorBanner, Field, SectionCard } from "./ui";

export function CertificationSection({
  items,
  onChanged,
}: {
  items: CertificationRow[];
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<CertificationRow | null>(null);
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
      ? await updateEntry<CertificationRow>("certifications", editing.id, payload)
      : await createEntry<CertificationRow>("certifications", payload);

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
    if (!window.confirm("Hapus sertifikasi ini?")) return;

    const result = await deleteEntry("certifications", id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (editing?.id === id) setEditing(null);
    await onChanged();
  }

  return (
    <SectionCard title="Sertifikasi" description="Sertifikat profesional atau lisensi yang relevan.">
      <ErrorBanner message={error} />

      {items.length === 0 ? (
        <EmptyState>Belum ada sertifikasi. Bagian ini opsional.</EmptyState>
      ) : (
        <ul className="mb-6 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{item.name}</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {[item.issuer, item.year].filter(Boolean).join(" · ") || "—"}
                </p>
                {item.credential_url ? (
                  <a
                    href={item.credential_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs font-medium text-accent hover:underline"
                  >
                    Lihat kredensial
                  </a>
                ) : null}
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
          {editing ? `Ubah: ${editing.name}` : "Tambah sertifikasi"}
        </p>

        <Field label="Nama sertifikasi" htmlFor="cert-name" error={fields.name}>
          <input
            id="cert-name"
            name="name"
            className="field"
            defaultValue={editing?.name ?? ""}
            maxLength={160}
            required
          />
        </Field>

        <Field label="Penerbit" htmlFor="cert-issuer" error={fields.issuer}>
          <input
            id="cert-issuer"
            name="issuer"
            className="field"
            defaultValue={editing?.issuer ?? ""}
            maxLength={160}
          />
        </Field>

        <Field label="Tahun" htmlFor="cert-year" error={fields.year}>
          <input
            id="cert-year"
            name="year"
            type="number"
            min={1950}
            max={2100}
            className="field"
            defaultValue={editing?.year ?? ""}
          />
        </Field>

        <Field label="URL kredensial" htmlFor="cert-url" error={fields.credential_url}>
          <input
            id="cert-url"
            name="credential_url"
            type="url"
            className="field"
            defaultValue={editing?.credential_url ?? ""}
            placeholder="https://..."
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
