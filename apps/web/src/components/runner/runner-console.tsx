"use client";

import { JOB_PLATFORM_LABELS } from "@lamarkerja/shared";
import { useState } from "react";

import { EmptyState, ErrorBanner, Field, SectionCard } from "@/components/profile/ui";
import { formatDateId, formatDateTimeId } from "@/lib/format";
import { createRunnerToken, revokeRunnerToken, toggleJobSource } from "@/lib/phase2-client";
import type { RunnerDashboardData } from "@/lib/phase2-types";

export function RunnerConsole({ initialData }: { initialData: RunnerDashboardData }) {
  const [runners, setRunners] = useState(initialData.runners);
  const [sources, setSources] = useState(initialData.sources);
  const [runnerName, setRunnerName] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  async function handleCreateToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!runnerName.trim()) return;
    setCreating(true);
    setError(undefined);
    setFreshToken(null);
    setCopied(false);

    const res = await createRunnerToken(runnerName.trim());
    setCreating(false);

    if (!res.ok) {
      setError(res.message);
      return;
    }

    setRunners((prev) => [res.data.runner, ...prev]);
    setFreshToken(res.data.rawToken);
    setRunnerName("");
  }

  async function handleRevoke(runnerId: string, name: string) {
    if (!window.confirm(`Cabut token runner "${name}"? Runner tidak akan bisa menarik task lagi.`)) {
      return;
    }

    setBusyId(runnerId);
    setError(undefined);
    const res = await revokeRunnerToken(runnerId);
    setBusyId(null);

    if (!res.ok) {
      setError(res.message);
      return;
    }

    setRunners((prev) => prev.map((item) => (item.id === runnerId ? res.data : item)));
  }

  async function handleToggleSource(sourceId: string, nextEnabled: boolean) {
    setBusyId(sourceId);
    setError(undefined);
    const res = await toggleJobSource(sourceId, nextEnabled);
    setBusyId(null);

    if (!res.ok) {
      setError(res.message);
      return;
    }

    setSources((prev) => prev.map((item) => (item.id === sourceId ? res.data : item)));
  }

  async function handleCopyToken() {
    if (!freshToken || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(freshToken);
    setCopied(true);
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />

      {/* Alerts */}
      {initialData.alerts.length > 0 ? (
        <div className="space-y-2">
          {initialData.alerts.map((alert, idx) => (
            <div
              key={`${alert.code}-${alert.platform ?? idx}`}
              className={[
                "rounded-2xl border px-5 py-3.5 text-sm",
                alert.severity === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber/30 bg-amber/10 text-ink",
              ].join(" ")}
            >
              <strong className="font-semibold">Peringatan Runner:</strong> {alert.message}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-accent/25 bg-accent-soft/35 px-5 py-3.5 text-sm text-accent-deep">
          Seluruh platform scraping berjalan normal dalam pemantauan 3 hari terakhir.
        </div>
      )}

      {/* Platform Status & Kill Switch */}
      <SectionCard
        title="Sumber Lowongan & Kill Switch"
        description={
          initialData.adminAccess.openDevMode
            ? "Mode dev lokal (ADMIN_EMAILS kosong): toggle kill switch terbuka untuk tim internal."
            : initialData.adminAccess.canManageSources
              ? "Anda memiliki akses admin untuk menjeda atau mengaktifkan sumber lowongan."
              : "Hanya akun di ADMIN_EMAILS yang dapat mengubah kill switch sumber global."
        }
      >
        <ul className="space-y-3">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{source.name}</span>
                  <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-ink-soft uppercase">
                    {JOB_PLATFORM_LABELS[source.platform]} · {source.type}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Status:{" "}
                  <strong className={source.enabled ? "text-accent-deep" : "text-red-700"}>
                    {source.enabled ? "Aktif" : "Dimatikan (Kill Switch)"}
                  </strong>
                </p>
              </div>

              <button
                type="button"
                disabled={!initialData.adminAccess.canManageSources || busyId === source.id}
                onClick={() => void handleToggleSource(source.id, !source.enabled)}
                className={source.enabled ? "btn-secondary" : "btn-primary w-auto px-4"}
              >
                {busyId === source.id
                  ? "Memproses…"
                  : source.enabled
                    ? "Matikan sumber"
                    : "Aktifkan kembali"}
              </button>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Token Runner */}
      <SectionCard
        title="Token Local Runner"
        description="Token disimpan sebagai hash SHA-256 di server. Hanya dapat disalin satu kali saat dibuat dan dibatasi ke perangkat tim Anda."
      >
        <form onSubmit={handleCreateToken} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Field label="Nama Perangkat / Runner" htmlFor="runner-name-input">
              <input
                id="runner-name-input"
                required
                value={runnerName}
                onChange={(e) => setRunnerName(e.target.value)}
                placeholder="Laptop Kerja Windows"
                className="field"
              />
            </Field>
          </div>
          <button type="submit" disabled={creating} className="btn-primary w-auto px-5">
            {creating ? "Membuat…" : "+ Buat Token Runner"}
          </button>
        </form>

        {freshToken ? (
          <div className="mt-4 rounded-xl border border-accent/40 bg-accent-soft/45 p-4 text-xs text-accent-deep">
            <p className="font-semibold">
              Simpan token ini ke <code>RUNNER_TOKEN</code> di file <code>.env</code> perangkat
              Anda sekarang (tidak akan ditampilkan lagi):
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="flex-1 break-all rounded-lg border border-accent/25 bg-white px-3 py-2 font-mono text-xs text-ink">
                {freshToken}
              </code>
              <button type="button" onClick={() => void handleCopyToken()} className="btn-secondary">
                {copied ? "Tersalin ✓" : "Salin Token"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          {runners.length === 0 ? (
            <EmptyState>Belum ada token runner yang terdaftar untuk akun Anda.</EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {runners.map((runner) => {
                const revoked = Boolean(runner.revoked_at);
                return (
                  <li
                    key={runner.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-ink">{runner.name}</p>
                      <p className="mt-0.5 text-ink-soft">
                        Dibuat {formatDateTimeId(runner.created_at)}
                        {runner.last_seen_at
                          ? ` · Terakhir aktif ${formatDateTimeId(runner.last_seen_at)}`
                          : " · Belum pernah terhubung"}
                      </p>
                    </div>
                    {revoked ? (
                      <span className="rounded-full border border-line bg-paper-deep px-2.5 py-0.5 font-semibold text-ink-soft">
                        Dicabut ({formatDateId(runner.revoked_at)})
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === runner.id}
                        onClick={() => void handleRevoke(runner.id, runner.name)}
                        className="btn-danger"
                      >
                        {busyId === runner.id ? "Mencabut…" : "Cabut Token"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SectionCard>

      {/* Riwayat collector_runs */}
      <SectionCard
        title="Riwayat Collector Runs (14 Hari Terakhir)"
        description="Catatan eksekusi scraping guest per platform (maks 10 lowongan baru/platform/hari)."
      >
        {initialData.runs.length === 0 ? (
          <EmptyState>Belum ada catatan eksekusi di tabel collector_runs.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line text-[11px] font-semibold text-ink-soft uppercase">
                  <th className="py-2 pr-3">Tanggal</th>
                  <th className="py-2 pr-3">Platform</th>
                  <th className="py-2 pr-3">Ditemukan</th>
                  <th className="py-2 pr-3">Baru</th>
                  <th className="py-2 pr-3">Dikenal</th>
                  <th className="py-2 pr-3">Error</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {initialData.runs.map((run) => (
                  <tr key={run.id}>
                    <td className="py-2.5 pr-3 font-medium text-ink">
                      {formatDateId(run.run_date)}
                    </td>
                    <td className="py-2.5 pr-3 text-ink">{JOB_PLATFORM_LABELS[run.platform]}</td>
                    <td className="py-2.5 pr-3 text-ink-soft">{run.found}</td>
                    <td className="py-2.5 pr-3 font-semibold text-accent-deep">{run.new_count}</td>
                    <td className="py-2.5 pr-3 text-ink-soft">{run.skipped_known}</td>
                    <td className="py-2.5 pr-3 text-ink-soft">{run.error_count}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          run.blocked
                            ? "bg-red-50 text-red-700"
                            : run.error_count > 0
                              ? "bg-amber/10 text-amber"
                              : "bg-accent-soft text-accent-deep"
                        }`}
                      >
                        {run.blocked ? "Blocked" : run.error_count > 0 ? "Parsial" : "Sukses"}
                      </span>
                    </td>
                    <td className="max-w-xs truncate py-2.5 text-ink-soft">
                      {run.last_error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
