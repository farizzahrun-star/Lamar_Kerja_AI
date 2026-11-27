import {
  APPLICATION_STATUS_LABELS,
  APPLY_CHANNEL_LABELS,
  JOB_PLATFORM_LABELS,
  WORK_MODE_LABELS,
} from "@lamarkerja/shared";
import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { loadDashboardSummary } from "@/lib/dashboard/summary";
import {
  applicationStatusClass,
  channelBadgeClass,
  formatDateId,
  formatDateTimeId,
  formatSalaryRange,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const summary = await loadDashboardSummary(supabase, user.id);

  const queuedCount = summary.applicationCounts.queued ?? 0;
  const activeRunnersBlocked = summary.platformStatus.filter((p) => p.blocked).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-ink-soft uppercase">
            Dashboard
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">
            Selamat datang, {summary.firstName}.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Ringkasan lowongan snapshot H-1, kuota antrean lamaran harian, dan kesiapan profil Anda.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/jobs" className="btn-secondary">
            Buka lowongan →
          </Link>
          <Link href="/profile/cv" className="btn-secondary">
            Kelola CV PDF
          </Link>
        </div>
      </header>

      {/* Pengingat kontekstual */}
      <div className="space-y-3">
        {!summary.isProfileComplete ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber/30 bg-amber/10 px-5 py-3.5 text-sm text-ink">
            <span>
              Profil Anda belum ditandai selesai. Lengkapi data diri agar CV PDF dan pencocokan
              lowongan lebih akurat.
            </span>
            <Link href="/onboarding" className="font-semibold text-amber underline-offset-4 hover:underline">
              Lanjutkan onboarding →
            </Link>
          </div>
        ) : null}

        {summary.jobsMeta.interestLabels.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber/30 bg-amber/10 px-5 py-3.5 text-sm text-ink">
            <span>
              Anda belum memilih minat peran. Pilih minat dan platform di Preferensi agar daftar
              lowongan tersaring otomatis.
            </span>
            <Link href="/settings" className="font-semibold text-amber underline-offset-4 hover:underline">
              Atur preferensi →
            </Link>
          </div>
        ) : null}

        {summary.pendingSuggestions > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent-soft/45 px-5 py-3.5 text-sm text-accent-deep">
            <span className="font-medium">
              {summary.pendingSuggestions} saran hasil parsing CV menunggu tinjauan Anda sebelum
              masuk profil.
            </span>
            <Link href="/profile/cv/review" className="font-semibold underline-offset-4 hover:underline">
              Tinjau saran →
            </Link>
          </div>
        ) : null}

        {summary.runnerAlerts.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-3.5 text-sm text-ink-soft">
            <span>
              <strong className="font-semibold text-ink">Info Runner:</strong>{" "}
              {summary.runnerAlerts[0]?.message}
            </span>
            <Link href="/runner" className="font-semibold text-accent-deep hover:underline">
              Cek Status Runner →
            </Link>
          </div>
        ) : null}
      </div>

      {/* KPI Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Lowongan Snapshot
          </p>
          <p className="mt-2 font-serif text-3xl text-ink">{summary.jobsMeta.totalInSnapshot}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {summary.jobsMeta.snapshotDate
              ? `${summary.jobsMeta.isFallback ? "Fallback" : "H-1"} · ${formatDateId(summary.jobsMeta.snapshotDate)}`
              : "Belum ada snapshot"}
          </p>
          <Link href="/jobs" className="mt-3 inline-block text-xs font-semibold text-accent-deep hover:underline">
            Pilih lowongan →
          </Link>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Kuota Antrean Hari Ini
          </p>
          <p className="mt-2 font-serif text-3xl text-ink">
            {summary.applicationsQuota.used}
            <span className="text-lg text-ink-soft"> / {summary.applicationsQuota.limit}</span>
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {summary.applicationsQuota.remaining} sisa kuota · {queuedCount} berstatus queued
          </p>
          <Link href="/applications" className="mt-3 inline-block text-xs font-semibold text-accent-deep hover:underline">
            Lihat antrean →
          </Link>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Profil & CV PDF
          </p>
          <p className="mt-2 font-serif text-3xl text-ink">
            {summary.isProfileComplete ? "Siap" : "Draf"}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {summary.resumesCount} versi CV tersimpan · {summary.jobsMeta.interestLabels.length} minat
          </p>
          <Link href="/profile" className="mt-3 inline-block text-xs font-semibold text-accent-deep hover:underline">
            Kelola profil →
          </Link>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Status Runner
          </p>
          <p className="mt-2 font-serif text-3xl text-ink">
            {activeRunnersBlocked > 0 ? `${activeRunnersBlocked} Terblokir` : "Normal"}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {summary.jobsMeta.lastRunAt
              ? `Run terakhir: ${formatDateTimeId(summary.jobsMeta.lastRunAt)}`
              : "Belum ada run kolektor"}
          </p>
          <Link href="/runner" className="mt-3 inline-block text-xs font-semibold text-accent-deep hover:underline">
            Detail runner →
          </Link>
        </div>
      </section>

      {/* Lowongan terbaru & Status platform + antrean */}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-ink">Lowongan Pilihan Terbaru</h2>
              <p className="text-xs text-ink-soft">
                {summary.jobsMeta.interestLabels.length > 0
                  ? `Disaring untuk minat: ${summary.jobsMeta.interestLabels.join(", ")}`
                  : "Menampilkan seluruh snapshot tersedia"}
              </p>
            </div>
            <Link href="/jobs" className="btn-ghost">
              Semua lowongan →
            </Link>
          </div>

          {summary.topJobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-paper px-4 py-6 text-center text-sm text-ink-soft">
              Belum ada lowongan yang cocok pada snapshot ini. Anda bisa menambah lowongan manual
              atau menyesuaikan minat di Preferensi.
            </div>
          ) : (
            <ul className="space-y-3">
              {summary.topJobs.map((job) => {
                const salary = formatSalaryRange(job.salary_min, job.salary_max);
                return (
                  <li
                    key={job.id}
                    className="rounded-xl border border-line/80 bg-paper/60 p-4 transition-colors hover:bg-paper"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-sm font-semibold text-ink hover:text-accent-deep hover:underline"
                        >
                          {job.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {job.company}
                          {job.location ? ` · ${job.location}` : ""}
                          {job.work_mode ? ` · ${WORK_MODE_LABELS[job.work_mode]}` : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${channelBadgeClass(job.best_channel)}`}
                      >
                        {APPLY_CHANNEL_LABELS[job.best_channel]}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-soft">
                      <span className="rounded bg-white px-2 py-0.5 font-medium text-ink">
                        {JOB_PLATFORM_LABELS[job.primary_platform]}
                      </span>
                      {salary ? <span>{salary}</span> : null}
                      {job.application ? (
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${applicationStatusClass(job.application.status)}`}
                        >
                          {APPLICATION_STATUS_LABELS[job.application.status]}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Status Sumber Lowongan</h2>
              <Link href="/runner" className="btn-ghost">
                Kelola →
              </Link>
            </div>
            <ul className="space-y-2.5">
              {summary.platformStatus.map((item) => (
                <li
                  key={item.platform}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-paper px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-semibold text-ink">{JOB_PLATFORM_LABELS[item.platform]}</p>
                    <p className="text-[11px] text-ink-soft">
                      {item.lastRunDate
                        ? `Terakhir ${formatDateId(item.lastRunDate)} · ${item.newCount} baru`
                        : "Belum ada run"}
                    </p>
                  </div>
                  <span
                    className={[
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      !item.sourceEnabled
                        ? "border border-line bg-paper-deep text-ink-soft"
                        : item.blocked
                          ? "bg-red-50 text-red-700"
                          : item.lastRunDate
                            ? "bg-accent-soft text-accent-deep"
                            : "border border-line bg-white text-ink-soft",
                    ].join(" ")}
                  >
                    {!item.sourceEnabled
                      ? "Dijeda"
                      : item.blocked
                        ? "Terblokir"
                        : item.lastRunDate
                          ? "Aktif"
                          : "Menunggu"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Antrean Terakhir</h2>
              <Link href="/applications" className="btn-ghost">
                Semua →
              </Link>
            </div>

            {summary.recentApplications.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line bg-paper px-4 py-5 text-center text-xs text-ink-soft">
                Belum ada lowongan di antrean. Centang lowongan di halaman Lowongan untuk mulai.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {summary.recentApplications.map((app) => (
                  <li
                    key={app.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-paper px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">
                        {app.job?.title ?? "Lowongan"}
                      </p>
                      <p className="truncate text-[11px] text-ink-soft">
                        {app.job?.company ?? "—"} · {APPLY_CHANNEL_LABELS[app.channel]}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${applicationStatusClass(app.status)}`}
                    >
                      {APPLICATION_STATUS_LABELS[app.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
