import type { ApplicationStatus, ApplyChannel } from "@lamarkerja/shared";

export function formatDateId(value: string | null | undefined): string {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000+07:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTimeId(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMillions(amount: number): string {
  if (amount >= 1_000_000) {
    const jt = amount / 1_000_000;
    const text = Number.isInteger(jt) ? String(jt) : jt.toFixed(1).replace(/\.0$/, "");
    return `${text} jt`;
  }
  return amount.toLocaleString("id-ID");
}

export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    if (min === max) return `Rp ${formatMillions(min)}`;
    return `Rp ${formatMillions(min)} – ${formatMillions(max)}`;
  }
  if (min != null) return `Mulai Rp ${formatMillions(min)}`;
  return `Hingga Rp ${formatMillions(max!)}`;
}

export function channelBadgeClass(channel: ApplyChannel): string {
  if (channel === "email") {
    return "bg-accent-soft text-accent-deep";
  }
  if (channel === "easy_apply" || channel === "portal") {
    return "bg-amber/10 text-amber";
  }
  return "border border-line bg-paper text-ink-soft";
}

export function applicationStatusClass(status: ApplicationStatus): string {
  switch (status) {
    case "queued":
    case "preparing":
      return "border border-line bg-paper text-ink";
    case "ready":
    case "sent":
    case "replied":
      return "bg-accent-soft text-accent-deep";
    case "needs_user":
    case "sending":
      return "bg-amber/10 text-amber";
    case "failed":
      return "bg-red-50 text-red-700 border border-red-200";
    case "cancelled":
    default:
      return "border border-line bg-paper-deep text-ink-soft";
  }
}
