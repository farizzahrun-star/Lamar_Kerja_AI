"use client";

import {
  ACTIVE_SCRAPE_PLATFORMS,
  APPLICATION_STATUS_LABELS,
  APPLY_CHANNELS,
  APPLY_CHANNEL_LABELS,
  JOB_PLATFORM_LABELS,
  WORK_MODES,
  WORK_MODE_LABELS,
  type ApplyChannel,
  type JobPlatform,
  type WorkMode,
} from "@lamarkerja/shared";
import Link from "next/link";
import { useState } from "react";

import { ManualJobModal } from "@/components/jobs/manual-job-modal";
import { EmptyState, ErrorBanner } from "@/components/profile/ui";
import {
  applicationStatusClass,
  channelBadgeClass,
  formatDateId,
  formatSalaryRange,
} from "@/lib/format";
import { fetchJobsFeed, queueApplications } from "@/lib/phase2-client";
import type { JobsFeedResponse, ManualIngestResult } from "@/lib/phase2-types";

export function JobsBoard({ initialData }: { initialData: JobsFeedResponse }) {
  const [data, setData] = useState<JobsFeedResponse>(initialData);
  const [snapshot, setSnapshot] = useState<"h1" | "today" | "all">(initialData.meta.snapshotMode);
  const [showAll, setShowAll] = useState(!initialData.meta.filteredByInterest);
  const [platform, setPlatform] = useState<JobPlatform | "all">("all");
  const [workMode, setWorkMode] = useState<WorkMode | "all">("all");
  const [channel, setChannel] = useState<ApplyChannel | "all">("all");
  const [query, setQuery] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function refreshFeed(overrides?: {
    snapshot?: "h1" | "today" | "all";
    showAll?: boolean;
    platform?: JobPlatform | "all";
    workMode?: WorkMode | "all";
    channel?: ApplyChannel | "all";
    query?: string;
  }) {
    setLoading(true);
    setError(undefined);

    const nextParams = {
      snapshot: overrides?.snapshot ?? snapshot,
      showAll: overrides?.showAll ?? showAll,
      platform: overrides?.platform ?? platform,
      workMode: overrides?.workMode ?? workMode,
      channel: overrides?.channel ?? channel,
      query: overrides?.query ?? query,
    };

    const result = await fetchJobsFeed(nextParams);
    setLoading(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setData(result.data);
    const availableIds = new Set(
      result.data.items.filter((item) => !item.application).map((item) => item.id),
    );
    setSelectedIds((prev) => prev.filter((id) => availableIds.has(id)));
  }

  function toggleSelect(jobId: string) {
    setSelectedIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId],
    );
  }

  async function handleQueueSelected() {
    if (selectedIds.length === 0) return;
    setQueueing(true);
    setError(undefined);
    setNotice(undefined);

    const result = await queueApplications(selectedIds);
    setQueueing(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setSelectedIds([]);
    setNotice(
      `${result.data.created.length} lowongan dimasukkan ke antrean (kuota hari ini: ${result.data.quota.used}/${result.data.quota.limit}).`,
    );
    await refreshFeed();
  }

  async function handleManualImported(result: ManualIngestResult) {
    setModalOpen(false);
    setNotice(
      `Berhasil menyimpan ${result.created} lowongan baru (${result.deduplicated} diperbarui) ke snapshot ${formatDateId(result.snapshotDate)}.`,
    );
    setSnapshot("today");
    setShowAll(true);
    await refreshFeed({ snapshot: "today", showAll: true });
  }

  const { meta, items } = data;
  const selectableIds = items.filter((item) => !item.application).map((item) => item.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "h1", label: "Snapshot H-1" },
              { id: "today", label: "Tambahan Hari Ini" },
              { id: "all", label: "Semua Tanggal" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                setSnapshot(mode.id);
                void refreshFeed({ snapshot: mode.id });
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                snapshot === mode.id
                  ? "bg-accent text-white"
                  : "border border-line bg-white text-ink-soft hover:text-ink"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="btn-secondary"
        >
          + Tambah Lowongan Manual / CSV
        </button>
      </div>

      {/* Banner Snapshot H-1 / Fallback */}
      {meta.snapshotMode === "h1" ? (
        meta.snapshotDate ? (
          <div
            className={[
              "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-3.5 text-sm",
              meta.isFallback
                ? "border-amber/30 bg-amber/10 text-ink"
                : "border-accent/25 bg-accent-soft/35 text-accent-deep",
            ].join(" ")}
          >
            <span>
              {meta.isFallback ? (
                <>
                  <strong>Snapshot H-1 ({formatDateId(meta.requestedDate)}) belum tersedia.</strong>{" "}
                  Menampilkan snapshot terakhir per{" "}
                  <strong>{formatDateId(meta.snapshotDate)}</strong>.
                </>
              ) : (
                <>
                  Menampilkan lowongan snapshot <strong>H-1 ({formatDateId(meta.snapshotDate)})</strong>
                  .
                </>
              )}
            </span>
            <span className="text-xs text-ink-soft">
              Total di snapshot: <strong>{meta.totalInSnapshot}</strong>
            </span>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber/30 bg-amber/10 px-5 py-3.5 text-sm text-ink">
            Belum ada snapshot lowongan yang tersimpan. Gunakan tombol{" "}
            <strong>Tambah Lowongan Manual / CSV</strong> atau jalankan Local Runner.
          </div>
        )
      ) : null}

      {/* Status Platform */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {meta.platformStatus.map((status) => (
          <div
            key={status.platform}
            className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-xs"
          >
            <div>
              <p className="font-semibold text-ink">{JOB_PLATFORM_LABELS[status.platform]}</p>
              <p className="mt-0.5 text-[11px] text-ink-soft">
                {status.lastRunDate
                  ? `${formatDateId(status.lastRunDate)} · ${status.newCount} baru`
                  : "Belum ada run"}
              </p>
            </div>
            <span
              className={[
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                !status.sourceEnabled
                  ? "border border-line bg-paper-deep text-ink-soft"
                  : status.blocked
                    ? "bg-red-50 text-red-700"
                    : status.lastRunDate
                      ? "bg-accent-soft text-accent-deep"
                      : "border border-line bg-paper text-ink-soft",
              ].join(" ")}
            >
              {!status.sourceEnabled
                ? "Dijeda"
                : status.blocked
                  ? "Terblokir"
                  : status.lastRunDate
                    ? "Normal"
                    : "Kosong"}
            </span>
          </div>
        ))}
      </div>

      {/* Pengingat jika minat kosong */}
      {meta.interestLabels.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-3 text-xs text-ink-soft">
          <span>
            Belum ada minat dipilih. Anda melihat seluruh lowongan tanpa penyaringan minat.
          </span>
          <Link href="/settings" className="font-semibold text-accent-deep hover:underline">
            Pilih minat di Preferensi →
          </Link>
        </div>
      ) : null}

      {/* Filter Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void refreshFeed();
        }}
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <input
          type="search"
          aria-label="Cari lowongan"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari posisi, perusahaan, skill…"
          className="field lg:col-span-2"
        />

        <select
          aria-label="Filter platform"
          value={platform}
          onChange={(e) => {
            const next = e.target.value as JobPlatform | "all";
            setPlatform(next);
            void refreshFeed({ platform: next });
          }}
          className="field"
        >
          <option value="all">Semua platform</option>
          {[...ACTIVE_SCRAPE_PLATFORMS, "manual" as const].map((item) => (
            <option key={item} value={item}>
              {JOB_PLATFORM_LABELS[item]}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter mode kerja"
          value={workMode}
          onChange={(e) => {
            const next = e.target.value as WorkMode | "all";
            setWorkMode(next);
            void refreshFeed({ workMode: next });
          }}
          className="field"
        >
          <option value="all">Semua mode kerja</option>
          {WORK_MODES.map((item) => (
            <option key={item} value={item}>
              {WORK_MODE_LABELS[item]}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter channel apply"
          value={channel}
          onChange={(e) => {
            const next = e.target.value as ApplyChannel | "all";
            setChannel(next);
            void refreshFeed({ channel: next });
          }}
          className="field"
        >
          <option value="all">Semua channel</option>
          {APPLY_CHANNELS.map((item) => (
            <option key={item} value={item}>
              {APPLY_CHANNEL_LABELS[item]}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-5">
          <div className="flex flex-wrap items-center gap-4 text-xs text-ink-soft">
            {meta.interestLabels.length > 0 ? (
              <label className="flex cursor-pointer items-center gap-2 font-medium text-ink">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setShowAll(next);
                    void refreshFeed({ showAll: next });
                  }}
                  className="size-4 rounded border-line accent-accent"
                />
                <span>Tampilkan semua lowongan (abaikan filter minat)</span>
              </label>
            ) : null}

            {selectableIds.length > 0 ? (
              <button
                type="button"
                className="font-semibold text-accent-deep hover:underline"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.length === selectableIds.length ? [] : selectableIds.slice(0, meta.dailyQuota.remaining),
                  )
                }
              >
                {selectedIds.length > 0 ? "Kosongkan pilihan" : "Pilih sesuai sisa kuota"}
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-soft">
              Kuota hari ini:{" "}
              <strong className="text-ink">
                {meta.dailyQuota.used}/{meta.dailyQuota.limit}
              </strong>
            </span>
            <button type="submit" className="btn-secondary" disabled={loading}>
              {loading ? "Memuat…" : "Terapkan"}
            </button>
          </div>
        </div>
      </form>

      <ErrorBanner message={error} />

      {notice ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent-soft/45 px-4 py-3 text-sm text-accent-deep"
        >
          <span>{notice}</span>
          <Link href="/applications" className="font-semibold underline-offset-4 hover:underline">
            Buka Antrean →
          </Link>
        </div>
      ) : null}

      {/* Batch Action Bar */}
      {selectedIds.length > 0 ? (
        <div className="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-white px-5 py-3.5 shadow-md">
          <div className="text-sm">
            <strong className="font-semibold text-ink">{selectedIds.length} lowongan dipilih</strong>{" "}
            <span className="text-xs text-ink-soft">
              · Sisa kuota hari ini: {meta.dailyQuota.remaining} dari {meta.dailyQuota.limit}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedIds([])} className="btn-ghost">
              Batal pilih
            </button>
            <button
              type="button"
              onClick={() => void handleQueueSelected()}
              disabled={queueing}
              className="btn-primary w-auto px-5"
            >
              {queueing ? "Mengantrekan…" : "Masukkan ke Antrean Apply"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Job List */}
      {items.length === 0 ? (
        <EmptyState>
          Tidak ada lowongan yang cocok dengan filter saat ini. Coba centang{" "}
          <strong>Tampilkan semua lowongan</strong> atau tambahkan lowongan manual.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((job) => {
            const checked = selectedIds.includes(job.id);
            const alreadyApplied = Boolean(job.application);
            const salary = formatSalaryRange(job.salary_min, job.salary_max);

            return (
              <li
                key={job.id}
                className={[
                  "rounded-2xl border bg-white p-5 transition-colors",
                  checked ? "border-accent ring-2 ring-accent/15" : "border-line",
                ].join(" ")}
              >
                <div className="flex items-start gap-4">
                  <div className="pt-1">
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${job.title}`}
                      disabled={alreadyApplied}
                      checked={checked}
                      onChange={() => toggleSelect(job.id)}
                      className="size-4 rounded border-line accent-accent disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-base font-semibold text-ink hover:text-accent-deep hover:underline"
                        >
                          {job.title}
                        </Link>
                        <p className="mt-0.5 text-sm text-ink-soft">
                          {job.company}
                          {job.location ? ` · ${job.location}` : ""}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${channelBadgeClass(job.best_channel)}`}
                        >
                          {APPLY_CHANNEL_LABELS[job.best_channel]}
                        </span>

                        {job.application ? (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${applicationStatusClass(job.application.status)}`}
                          >
                            {APPLICATION_STATUS_LABELS[job.application.status]}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <p className="text-xs leading-relaxed text-ink-soft">{job.description_preview}</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-ink-soft">
                      <div className="flex flex-wrap items-center gap-2">
                        {job.platforms.map((plat) => (
                          <span
                            key={plat}
                            className="rounded-md border border-line bg-paper px-2 py-0.5 text-[11px] font-medium text-ink"
                          >
                            {JOB_PLATFORM_LABELS[plat]}
                          </span>
                        ))}
                        {job.work_mode ? (
                          <span className="rounded-md border border-line bg-white px-2 py-0.5 text-[11px]">
                            {WORK_MODE_LABELS[job.work_mode]}
                          </span>
                        ) : null}
                        {salary ? <span className="font-medium text-ink">{salary}</span> : null}
                        {job.has_hr_email ? (
                          <span className="text-accent-deep">• Email HR terdeteksi</span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-3">
                        <span>
                          {job.posted_at
                            ? `Diposting ${formatDateId(job.posted_at)}`
                            : `Terlihat ${formatDateId(job.first_seen_at)}`}
                        </span>
                        <Link
                          href={`/jobs/${job.id}`}
                          className="font-semibold text-accent-deep hover:underline"
                        >
                          Detail →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ManualJobModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onImported={(res) => void handleManualImported(res)}
      />
    </div>
  );
}
