"use client";

import { CV_AI_CONSENT_PARAGRAPHS } from "@lamarkerja/shared";
import { useState } from "react";

import { ErrorBanner, SectionCard } from "@/components/profile/ui";
import { grantAiConsent, revokeAiConsent } from "@/lib/profile-client";
import type { ConsentStatus } from "@/lib/profile-types";

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AiConsentCard({
  initialStatus,
  onStatusChange,
}: {
  initialStatus: ConsentStatus;
  onStatusChange?: (next: ConsentStatus) => void;
}) {
  const [status, setStatus] = useState<ConsentStatus>(initialStatus);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  function updateStatus(next: ConsentStatus) {
    setStatus(next);
    onStatusChange?.(next);
  }

  async function handleGrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checked) {
      setError("Centang kotak persetujuan terlebih dahulu.");
      return;
    }

    setSubmitting(true);
    setError(undefined);
    setNotice(undefined);

    const result = await grantAiConsent("cv_ai_processing");
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setChecked(false);
    updateStatus(result.data);
    setNotice(`Persetujuan pemrosesan AI versi ${result.data.requiredVersion} aktif.`);
  }

  async function handleRevoke() {
    if (
      !window.confirm(
        "Cabut persetujuan pemrosesan AI? Antrean parsing yang berjalan akan dibatalkan, seluruh saran AI dihapus, dan berkas CV unggahan dijadwalkan untuk dihapus.",
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError(undefined);
    setNotice(undefined);

    const result = await revokeAiConsent("cv_ai_processing");
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setChecked(false);
    updateStatus({
      kind: "cv_ai_processing",
      requiredVersion: status.requiredVersion,
      active: false,
      reason: "revoked",
      consent: status.consent
        ? { ...status.consent, revoked_at: result.data.revoked_at }
        : null,
    });
    setNotice(
      "Persetujuan AI telah dicabut. Antrean parsing dibatalkan, saran AI dihapus, dan berkas CV dijadwalkan hapus.",
    );
  }

  const badge = status.active
    ? {
        label: `Persetujuan AI aktif · v${status.consent?.version ?? status.requiredVersion}`,
        className: "bg-accent-soft text-accent-deep",
      }
    : status.reason === "outdated"
      ? {
          label: `Perlu persetujuan ulang · v${status.requiredVersion}`,
          className: "bg-amber/10 text-amber",
        }
      : {
          label: "Mode manual (tanpa AI)",
          className: "border border-line bg-paper text-ink-soft",
        };

  return (
    <SectionCard
      title="Persetujuan Pemrosesan AI (Opsional)"
      description="Diperlukan khusus bila Anda ingin mengekstrak CV lama secara otomatis dengan Ollama internal. Terpisah dari ketentuan akun umum."
      action={
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
      }
    >
      <ErrorBanner message={error} />

      {notice ? (
        <div
          role="status"
          className="mb-4 rounded-xl border border-accent/25 bg-accent-soft/40 px-3.5 py-2.5 text-sm text-accent-deep"
        >
          {notice}
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-line bg-paper p-4 text-xs leading-relaxed text-ink-soft">
        {CV_AI_CONSENT_PARAGRAPHS.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        <p className="pt-1 font-medium text-ink">
          Versi kebijakan saat ini: <code>{status.requiredVersion}</code>
        </p>
      </div>

      {status.active ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-soft">
            Disetujui pada{" "}
            <strong className="font-semibold text-ink">
              {formatDateTime(status.consent?.accepted_at)}
            </strong>{" "}
            (versi {status.consent?.version}).
          </p>
          <button
            type="button"
            className="btn-danger"
            onClick={() => void handleRevoke()}
            disabled={submitting}
          >
            {submitting ? "Memproses…" : "Cabut persetujuan AI"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleGrant} className="mt-4 space-y-3">
          {status.reason === "outdated" ? (
            <p className="text-xs font-medium text-amber">
              Kebijakan pemrosesan AI telah diperbarui dari versi{" "}
              <code>{status.consent?.version}</code> ke <code>{status.requiredVersion}</code>.
              Silakan tinjau dan centang kembali bila ingin melanjutkan fitur AI.
            </p>
          ) : null}

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              name="cv_ai_consent"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              className="mt-1 size-4 shrink-0 rounded border-line accent-accent"
            />
            <span>
              Saya memberikan persetujuan eksplisit untuk pemrosesan CV dan profil saya oleh model
              AI internal (<code>Ollama qwen3:4b</code>) sesuai pernyataan di atas (terpisah dari
              ketentuan layanan umum).
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-ink-soft">
              Tanpa mencentang ini, Anda tetap dapat mengisi seluruh profil dan membuat CV PDF
              secara manual.
            </span>
            <button
              type="submit"
              className="btn-secondary"
              disabled={!checked || submitting}
            >
              {submitting ? "Menyimpan…" : "Setujui pemrosesan AI"}
            </button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}
