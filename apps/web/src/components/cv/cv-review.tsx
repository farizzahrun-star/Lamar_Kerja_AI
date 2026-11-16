"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState, ErrorBanner, SectionCard } from "@/components/profile/ui";
import { planMerges, type MergeDecision, type ReviewSection } from "@/lib/cv/merge";
import type {
  CvReviewData,
  CvReviewGroup,
  CvReviewSuggestion,
} from "@/lib/cv/review-types";
import { decideSuggestions } from "@/lib/profile-client";

const SECTION_ORDER: ReviewSection[] = ["identity", "experiences", "educations", "skills"];

const SECTION_LABELS: Record<ReviewSection, string> = {
  identity: "Identitas",
  experiences: "Pengalaman",
  educations: "Pendidikan",
  skills: "Keahlian",
};

const FIELD_LABELS: Record<string, string> = {
  full_name: "Nama lengkap",
  headline: "Headline",
  summary: "Ringkasan profil",
  phone: "Nomor telepon",
  address: "Lokasi",
  linkedin_url: "LinkedIn",
  portfolio_url: "Portofolio",
};

const RUN_ERROR_LABELS: Record<string, string> = {
  OLLAMA_UNAVAILABLE: "Ollama tidak dapat dihubungi",
  OLLAMA_TIMEOUT: "Ollama melewati batas waktu",
  OLLAMA_HTTP_ERROR: "Ollama membalas dengan error",
  OLLAMA_EMPTY: "Ollama mengembalikan respons kosong",
  OLLAMA_INVALID_JSON: "Respons Ollama bukan JSON valid",
  SCHEMA_INVALID: "Hasil parsing tidak sesuai schema",
  CONSENT_REVOKED: "Persetujuan AI sudah dicabut",
  CONSENT_OUTDATED: "Versi persetujuan sudah usang",
  NO_EXTRACTABLE_TEXT: "CV tidak memiliki teks yang bisa diparse",
  CV_EXPIRED: "Berkas CV sudah melewati masa retensi",
  AI_DISABLED: "Pemrosesan AI sedang dinonaktifkan",
  CIRCUIT_OPEN: "Pemrosesan AI dijeda sementara",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMonth(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.slice(0, 7);
}

function describeSuggestion(suggestion: CvReviewSuggestion): string {
  if (suggestion.section === "identity") {
    return typeof suggestion.value_json === "string"
      ? suggestion.value_json
      : JSON.stringify(suggestion.value_json);
  }

  const value = (suggestion.value_json ?? {}) as Record<string, unknown>;

  if (suggestion.section === "experiences") {
    const title = typeof value.title === "string" ? value.title : "";
    const company = typeof value.company === "string" ? value.company : "";
    const period = [
      formatMonth(value.start_date),
      value.is_current ? "sekarang" : formatMonth(value.end_date),
    ]
      .filter(Boolean)
      .join(" – ");

    const headline = [title, company].filter(Boolean).join(" · ");
    return period ? `${headline} (${period})` : headline;
  }

  if (suggestion.section === "educations") {
    const parts = [value.level, value.major, value.institution]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .join(" · ");
    const years = [value.start_year, value.end_year]
      .filter((year): year is number => typeof year === "number")
      .join(" – ");
    return years ? `${parts} (${years})` : parts;
  }

  const level = typeof value.level === "string" ? ` · ${value.level}` : "";
  return `${typeof value.name === "string" ? value.name : ""}${level}`;
}

function confidenceClasses(confidence: number): string {
  if (confidence >= 0.85) return "bg-accent-soft text-accent-deep";
  if (confidence >= 0.6) return "bg-amber/10 text-amber";
  return "bg-red-50 text-red-700";
}

function currentIdentityValue(
  bundle: CvReviewData["bundle"],
  field: string,
): string | null {
  const value = (bundle.profile as unknown as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : null;
}

function pendingOf(group: CvReviewGroup): CvReviewSuggestion[] {
  return group.suggestions.filter((suggestion) => suggestion.status === "pending");
}

function SuggestionRow({
  suggestion,
  currentValue,
  decision,
  checked,
  busy,
  onToggle,
  onDecide,
}: {
  suggestion: CvReviewSuggestion;
  currentValue?: string | null;
  decision?: MergeDecision;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onDecide: (action: "accept" | "reject") => void;
}) {
  const fieldLabel =
    suggestion.section === "identity"
      ? (FIELD_LABELS[suggestion.field_path] ?? suggestion.field_path)
      : suggestion.field_path;

  return (
    <li className="flex flex-wrap items-start gap-3 py-3.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={busy}
        aria-label={`Pilih saran ${fieldLabel}`}
        className="mt-1 size-4 accent-[var(--color-accent)]"
      />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
            {fieldLabel}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${confidenceClasses(
              suggestion.confidence,
            )}`}
          >
            {Math.round(suggestion.confidence * 100)}% yakin
          </span>
          {decision?.disposition === "duplicate" ? (
            <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
              Sudah ada di profil
            </span>
          ) : null}
          {decision?.disposition === "invalid" ? (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              Tidak valid
            </span>
          ) : null}
        </div>

        <p className="text-sm font-medium break-words text-ink">
          {describeSuggestion(suggestion)}
        </p>

        {currentValue ? (
          <p className="text-xs text-ink-soft">
            Saat ini: <span className="text-ink">{currentValue}</span>
          </p>
        ) : null}

        {decision?.reason ? (
          <p className="text-xs text-ink-soft">{decision.reason}</p>
        ) : null}

        {suggestion.source_snippet ? (
          <p className="border-l-2 border-line pl-2 text-xs leading-relaxed text-ink-soft italic">
            “{suggestion.source_snippet}”
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onDecide("accept")}
          disabled={busy || decision?.disposition === "invalid"}
          className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          Terima
        </button>
        <button
          type="button"
          onClick={() => onDecide("reject")}
          disabled={busy}
          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          Tolak
        </button>
      </div>
    </li>
  );
}

export function CvReview({ initialData }: { initialData: CvReviewData }) {
  const router = useRouter();
  const [groups, setGroups] = useState<CvReviewGroup[]>(initialData.groups);
  const [selected, setSelected] = useState<string[]>(() =>
    initialData.groups.flatMap((group) => pendingOf(group).map((suggestion) => suggestion.id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const previews = useMemo(() => {
    const map = new Map<string, MergeDecision>();
    for (const group of groups) {
      const pending = pendingOf(group);
      if (pending.length === 0) continue;
      const plan = planMerges(initialData.bundle, pending);
      for (const decision of plan.decisions) map.set(decision.id, decision);
    }
    return map;
  }, [groups, initialData.bundle]);

  const visibleGroups = groups
    .map((group) => ({ group, pending: pendingOf(group) }))
    .filter(({ group, pending }) => {
      if (pending.length > 0) return true;
      return group.runs.some((run) => run.status === "failed" || run.status === "skipped");
    });

  const totalPending = groups.reduce((total, group) => total + pendingOf(group).length, 0);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function decide(ids: string[], action: "accept" | "reject") {
    const unique = [...new Set(ids)];
    if (unique.length === 0 || busy) return;

    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    const result = await decideSuggestions(unique, action);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    const payload = result.data;
    const decided = new Set(payload.decided_ids);
    const invalid = new Set(
      payload.decisions
        .filter((decision) => decision.disposition === "invalid")
        .map((decision) => decision.id),
    );

    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        suggestions: group.suggestions.map((suggestion) => {
          if (!decided.has(suggestion.id)) return suggestion;
          const rejected = action === "reject" || invalid.has(suggestion.id);
          return {
            ...suggestion,
            status: rejected ? "rejected" : "accepted",
            decided_at: new Date().toISOString(),
          };
        }),
      })),
    );

    setSelected((prev) => prev.filter((id) => !decided.has(id)));

    if (action === "reject") {
      setNotice(`${payload.decided} saran ditolak. Profil tidak diubah.`);
    } else {
      setNotice(
        `${payload.applied} perubahan diterapkan ke profil` +
          (payload.duplicates > 0 ? `, ${payload.duplicates} sudah ada (dilewati)` : "") +
          (payload.invalid > 0 ? `, ${payload.invalid} tidak valid (ditolak)` : "") +
          ".",
      );
    }

    router.refresh();
  }

  if (totalPending === 0 && visibleGroups.length === 0) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} />

        {notice ? (
          <div
            role="status"
            className="rounded-xl border border-accent/25 bg-accent-soft/40 px-3.5 py-2.5 text-sm text-accent-deep"
          >
            {notice}
          </div>
        ) : null}

        <SectionCard
          title="Tidak ada saran AI"
          description="Unggah CV terlebih dahulu atau tunggu worker selesai memproses."
        >
          <EmptyState>
            Belum ada saran hasil parsing yang menunggu tinjauan.{" "}
            <Link href="/profile/cv" className="font-semibold text-accent-deep hover:underline">
              Kembali ke halaman CV
            </Link>
            .
          </EmptyState>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />

      {notice ? (
        <div
          role="status"
          className="rounded-xl border border-accent/25 bg-accent-soft/40 px-3.5 py-2.5 text-sm text-accent-deep"
        >
          {notice}
        </div>
      ) : null}

      <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
          <input
            type="checkbox"
            checked={totalPending > 0 && selected.length === totalPending}
            onChange={(event) => setSelected(event.target.checked ? selectedAllIds(groups) : [])}
            disabled={busy || totalPending === 0}
            className="size-4 accent-[var(--color-accent)]"
          />
          Pilih semua ({selected.length}/{totalPending})
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void decide(selected, "accept")}
            disabled={busy || selected.length === 0}
            className="btn-secondary"
          >
            {busy ? "Memproses…" : `Terima terpilih (${selected.length})`}
          </button>
          <button
            type="button"
            onClick={() => void decide(selected, "reject")}
            disabled={busy || selected.length === 0}
            className="btn-ghost"
          >
            Tolak terpilih
          </button>
        </div>
      </div>

      {visibleGroups.map(({ group, pending }) => {
        const failedRuns = group.runs.filter(
          (run) => run.status === "failed" || run.status === "skipped",
        );

        return (
          <SectionCard
            key={group.cv.id}
            title={group.cv.original_filename}
            description={`Diunggah ${formatDate(group.cv.created_at)} · retensi hingga ${formatDate(
              group.cv.delete_after,
            )}`}
            action={
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void decide(pending.map((s) => s.id), "accept")}
                  disabled={busy || pending.length === 0}
                  className="btn-secondary text-xs"
                >
                  Terima semua
                </button>
                <button
                  type="button"
                  onClick={() => void decide(pending.map((s) => s.id), "reject")}
                  disabled={busy || pending.length === 0}
                  className="btn-ghost"
                >
                  Tolak semua
                </button>
              </div>
            }
          >
            {failedRuns.length > 0 ? (
              <div
                role="status"
                className="mb-4 rounded-xl border border-amber/25 bg-amber/10 px-3.5 py-2.5 text-xs text-amber"
              >
                <p className="font-semibold">Sebagian parsing tidak menghasilkan saran.</p>
                <ul className="mt-1 space-y-0.5">
                  {failedRuns.map((run) => (
                    <li key={run.id}>
                      {SECTION_LABELS[run.section]}:{" "}
                      {run.error_code
                        ? (RUN_ERROR_LABELS[run.error_code] ?? run.error_code)
                        : run.status}
                      . Silakan isi bagian ini secara manual.
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {pending.length === 0 ? (
              <EmptyState>Tidak ada saran tersisa untuk CV ini.</EmptyState>
            ) : (
              <div className="space-y-6">
                {SECTION_ORDER.map((section) => {
                  const items = pending.filter((s) => s.section === section);
                  if (items.length === 0) return null;

                  return (
                    <div key={section}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-ink">
                          {SECTION_LABELS[section]}{" "}
                          <span className="text-xs font-normal text-ink-soft">
                            ({items.length} saran)
                          </span>
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void decide(items.map((s) => s.id), "accept")}
                            disabled={busy}
                            className="btn-ghost"
                          >
                            Terima bagian
                          </button>
                          <button
                            type="button"
                            onClick={() => void decide(items.map((s) => s.id), "reject")}
                            disabled={busy}
                            className="btn-ghost"
                          >
                            Tolak bagian
                          </button>
                        </div>
                      </div>

                      <ul className="divide-y divide-line rounded-xl border border-line bg-white px-4">
                        {items.map((suggestion) => (
                          <SuggestionRow
                            key={suggestion.id}
                            suggestion={suggestion}
                            currentValue={
                              suggestion.section === "identity"
                                ? currentIdentityValue(initialData.bundle, suggestion.field_path)
                                : null
                            }
                            decision={previews.get(suggestion.id)}
                            checked={selectedSet.has(suggestion.id)}
                            busy={busy}
                            onToggle={() => toggle(suggestion.id)}
                            onDecide={(action) => void decide([suggestion.id], action)}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

function selectedAllIds(groups: CvReviewGroup[]): string[] {
  return groups.flatMap((group) => pendingOf(group).map((suggestion) => suggestion.id));
}
