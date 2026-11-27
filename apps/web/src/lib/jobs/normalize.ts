import { toJakartaDateString, type RawJobInput } from "@lamarkerja/shared";

export { prepareNormalizedJob, type NormalizedJob, type RawJobInput } from "@lamarkerja/shared";
export type RawManualJobPayload = RawJobInput;

export function resolveManualSnapshotDate(date?: string | null): string {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  return toJakartaDateString();
}
