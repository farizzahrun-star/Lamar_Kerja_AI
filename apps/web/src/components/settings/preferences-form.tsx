"use client";

import {
  JOB_PLATFORM_LABELS,
  MAX_APPLY_DAILY_LIMIT,
  type ActiveScrapePlatform,
} from "@lamarkerja/shared";
import { useState } from "react";

import { ErrorBanner, Field, SectionCard } from "@/components/profile/ui";
import { formatDateTimeId } from "@/lib/format";
import { createCustomInterest, savePreferences } from "@/lib/phase2-client";
import type { InterestRow, PreferencesBundle } from "@/lib/phase2-types";

const SESSION_LABELS = {
  none: { label: "Belum login lokal", className: "border border-line bg-paper text-ink-soft" },
  logged_in: { label: "Sesi aktif di Runner", className: "bg-accent-soft text-accent-deep" },
  expired: { label: "Sesi kedaluwarsa", className: "bg-amber/10 text-amber" },
} as const;

export function PreferencesForm({ initialData }: { initialData: PreferencesBundle }) {
  const [interests, setInterests] = useState<InterestRow[]>(initialData.interests);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialData.selectedInterestIds);
  const [platforms, setPlatforms] = useState(initialData.platforms);
  const [applyDailyLimit, setApplyDailyLimit] = useState(initialData.settings.apply_daily_limit);
  const [reviewBeforeSend, setReviewBeforeSend] = useState(initialData.settings.review_before_send);

  const [newInterestLabel, setNewInterestLabel] = useState("");
  const [addingInterest, setAddingInterest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  function toggleInterest(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function togglePlatform(platform: ActiveScrapePlatform) {
    setPlatforms((prev) =>
      prev.map((item) =>
        item.platform === platform ? { ...item, enabled: !item.enabled } : item,
      ),
    );
  }

  async function handleAddCustomInterest() {
    const trimmed = newInterestLabel.trim();
    if (!trimmed) return;
    setAddingInterest(true);
    setError(undefined);
    setNotice(undefined);

    const res = await createCustomInterest(trimmed);
    setAddingInterest(false);

    if (!res.ok) {
      setError(res.message);
      return;
    }

    const created = res.data;
    setInterests((prev) =>
      prev.some((item) => item.id === created.id) ? prev : [...prev, created],
    );
    setSelectedIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
    setNewInterestLabel("");
    setNotice(`Minat "${created.label}" ditambahkan. Jangan lupa klik Simpan Preferensi.`);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setNotice(undefined);

    const res = await savePreferences({
      interestIds: selectedIds,
      platforms: platforms.map((item) => ({ platform: item.platform, enabled: item.enabled })),
      settings: {
        apply_daily_limit: applyDailyLimit,
        review_before_send: reviewBeforeSend,
      },
    });

    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }

    setInterests(res.data.interests);
    setSelectedIds(res.data.selectedInterestIds);
    setPlatforms(res.data.platforms);
    setApplyDailyLimit(res.data.settings.apply_daily_limit);
    setReviewBeforeSend(res.data.settings.review_before_send);
    setNotice("Preferensi minat, platform, dan batas antrean berhasil disimpan.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ErrorBanner message={error} />

      {notice ? (
        <div
          role="status"
          className="rounded-xl border border-accent/25 bg-accent-soft/45 px-4 py-3 text-sm text-accent-deep"
        >
          {notice}
        </div>
      ) : null}

      <SectionCard
        title="Minat Peran & Kata Kunci"
        description="Dipakai untuk menyaring snapshot lowongan harian dan menyusun rencana pencarian Local Runner."
        action={
          <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink-soft">
            {selectedIds.length} dipilih
          </span>
        }
      >
        <div className="flex flex-wrap gap-2">
          {interests.map((interest) => {
            const active = selectedIds.includes(interest.id);
            return (
              <button
                key={interest.id}
                type="button"
                onClick={() => toggleInterest(interest.id)}
                aria-pressed={active}
                className={[
                  "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-accent text-white"
                    : "border border-line bg-paper text-ink-soft hover:text-ink",
                ].join(" ")}
              >
                {active ? "✓ " : ""}
                {interest.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-line/70 pt-4">
          <div className="min-w-[220px] flex-1">
            <Field label="Tambah minat kustom" htmlFor="custom-interest-input">
              <input
                id="custom-interest-input"
                value={newInterestLabel}
                onChange={(e) => setNewInterestLabel(e.target.value)}
                placeholder="Contoh: Security Engineer / Golang Developer"
                className="field"
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => void handleAddCustomInterest()}
            disabled={addingInterest || !newInterestLabel.trim()}
            className="btn-secondary"
          >
            {addingInterest ? "Menambah…" : "+ Tambah Minat"}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Platform Lowongan"
        description="Pilih platform yang ingin diikuti. Login akun portal (jika nanti memakai portal apply) hanya dilakukan lokal di perangkat Anda, tidak pernah disimpan di server."
      >
        <ul className="space-y-3">
          {platforms.map((item) => {
            const badge = SESSION_LABELS[item.session_status];
            return (
              <li
                key={item.platform}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3"
              >
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={() => togglePlatform(item.platform)}
                    className="size-4 rounded border-line accent-accent"
                  />
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {JOB_PLATFORM_LABELS[item.platform]}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {item.last_checked_at
                        ? `Terakhir diperiksa ${formatDateTimeId(item.last_checked_at)}`
                        : "Mode guest untuk pengumpulan lowongan"}
                    </p>
                  </div>
                </label>

                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                  {badge.label}
                </span>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard
        title="Aturan Antrean & Kontrol Manusia"
        description="Mengatur kuota antrean harian dan pengaman sebelum lamaran dikirim."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={`Batas Antrean Harian (1–${MAX_APPLY_DAILY_LIMIT})`}
            htmlFor="apply-daily-limit"
            hint="Default 10 lowongan per hari (zona WIB)."
          >
            <input
              id="apply-daily-limit"
              type="number"
              min={1}
              max={MAX_APPLY_DAILY_LIMIT}
              value={applyDailyLimit}
              onChange={(e) => setApplyDailyLimit(Number(e.target.value) || 1)}
              className="field"
            />
          </Field>

          <div className="space-y-3 pt-1">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={reviewBeforeSend}
                onChange={(e) => setReviewBeforeSend(e.target.checked)}
                className="mt-1 size-4 rounded border-line accent-accent"
              />
              <span>
                <strong className="font-semibold">Wajib tinjau draft sebelum kirim</strong>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  Disarankan aktif agar seluruh cover letter dan email HR Anda setujui lebih dulu
                  (Phase 4).
                </span>
              </span>
            </label>

            <p className="rounded-xl border border-line bg-paper px-3.5 py-2.5 text-xs text-ink-soft">
              <strong className="font-semibold text-ink">Portal Auto-Submit:</strong>{" "}
              <code>{initialData.settings.portal_auto_submit ? "Aktif" : "Nonaktif (Default)"}</code>{" "}
              — Runner berhenti sebelum tombol Submit sesuai ADR-022.
            </p>
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="btn-primary w-auto px-6">
          {saving ? "Menyimpan…" : "Simpan Preferensi"}
        </button>
      </div>
    </form>
  );
}
