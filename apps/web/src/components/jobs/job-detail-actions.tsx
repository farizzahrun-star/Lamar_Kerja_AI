"use client";

import { APPLICATION_STATUS_LABELS, APPLY_CHANNEL_LABELS, type ApplicationStatus, type ApplyChannel } from "@lamarkerja/shared";
import Link from "next/link";
import { useState } from "react";

import { ErrorBanner } from "@/components/profile/ui";
import { applicationStatusClass } from "@/lib/format";
import { queueApplications } from "@/lib/phase2-client";

export function JobDetailActions({
  jobId,
  initialApplication,
  initialRemainingQuota,
  dailyLimit,
}: {
  jobId: string;
  initialApplication: {
    id: string;
    status: ApplicationStatus;
    channel: ApplyChannel;
  } | null;
  initialRemainingQuota: number;
  dailyLimit: number;
}) {
  const [application, setApplication] = useState(initialApplication);
  const [remaining, setRemaining] = useState(initialRemainingQuota);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const isActive = application !== null && application.status !== "cancelled";

  async function handleQueue() {
    setSubmitting(true);
    setError(undefined);
    const result = await queueApplications([jobId]);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    const created = result.data.created[0];
    if (created) {
      setApplication({
        id: created.id,
        status: created.status,
        channel: created.channel,
      });
    }
    setRemaining(result.data.quota.remaining);
  }

  return (
    <div className="space-y-3">
      <ErrorBanner message={error} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-5">
        <div>
          {isActive ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${applicationStatusClass(application.status)}`}
              >
                Status: {APPLICATION_STATUS_LABELS[application.status]}
              </span>
              <span className="text-xs text-ink-soft">
                Channel: {APPLY_CHANNEL_LABELS[application.channel]}
              </span>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-ink">Siap dimasukkan ke antrean lamaran</p>
              <p className="text-xs text-ink-soft">
                Sisa kuota hari ini: {remaining} dari {dailyLimit} lamaran.
                {application?.status === "cancelled"
                  ? " (Antrean sebelumnya dibatalkan; boleh diantrekan ulang.)"
                  : ""}
              </p>
            </div>
          )}
        </div>

        {isActive ? (
          <Link href="/applications" className="btn-secondary">
            Kelola di Antrean →
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void handleQueue()}
            disabled={submitting || remaining === 0}
            className="btn-primary w-auto px-5"
          >
            {submitting
              ? "Mengantrekan…"
              : remaining === 0
                ? "Kuota harian penuh"
                : "Masukkan ke Antrean Apply"}
          </button>
        )}
      </div>
    </div>
  );
}
