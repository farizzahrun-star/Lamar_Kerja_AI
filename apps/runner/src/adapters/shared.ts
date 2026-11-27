import { sanitizeJobText, type WorkMode } from "@lamarkerja/shared";
import type { Page } from "playwright";

export interface JsonLdJobPosting {
  title?: string;
  description?: string;
  datePosted?: string;
  employmentType?: string;
  jobLocationType?: string;
  hiringOrganization?: { name?: string };
  jobLocation?:
    | { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } }
    | Array<{
        address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string };
      }>;
  baseSalary?: {
    value?: { minValue?: number | string; maxValue?: number | string; value?: number | string };
  };
}

export function extractJsonLdJobPostings(html: string): JsonLdJobPosting[] {
  const results: JsonLdJobPosting[] = [];
  const regex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        if (Array.isArray(record["@graph"])) {
          queue.push(...record["@graph"]);
        }
        const typeField = record["@type"];
        const isJobPosting =
          typeField === "JobPosting" ||
          (Array.isArray(typeField) && typeField.includes("JobPosting"));
        if (isJobPosting) {
          results.push(record as unknown as JsonLdJobPosting);
        }
      }
    } catch {
      // Abaikan blok JSON-LD yang tidak valid.
    }
  }

  return results;
}

export function formatJsonLdLocation(posting: JsonLdJobPosting): string | null {
  const loc = Array.isArray(posting.jobLocation) ? posting.jobLocation[0] : posting.jobLocation;
  const addr = loc?.address;
  if (!addr) return null;
  const parts = [addr.addressLocality, addr.addressRegion].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

export function inferWorkModeFromText(text: string | null | undefined): WorkMode | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/\bhybrid\b|\bhibrida\b/.test(lower)) return "hybrid";
  if (/\bremote\b|\bwfh\b|\btelecommute\b|\bwork from home\b/.test(lower)) return "remote";
  if (/\bon-?site\b|\bwfo\b|\bwork from office\b/.test(lower)) return "onsite";
  return null;
}

export function parseSalaryRangeFromText(text: string | null | undefined): {
  salary_min: number | null;
  salary_max: number | null;
} {
  if (!text) return { salary_min: null, salary_max: null };
  const millionMatch =
    /(?:rp|idr)\s*(\d+(?:[.,]\d+)?)\s*(?:jt|juta)\s*(?:-|–|to|sampai|s\/d)\s*(?:rp|idr)?\s*(\d+(?:[.,]\d+)?)\s*(?:jt|juta)/i.exec(
      text,
    );
  if (millionMatch?.[1] && millionMatch[2]) {
    const min = Math.round(Number(millionMatch[1].replace(",", ".")) * 1_000_000);
    const max = Math.round(Number(millionMatch[2].replace(",", ".")) * 1_000_000);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
      return { salary_min: min, salary_max: max };
    }
  }

  const fullMatch =
    /(?:rp|idr)\s*([\d.]{6,12})\s*(?:-|–|to|sampai|s\/d)\s*(?:rp|idr)?\s*([\d.]{6,12})/i.exec(
      text,
    );
  if (fullMatch?.[1] && fullMatch[2]) {
    const min = Number(fullMatch[1].replace(/\./g, ""));
    const max = Number(fullMatch[2].replace(/\./g, ""));
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
      return { salary_min: min, salary_max: max };
    }
  }

  return { salary_min: null, salary_max: null };
}

export function extractAttribute(tagHtml: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}=["']([^"']+)["']`, "i");
  const match = regex.exec(tagHtml);
  return match?.[1]?.trim() ?? null;
}

export function extractFirstTagText(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  if (!match) return null;
  const content = match[1] ?? match[0];
  const cleaned = sanitizeJobText(content).replace(/\s+/g, " ").trim();
  return cleaned || null;
}

export function resolveAbsoluteUrl(baseUrl: string, href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href.trim(), baseUrl).toString();
  } catch {
    return null;
  }
}

export function detectBlockedSignals(input: {
  status?: number | null;
  url: string;
  html: string;
  extraUrlPatterns?: RegExp[];
  extraBodyPatterns?: RegExp[];
}): { blocked: boolean; reason: string | null } {
  if (input.status === 403 || input.status === 429 || input.status === 999) {
    return { blocked: true, reason: `HTTP ${input.status}` };
  }

  const lowerUrl = input.url.toLowerCase();
  const defaultUrlPatterns = [
    /\/login\b/,
    /\/signin\b/,
    /\/authwall/,
    /\/checkpoint\//,
    /\/cdn-cgi\/challenge/,
  ];
  for (const pattern of [...defaultUrlPatterns, ...(input.extraUrlPatterns ?? [])]) {
    if (pattern.test(lowerUrl)) {
      return { blocked: true, reason: `Authwall/challenge URL (${pattern.source})` };
    }
  }

  const lowerHtml = input.html.toLowerCase();
  const defaultBodyPatterns = [
    /cf-challenge/,
    /verify you are human/,
    /attention required!\s*\|\s*cloudflare/,
    /g-recaptcha/,
    /hcaptcha/,
    /please complete the security check/,
  ];
  for (const pattern of [...defaultBodyPatterns, ...(input.extraBodyPatterns ?? [])]) {
    if (pattern.test(lowerHtml)) {
      return { blocked: true, reason: `Proteksi bot/CAPTCHA terdeteksi` };
    }
  }

  return { blocked: false, reason: null };
}

export async function readPageBlockedSignal(
  page: Page,
  responseStatus: number | null | undefined,
  extra?: { extraUrlPatterns?: RegExp[]; extraBodyPatterns?: RegExp[] },
): Promise<{ blocked: boolean; reason: string | null }> {
  const url = page.url();
  const html = await page.content();
  return detectBlockedSignals({
    status: responseStatus,
    url,
    html,
    extraUrlPatterns: extra?.extraUrlPatterns,
    extraBodyPatterns: extra?.extraBodyPatterns,
  });
}
