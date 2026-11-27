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
  resolveAbsoluteUrl,
} from "./shared";
import {
  PlatformBlockedError,
  type AdapterDetailResult,
  type JobCard,
  type SourceAdapter,
} from "./types";

const LINKEDIN_BASE_URL = "https://www.linkedin.com";

export function buildLinkedinSearchUrl(query: SearchQuery): string {
  const url = new URL("/jobs/search", LINKEDIN_BASE_URL);
  url.searchParams.set("keywords", query.keyword);
  if (query.location) {
    url.searchParams.set("location", query.location);
  }
  return url.toString();
}

export function extractLinkedinExternalId(url: string): string | null {
  const match = /\/jobs\/view\/(?:[^/?#]*-)?(\d{6,})(?:[/?#]|$)/i.exec(url);
  return match?.[1] ?? null;
}

export function parseLinkedinSearchHtml(html: string, baseUrl = LINKEDIN_BASE_URL): JobCard[] {
  const cards: JobCard[] = [];
  const seenUrls = new Set<string>();

  const cardBlocks = html.match(
    /<(?:div|li)\b[^>]*class=["'][^"']*(?:base-card|job-search-card)[^"']*["'][\s\S]*?<\/(?:div|li)>/gi,
  );

  for (const block of cardBlocks ?? []) {
    const linkMatch = /<a\b[^>]*href=["']([^"']*\/jobs\/view\/[^"']+)["'][^>]*>/i.exec(block);
    const resolvedUrl = resolveAbsoluteUrl(baseUrl, linkMatch?.[1]);
    if (!resolvedUrl || seenUrls.has(resolvedUrl)) continue;

    const title =
      extractFirstTagText(
        block,
        /<h3\b[^>]*class=["'][^"']*base-search-card__title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i,
      ) ?? extractFirstTagText(block, /<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!title) continue;

    const company =
      extractFirstTagText(
        block,
        /<h4\b[^>]*class=["'][^"']*base-search-card__subtitle[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i,
      ) ?? "Perusahaan LinkedIn";

    const location = extractFirstTagText(
      block,
      /<span\b[^>]*class=["'][^"']*job-search-card__location[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    );

    const entityUrn = extractAttribute(block, "data-entity-urn");
    const urnId = entityUrn?.split(":").pop() ?? null;
    seenUrls.add(resolvedUrl);

    cards.push({
      platform: "linkedin",
      external_id: urnId ?? extractLinkedinExternalId(resolvedUrl),
      title,
      company,
      location,
      url: resolvedUrl,
      work_mode: inferWorkModeFromText(block),
    });
  }

  return cards;
}

export function parseLinkedinDetailHtml(html: string, card: JobCard): RawScrapedJob {
  const ld = extractJsonLdJobPostings(html)[0];

  const title =
    (ld?.title ? sanitizeJobText(ld.title) : null) ??
    extractFirstTagText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
    card.title;

  const company =
    (ld?.hiringOrganization?.name ? sanitizeJobText(ld.hiringOrganization.name) : null) ??
    card.company;

  const location = (ld ? formatJsonLdLocation(ld) : null) ?? card.location;

  const rawDesc =
    ld?.description ??
    extractFirstTagText(
      html,
      /<div\b[^>]*class=["'][^"']*(?:show-more-less-html__markup|description__text)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ) ??
    html;

  const description = sanitizeJobText(rawDesc).slice(0, 20_000);
  const salaryFromLd = ld?.baseSalary?.value;
  const salaryParsed = parseSalaryRangeFromText(html);
  const hasEasyApply = /easy apply/i.test(html);

  return {
    platform: "linkedin",
    external_id: card.external_id ?? extractLinkedinExternalId(card.url),
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
    apply_channel: hasEasyApply ? "easy_apply" : "link",
    hr_email: null,
  };
}

export function isLinkedinBlocked(input: { status?: number | null; url: string; html: string }): {
  blocked: boolean;
  reason: string | null;
} {
  return detectBlockedSignals({
    ...input,
    extraUrlPatterns: [/linkedin\.com\/uas\/login/, /linkedin\.com\/authwall/],
    extraBodyPatterns: [/sign in to view more jobs/, /join linkedin/, /authwall/],
  });
}

export const linkedinAdapter: SourceAdapter = {
  platform: "linkedin",
  buildSearchUrl: buildLinkedinSearchUrl,
  async isBlocked(page: Page, responseStatus?: number | null) {
    const result = isLinkedinBlocked({
      status: responseStatus,
      url: page.url(),
      html: await page.content(),
    });
    return result.blocked;
  },
  async *search(page: Page, query: SearchQuery) {
    const targetUrl = buildLinkedinSearchUrl(query);
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const html = await page.content();
    const blockCheck = isLinkedinBlocked({
      status: response?.status(),
      url: page.url(),
      html,
    });
    if (blockCheck.blocked) {
      throw new PlatformBlockedError("linkedin", blockCheck.reason ?? "Blocked");
    }

    const cards = parseLinkedinSearchHtml(html, LINKEDIN_BASE_URL);
    for (const card of cards) {
      yield card;
    }
  },
  async detail(page: Page, card: JobCard): Promise<AdapterDetailResult> {
    const response = await page.goto(card.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const html = await page.content();
    const blockCheck = isLinkedinBlocked({
      status: response?.status(),
      url: page.url(),
      html,
    });
    if (blockCheck.blocked) {
      throw new PlatformBlockedError("linkedin", blockCheck.reason ?? "Blocked");
    }

    return {
      job: parseLinkedinDetailHtml(html, card),
      rawHtml: html,
    };
  },
};
