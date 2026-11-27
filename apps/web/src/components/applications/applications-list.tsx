"use client";

import {
  APPLICATION_STATUS_LABELS,
  APPLY_CHANNEL_LABELS,
  WORK_MODE_LABELS,
  type ApplicationStatus,
} from "@lamarkerja/shared";
import Link from "next/link";
import { useState } from "react";

import { EmptyState, ErrorBanner } from "@/components/profile/ui";
import { applicationStatusClass, channelBadgeClass, formatDateTimeId } from "@/lib/format";
import { cancelApplication, fetchApplicationsOverview } from "@/lib/phase2-client";
import type { ApplicationsOverview } from "@/lib/phase2-types";

type StatusFilter = "all" | ApplicationStatus;

export function ApplicationsList({ initialData }: { initialData: ApplicationsOverview }) {
  const [data, setData] = useState<ApplicationsOverview>(initialData);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function refresh() {
    const res = await fetchApplicationsOverview();
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setData(res.data);
  }

  async function handleCancel(applicationId: string, jobTitle: string) {
    if (
      !window.confirm(
        `Batalkan antrean untuk "${jobTitle}"? Lowongan tetap dapat diantrekan ulang nanti bila masih dibuka.`,
      )
    ) {
      return;
    }

    setBusyId(applicationId);
    setError(undefined);
    setNotice(undefined);

    const res = await cancelApplication(applicationId);
    setBusyId(null);

    if (!res.ok) {
      setError(res.message);
      return;
    }

    setNotice(`Antrean untuk "${jobTitle}" telah dibatalkan.`);
    await refresh();
  }

  const filteredItems =
    filter === "all" ? data.items : data.items.filter((item) => item.status === filter);

  const filterOptions: Array<{ id: StatusFilter; label: string }> = [
    { id: "all", label: `Semua (${data.items.length})` },
    { id: "queued", label: `Diantrekan (${data.countsByStatus.queued ?? 0})` },
    { id: "ready", label: `Siap Dikirim (${data.countsByStatus.ready ?? 0})` },
    { id: "sent", label: `Terkirim (${data.countsByStatus.sent ?? 0})` },
    { id: "cancelled", label: `Dibatalkan (${data.countsByStatus.cancelled ?? 0})` },
  ];

  const quotaPct = Math.min(100, Math.round((data.quota.used / Math.max(1, data.quota.limit)) * 100));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              Kuota Antrean Harian ({data.quota.dateWib} WIB)
            </p>
            <p className="mt-1 text-sm text-ink">
              Terpakai <strong>{data.quota.used}</strong> dari{" "}
              <strong>{data.quota.limit}</strong> lamaran ({data.quota.remaining} tersisa hari ini)
            </p>
          </div>
          <Link href="/settings" className="btn-ghost">
            Ubah batas harian →
          </Link>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-paper-deep">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${quotaPct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterOptions.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              filter === item.id
                ? "bg-accent text-white"
                : "border border-line bg-white text-ink-soft hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ErrorBanner message={error} />

      {notice ? (
        <div
          role="status"
          className="rounded-xl border border-accent/25 bg-accent-soft/40 px-4 py-3 text-sm text-accent-deep"
        >
          {notice}
        </div>
      ) : null}

      {filteredItems.length === 0 ? (
        <EmptyState>
          Belum ada lamaran pada filter ini. Buka halaman{" "}
          <Link href="/jobs" className="font-semibold text-accent-deep underline">
            Lowongan
          </Link>{" "}
          untuk memilih lowongan yang ingin diantrekan.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {filteredItems.map((app) => {
            const isExpanded = expandedId === app.id;
            return (
              <li key={app.id} className="rounded-2xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {app.job ? (
                      <Link
                        href={`/jobs/${app.job.id}`}
                        className="text-base font-semibold text-ink hover:text-accent-deep hover:underline"
                      >
                        {app.job.title}
                      </Link>
                    ) : (
                      <span className="text-base font-semibold text-ink">Lowongan</span>
                    )}
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {app.job?.company ?? "—"}
                      {app.job?.location ? ` · ${app.job.location}` : ""}
                      {app.job?.work_mode ? ` · ${WORK_MODE_LABELS[app.job.work_mode]}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${channelBadgeClass(app.channel)}`}
                    >
                      {APPLY_CHANNEL_LABELS[app.channel]}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${applicationStatusClass(app.status)}`}
                    >
                      {APPLICATION_STATUS_LABELS[app.status]}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-soft">
                  <div className="flex flex-wrap gap-3">
                    <span>Diantrekan: {formatDateTimeId(app.queued_at)}</span>
                    {app.recipient_email ? <span>Email HR: {app.recipient_email}</span> : null}
                    {app.cancelled_at ? (
                      <span>Dibatalkan: {formatDateTimeId(app.cancelled_at)}</span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : app.id)}
                      className="btn-ghost"
                    >
                      {isExpanded ? "Sembunyikan riwayat" : `Riwayat (${app.events.length})`}
                    </button>

                    {app.status === "queued" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void handleCancel(app.id, app.job?.title ?? "Lowongan ini")
                        }
                        disabled={busyId === app.id}
                        className="btn-danger"
                      >
                        {busyId === app.id ? "Membatalkan…" : "Batalkan Antrean"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {app.last_error ? (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    Catatan error: {app.last_error}
                  </p>
                ) : null}

                {isExpanded ? (
                  <div className="mt-4 border-t border-line/70 pt-3">
                    <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                      Tracking Events
                    </p>
                    {app.events.length === 0 ? (
                      <p className="text-xs text-ink-soft">Belum ada event tercatat.</p>
                    ) : (
                      <ul className="space-y-1.5 text-xs text-ink-soft">
                        {app.events.map((ev) => (
                          <li key={ev.id} className="flex items-center justify-between gap-2">
                            <span className="font-medium text-ink">{ev.event_type}</span>
                            <span>{formatDateTimeId(ev.created_at)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
