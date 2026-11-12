"use client";

import { useEffect, useRef, useState } from "react";

import { patchProfile } from "@/lib/profile-client";
import type { ProfileRow } from "@/lib/profile-types";

import { Field, SaveIndicator, SectionCard, type SaveStatus } from "./ui";

export function IdentityForm({
  profile,
  onSaved,
}: {
  profile: ProfileRow;
  onSaved: (profile: ProfileRow) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function save() {
    const form = formRef.current;
    if (!form) return;

    setStatus("saving");
    const payload = Object.fromEntries(new FormData(form).entries());
    const result = await patchProfile(payload);

    if (result.ok) {
      setStatus("saved");
      setMessage(undefined);
      setFieldErrors({});
      onSaved(result.data);
      return;
    }

    setStatus("error");
    setMessage(result.message);
    setFieldErrors(result.fields ?? {});
  }

  function scheduleSave() {
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void save();
    }, 800);
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <SectionCard
      title="Identitas"
      description="Nama dan kontak yang muncul di CV. Perubahan tersimpan otomatis."
      action={
        <div className="flex items-center gap-3">
          <SaveIndicator status={status} message={message} />
          <button type="button" className="btn-ghost" onClick={() => void save()}>
            Simpan sekarang
          </button>
        </div>
      }
    >
      <form ref={formRef} className="grid gap-4 sm:grid-cols-2" onChange={scheduleSave}>
        <Field label="Nama lengkap" htmlFor="full_name" error={fieldErrors.full_name}>
          <input
            id="full_name"
            name="full_name"
            className="field"
            defaultValue={profile.full_name ?? ""}
            maxLength={120}
            required
          />
        </Field>

        <Field label="Headline" htmlFor="headline" error={fieldErrors.headline}>
          <input
            id="headline"
            name="headline"
            className="field"
            defaultValue={profile.headline ?? ""}
            maxLength={160}
            placeholder="Backend Engineer · 3 tahun"
          />
        </Field>

        <Field label="Ringkasan" htmlFor="summary" error={fieldErrors.summary} className="sm:col-span-2">
          <textarea
            id="summary"
            name="summary"
            rows={4}
            className="field resize-y"
            defaultValue={profile.summary ?? ""}
            maxLength={2000}
            placeholder="Ceritakan fokus karier, kekuatan, dan target posisi."
          />
        </Field>

        <Field label="Telepon" htmlFor="phone" error={fieldErrors.phone}>
          <input
            id="phone"
            name="phone"
            className="field"
            defaultValue={profile.phone ?? ""}
            maxLength={32}
            inputMode="tel"
          />
        </Field>

        <Field label="Tanggal lahir" htmlFor="birth_date" error={fieldErrors.birth_date}>
          <input
            id="birth_date"
            name="birth_date"
            type="date"
            className="field"
            defaultValue={profile.birth_date ?? ""}
          />
        </Field>

        <Field label="Alamat" htmlFor="address" error={fieldErrors.address} className="sm:col-span-2">
          <input
            id="address"
            name="address"
            className="field"
            defaultValue={profile.address ?? ""}
            maxLength={200}
            placeholder="Kota, provinsi"
          />
        </Field>

        <Field label="LinkedIn" htmlFor="linkedin_url" error={fieldErrors.linkedin_url}>
          <input
            id="linkedin_url"
            name="linkedin_url"
            type="url"
            className="field"
            defaultValue={profile.linkedin_url ?? ""}
            placeholder="https://linkedin.com/in/..."
          />
        </Field>

        <Field label="Portfolio" htmlFor="portfolio_url" error={fieldErrors.portfolio_url}>
          <input
            id="portfolio_url"
            name="portfolio_url"
            type="url"
            className="field"
            defaultValue={profile.portfolio_url ?? ""}
            placeholder="https://..."
          />
        </Field>

        <Field
          label="Ekspektasi gaji (Rp)"
          htmlFor="expected_salary"
          error={fieldErrors.expected_salary}
          hint="Kosongkan jika belum yakin."
        >
          <input
            id="expected_salary"
            name="expected_salary"
            type="number"
            min={0}
            step={100000}
            className="field"
            defaultValue={profile.expected_salary ?? ""}
          />
        </Field>

        <Field label="Ketersediaan" htmlFor="availability" error={fieldErrors.availability}>
          <input
            id="availability"
            name="availability"
            className="field"
            defaultValue={profile.availability ?? ""}
            maxLength={80}
            placeholder="Bisa mulai 2 minggu setelah penawaran"
          />
        </Field>
      </form>
    </SectionCard>
  );
}
