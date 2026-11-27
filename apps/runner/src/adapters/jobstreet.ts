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

const JOBSTREET_BASE_URL = "https://id.jobstreet.com";

export function buildJobstreetSearchUrl(query: SearchQuery): string {
  const url = new URL("/id/jobs", JOBSTREET_BASE_URL);
  url.searchParams.set("keywords", query.keyword);
  if (query.location) {
    url.searchParams.set("where", query.location);
  }
  return url.toString();
}

export function extractJobstreetExternalId(url: string): string | null {
  const match = /\/job\/(\d{5,})(?:[/?#]|$)/i.exec(url);
  return match?.[1] ?? null;
}

export function parseJobstreetSearchHtml(html: string, baseUrl = JOBSTREET_BASE_URL): JobCard[] {
  const cards: JobCard[] = [];
  const seenUrls = new Set<string>();

  const cardBlocks = html.match(
    /<article\b[^>]*(?:data-automation=["'](?:normalJob|jobCard)["']|data-job-id)[\s\S]*?<\/article>/gi,
  );

  for (const block of cardBlocks ?? []) {
    const linkMatch = /<a\b[^>]*href=["']([^"']*\/job\/[^"']+)["'][^>]*>/i.exec(block);
    const resolvedUrl = resolveAbsoluteUrl(baseUrl, linkMatch?.[1]);
    if (!resolvedUrl || seenUrls.has(resolvedUrl)) continue;

    const title =
      extractFirstTagText(
        block,
        /<a\b[^>]*data-automation=["']jobTitle["'][^>]*>([\s\S]*?)<\/a>/i,
      ) ??
      extractFirstTagText(block, /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
    if (!title) continue;

    const company =
      extractFirstTagText(
        block,
        /<a\b[^>]*data-automation=["']jobCompany["'][^>]*>([\s\S]*?)<\/a>/i,
      ) ??
      extractFirstTagText(
        block,
        /<span\b[^>]*data-automation=["']jobCompany["'][^>]*>([\s\S]*?)<\/span>/i,
      ) ??
      "Perusahaan Jobstreet";

    const location = extractFirstTagText(
      block,
      /<(?:a|span)\b[^>]*data-automation=["']jobLocation["'][^>]*>([\s\S]*?)<\/(?:a|span)>/i,
    );

    const dataId = extractAttribute(block, "data-job-id");
    seenUrls.add(resolvedUrl);

    cards.push({
      platform: "jobstreet",
      external_id: dataId ?? extractJobstreetExternalId(resolvedUrl),
      title,
      company,
      location,
      url: resolvedUrl,
      work_mode: inferWorkModeFromText(block),
    });
  }

  return cards;
}

export function parseJobstreetDetailHtml(html: string, card: JobCard): RawScrapedJob {
  const ld = extractJsonLdJobPostings(html)[0];

  const title =
    (ld?.title ? sanitizeJobText(ld.title) : null) ??
    extractFirstTagText(
      html,
      /<h1\b[^>]*data-automation=["']job-detail-title["'][^>]*>([\s\S]*?)<\/h1>/i,
    ) ??
    card.title;

  const company =
    (ld?.hiringOrganization?.name ? sanitizeJobText(ld.hiringOrganization.name) : null) ??
    extractFirstTagText(
      html,
      /<span\b[^>]*data-automation=["']advertiser-name["'][^>]*>([\s\S]*?)<\/span>/i,
    ) ??
    card.company;

  const location = (ld ? formatJsonLdLocation(ld) : null) ?? card.location;

  const rawDesc =
    ld?.description ??
    extractFirstTagText(
      html,
      /<div\b[^>]*data-automation=["']jobAdDetails["'][^>]*>([\s\S]*?)<\/div>/i,
    ) ??
    html;

  const description = sanitizeJobText(rawDesc).slice(0, 20_000);
  const salaryFromLd = ld?.baseSalary?.value;
  const salaryParsed = parseSalaryRangeFromText(html);
  const hasQuickApply = /quick apply|lamar cepat/i.test(html);

  return {
    platform: "jobstreet",
    external_id: card.external_id ?? extractJobstreetExternalId(card.url),
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

export function isJobstreetBlocked(input: { status?: number | null; url: string; html: string }): {
  blocked: boolean;
  reason: string | null;
} {
  return detectBlockedSignals({
    ...input,
    extraUrlPatterns: [/login\.seek\.com/, /jobstreet\.com\/id\/oauth/],
    extraBodyPatterns: [/verify you are not a robot/],
  });
}

export const jobstreetAdapter: SourceAdapter = {
  platform: "jobstreet",
  buildSearchUrl: buildJobstreetSearchUrl,
  async isBlocked(page: Page, responseStatus?: number | null) {
    const result = isJobstreetBlocked({
      status: responseStatus,
      url: page.url(),
      html: await page.content(),
    });
    return result.blocked;
  },
  async *search(page: Page, query: SearchQuery) {
    const targetUrl = buildJobstreetSearchUrl(query);
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const html = await page.content();
    const blockCheck = isJobstreetBlocked({
      status: response?.status(),
      url: page.url(),
      html,
    });
    if (blockCheck.blocked) {
      throw new PlatformBlockedError("jobstreet", blockCheck.reason ?? "Blocked");
    }

    const cards = parseJobstreetSearchHtml(html, JOBSTREET_BASE_URL);
    for (const card of cards) {
      yield card;
    }
  },
  async detail(page: Page, card: JobCard): Promise<AdapterDetailResult> {
    const response = await page.goto(card.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const html = await page.content();
    const blockCheck = isJobstreetBlocked({
      status: response?.status(),
      url: page.url(),
      html,
    });
    if (blockCheck.blocked) {
      throw new PlatformBlockedError("jobstreet", blockCheck.reason ?? "Blocked");
    }

    return {
      job: parseJobstreetDetailHtml(html, card),
      rawHtml: html,
    };
  },
};
