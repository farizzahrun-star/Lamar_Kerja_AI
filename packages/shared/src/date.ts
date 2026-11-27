export const JAKARTA_TIMEZONE = "Asia/Jakarta";
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Mengembalikan tanggal kalender `YYYY-MM-DD` pada zona waktu Asia/Jakarta (WIB).
 */
export function toJakartaDateString(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() + JAKARTA_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDateString(dateStr: string, deltaDays: number): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Format tanggal tidak valid: ${dateStr}`);
  }

  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return utc.toISOString().slice(0, 10);
}

export function getYesterdayJakartaDateString(now: Date = new Date()): string {
  return shiftDateString(toJakartaDateString(now), -1);
}

/**
 * Rentang timestamp UTC `[startIso, endIso)` yang mewakili satu hari kalender WIB.
 */
export function getJakartaDayBoundsUtc(dateStr: string): { startIso: string; endIso: string } {
  const nextDateStr = shiftDateString(dateStr, 1);
  const start = new Date(`${dateStr}T00:00:00.000+07:00`);
  const end = new Date(`${nextDateStr}T00:00:00.000+07:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`Format tanggal tidak valid: ${dateStr}`);
  }

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}
