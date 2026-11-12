import type { ReactNode } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm text-ink-soft">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs font-medium text-red-700">{error}</p> : null}
    </div>
  );
}

export function SaveIndicator({ status, message }: { status: SaveStatus; message?: string }) {
  if (status === "idle") {
    return <span className="text-xs text-ink-soft">Perubahan tersimpan otomatis</span>;
  }
  if (status === "pending") {
    return <span className="text-xs text-ink-soft">Menunggu perubahan…</span>;
  }
  if (status === "saving") {
    return <span className="text-xs text-ink-soft">Menyimpan…</span>;
  }
  if (status === "saved") {
    return <span className="text-xs font-semibold text-accent">Tersimpan</span>;
  }
  return <span className="text-xs font-semibold text-red-700">{message ?? "Gagal menyimpan"}</span>;
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
    >
      {message}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line bg-paper px-4 py-6 text-center text-sm text-ink-soft">
      {children}
    </p>
  );
}
