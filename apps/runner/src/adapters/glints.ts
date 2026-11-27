import { sanitizeJobText, type RawScrapedJob, type SearchQuery } from "@lamarkerja/shared";
import type { Page } from "playwright";

import {
  detectBlockedSignals,
  extractAttribute,
  extractFirstTagText,
  extractJsonLdJobPostings,
  formatJsonLdLocation,
  inferWorkModeFromText,
  parseSalaryRangeFromText,
  readPageBlockedSignal,
  resolveAbsoluteUrl,
} from "./shared";
import {
  PlatformBlockedError,
  type AdapterDetailResult,
  type JobCard,
  type SourceAdapter,
} from "./types";

const GLINTS_BASE_URL = "https://glints.com";

export function buildGlintsSearchUrl(query: SearchQuery): string {
  const url = new URL("/id/opportunities/jobs/explore", GLINTS_BASE_URL);
  url.searchParams.set("keyword", query.keyword);
  if (query.location) {
    url.searchParams.set("locationName", query.location);
  }
  return url.toString();
}

export function extractGlintsExternalId(url: string): string | null {
  const match = /\/opportunities\/jobs\/[^/]*?([a-f0-9-]{8,}|[0-9]{5,})(?:[/?#]|$)/i.exec(url);
  return match?.[1] ?? null;
}

export function parseGlintsSearchHtml(html: string, baseUrl = GLINTS_BASE_URL): JobCard[] {
  const cards: JobCard[] = [];
  const seenUrls = new Set<string>();

  // Pola kartu HTML Glints: container dengan data-gtm-job-id atau JobCard
  const cardBlocks = html.match(
    /<(?:div|article|li)\b[^>]*(?:data-gtm-job-id|data-testid=["']job-card["']|class=["'][^"']*JobCard[^"']*["'])[\s\S]*?<\/(?:div|article|li)>/gi,
  );

  for (const block of cardBlocks ?? []) {
    const linkMatch = /<a\b[^>]*href=["']([^"']*\/opportunities\/jobs\/[^"']+)["'][^>]*>/i.exec(
      block,
    );
    const resolvedUrl = resolveAbsoluteUrl(baseUrl, linkMatch?.[1]);
    if (!resolvedUrl || seenUrls.has(resolvedUrl)) continue;

    const title =
      extractFirstTagText(block, /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i) ??
      extractFirstTagText(block, /<a\b[^>]*href=["'][^"']*\/opportunities\/jobs\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!title) continue;

    const company =
      extractFirstTagText(
        block,
        /<(?:a|span|p|div)\b[^>]*class=["'][^"']*(?:CompanyName|company-name)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|span|p|div)>/i,
      ) ??
      extractFirstTagText(block, /data-testid=["']company-name["'][^>]*>([\s\S]*?)<\/[^>]+>/i) ??
      "Perusahaan Glints";

    const location = extractFirstTagText(
      block,
      /<(?:span|div|p)\b[^>]*class=["'][^"']*(?:Location|location)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|p)>/i,
    );

    const gtmId = extractAttribute(block, "data-gtm-job-id");
    seenUrls.add(resolvedUrl);

    cards.push({
      platform: "glints",
      external_id: gtmId ?? extractGlintsExternalId(resolvedUrl),
      title,
      company,
      location,
      url: resolvedUrl,
      work_mode: inferWorkModeFromText(block),
    });
  }

  return cards;
}

export function parseGlintsDetailHtml(html: string, card: JobCard): RawScrapedJob {
  const ld = extractJsonLdJobPostings(html)[0];

  const title = ld?.title ? sanitizeJobText(ld.title) : card.title;
  const company = ld?.hiringOrganization?.name
    ? sanitizeJobText(ld.hiringOrganization.name)
    : card.company;
  const location = (ld ? formatJsonLdLocation(ld) : null) ?? card.location;

  const rawDesc =
    ld?.description ??
    extractFirstTagText(
      html,
      /<(?:div|section)\b[^>]*(?:data-testid=["']job-description["']|class=["'][^"']*JobDescription[^"']*["'])[^>]*>([\s\S]*?)<\/(?:div|section)>/i,
    ) ??
    html;

  const description = sanitizeJobText(rawDesc).slice(0, 20_000);
  const salaryFromLd = ld?.baseSalary?.value;
  const salaryParsed = parseSalaryRangeFromText(html);

  const hasQuickApply = /lamar cepat|quick apply|easy apply/i.test(html);

  return {
    platform: "glints",
    external_id: card.external_id ?? extractGlintsExternalId(card.url),
    title,
    company,
    location,
    work_mode:
      inferWorkModeFromText(
        `${ld?.jobLocationType ?? ""} ${title} ${location ?? ""} ${description}`,
      ) ??
      card.work_mode ??
      null,
    salary_min:
      salaryFromLd?.minValue != null ? Number(salaryFromLd.minValue) || null : salaryParsed.salary_min,
    salary_max:
      salaryFromLd?.maxValue != null ? Number(salaryFromLd.maxValue) || null : salaryParsed.salary_max,
    description,
    url: card.url,
    posted_at: ld?.datePosted ?? null,
    apply_channel: hasQuickApply ? "easy_apply" : "link",
    hr_email: null,
  };
}

export function isGlintsBlocked(input: { status?: number | null; url: string; html: string }): {
  blocked: boolean;
  reason: string | null;
} {
  return detectBlockedSignals({
    ...input,
    extraUrlPatterns: [/glints\.com\/id\/login/],
    extraBodyPatterns: [/masuk ke glints untuk melanjutkan/],
  });
}

export const glintsAdapter: SourceAdapter = {
  platform: "glints",
  buildSearchUrl: buildGlintsSearchUrl,
  async isBlocked(page: Page, responseStatus?: number | null) {
    const result = await readPageBlockedSignal(page, responseStatus, {
      extraUrlPatterns: [/glints\.com\/id\/login/],
      extraBodyPatterns: [/masuk ke glints untuk melanjutkan/],
    });
    return result.blocked;
  },
  async *search(page: Page, query: SearchQuery) {
    const targetUrl = buildGlintsSearchUrl(query);
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const html = await page.content();
    const blockCheck = isGlintsBlocked({
      status: response?.status(),
      url: page.url(),
      html,
    });
    if (blockCheck.blocked) {
      throw new PlatformBlockedError("glints", blockCheck.reason ?? "Blocked");
    }

    const cards = parseGlintsSearchHtml(html, GLINTS_BASE_URL);
    for (const card of cards) {
      yield card;
    }
  },
  async detail(page: Page, card: JobCard): Promise<AdapterDetailResult> {
    const response = await page.goto(card.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const html = await page.content();
    const blockCheck = isGlintsBlocked({
      status: response?.status(),
      url: page.url(),
      html,
    });
    if (blockCheck.blocked) {
      throw new PlatformBlockedError("glints", blockCheck.reason ?? "Blocked");
    }

    return {
      job: parseGlintsDetailHtml(html, card),
      rawHtml: html,
    };
  },
};
