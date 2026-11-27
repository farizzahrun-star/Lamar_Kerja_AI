import {
  canonicalizeJobUrl,
  computeJobRawHash,
  type KnownJobFingerprints,
} from "@lamarkerja/shared";

export function computeRandomDelayMs(
  minMs: number,
  maxMs: number,
  rng: () => number = Math.random,
): number {
  const safeMin = Math.max(0, Math.floor(minMs));
  const safeMax = Math.max(safeMin, Math.floor(maxMs));
  if (safeMin === safeMax) return safeMin;
  return safeMin + Math.floor(rng() * (safeMax - safeMin + 1));
}

export function createFingerprintChecker(known: KnownJobFingerprints) {
  const externalIds = new Set(known.externalIds);
  const canonicalUrls = new Set(
    known.canonicalUrls
      .map((u) => canonicalizeJobUrl(u) ?? u)
      .filter(Boolean),
  );
  const rawHashes = new Set(known.rawHashes);

  return {
    isKnown(candidate: {
      external_id?: string | null;
      url?: string | null;
      title: string;
      company: string;
      location?: string | null;
    }): boolean {
      if (candidate.external_id && externalIds.has(candidate.external_id)) {
        return true;
      }
      const canonical = canonicalizeJobUrl(candidate.url);
      if (canonical && canonicalUrls.has(canonical)) {
        return true;
      }
      const hash = computeJobRawHash({
        title: candidate.title,
        company: candidate.company,
        location: candidate.location,
      });
      return rawHashes.has(hash);
    },
    remember(candidate: {
      external_id?: string | null;
      url?: string | null;
      title: string;
      company: string;
      location?: string | null;
    }): void {
      if (candidate.external_id) externalIds.add(candidate.external_id);
      const canonical = canonicalizeJobUrl(candidate.url);
      if (canonical) canonicalUrls.add(canonical);
      rawHashes.add(
        computeJobRawHash({
          title: candidate.title,
          company: candidate.company,
          location: candidate.location,
        }),
      );
    },
  };
}
