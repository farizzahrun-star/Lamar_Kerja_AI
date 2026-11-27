import {
  APPLY_CHANNEL_LABELS,
  JOB_PLATFORM_LABELS,
  WORK_MODE_LABELS,
} from "@lamarkerja/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JobDetailActions } from "@/components/jobs/job-detail-actions";
import { SectionCard } from "@/components/profile/ui";
import { requireUser } from "@/lib/auth";
import { channelBadgeClass, formatDateId, formatSalaryRange } from "@/lib/format";
import { loadJobDetail } from "@/lib/jobs/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Detail Lowongan" };

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const { id } = await params;

  const job = await loadJobDetail(supabase, user.id, id);
  if (!job) notFound();

  const salary = formatSalaryRange(job.salary_min, job.salary_max);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/jobs" className="text-xs font-semibold text-ink-soft hover:text-ink">
          ← Kembali ke daftar lowongan
        </Link>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${channelBadgeClass(job.best_channel)}`}
          >
            Channel utama: {APPLY_CHANNEL_LABELS[job.best_channel]}
          </span>
          {job.work_mode ? (
            <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink">
              {WORK_MODE_LABELS[job.work_mode]}
            </span>
          ) : null}
          {job.source ? (
            <span className="rounded-full border border-line bg-paper px-3 py-1 text-xs text-ink-soft">
              Sumber: {JOB_PLATFORM_LABELS[job.source.platform]} ({job.source.name})
            </span>
          ) : null}
        </div>

        <h1 className="font-serif text-4xl tracking-tight text-ink">{job.title}</h1>
        <p className="text-base text-ink-soft">
          {job.company}
          {job.location ? ` · ${job.location}` : ""}
          {salary ? ` · ${salary}` : ""}
        </p>

        <p className="text-xs text-ink-soft">
          {job.posted_at ? `Diposting ${formatDateId(job.posted_at)} · ` : ""}
          Terlihat pertama {formatDateId(job.first_seen_at)} · Snapshot:{" "}
          {job.snapshot_dates.length > 0
            ? job.snapshot_dates.map((d) => formatDateId(d)).join(", ")
            : "—"}
        </p>
      </header>

      <JobDetailActions
        jobId={job.id}
        initialApplication={job.application}
        initialRemainingQuota={job.dailyQuota.remaining}
        dailyLimit={job.dailyQuota.limit}
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <SectionCard title="Deskripsi Lowongan">
          <div className="whitespace-pre-line text-sm leading-relaxed text-ink">
            {job.description}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Tautan & Channel Apply">
            {job.urls.length === 0 && !job.url ? (
              <p className="text-xs text-ink-soft">Tidak ada URL eksternal tercatat.</p>
            ) : (
              <ul className="space-y-2.5 text-xs">
                {job.urls.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-line bg-paper px-3.5 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">
                        {JOB_PLATFORM_LABELS[item.platform]}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${channelBadgeClass(item.apply_channel)}`}
                      >
                        {APPLY_CHANNEL_LABELS[item.apply_channel]}
                      </span>
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-accent-deep underline-offset-4 hover:underline"
                    >
                      {item.url}
                    </a>
                  </li>
                ))}
                {job.urls.length === 0 && job.url ? (
                  <li className="rounded-xl border border-line bg-paper px-3.5 py-2.5">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-accent-deep underline-offset-4 hover:underline"
                    >
                      {job.url}
                    </a>
                  </li>
                ) : null}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Kontak HR Terdeteksi">
            {job.contacts.length === 0 ? (
              <p className="text-xs text-ink-soft">
                Belum ada email HR yang terdeteksi dari deskripsi lowongan ini.
              </p>
            ) : (
              <ul className="space-y-2 text-xs">
                {job.contacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3.5 py-2"
                  >
                    <span className="font-medium text-ink">{contact.hr_email}</span>
                    <span className="rounded bg-white px-2 py-0.5 text-[10px] text-ink-soft uppercase">
                      {contact.source}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Skor Kecocokan (Phase 3)">
            <p className="text-xs leading-relaxed text-ink-soft">
              Skor kecocokan 0–100 (bobot 40/25/15/10/10) dan breakdown skill cocok/kurang akan
              dihitung otomatis setelah engine matching Phase 3 aktif.
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
