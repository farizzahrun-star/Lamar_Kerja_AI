import type { ActiveScrapePlatform, ApplyChannel, RawScrapedJob, SearchQuery, WorkMode } from "@lamarkerja/shared";
import type { Page } from "playwright";

export interface JobCard {
  platform: ActiveScrapePlatform;
  external_id: string | null;
  title: string;
  company: string;
  location: string | null;
  url: string;
  work_mode?: WorkMode | null;
  apply_channel_hint?: ApplyChannel | null;
}

export class PlatformBlockedError extends Error {
  readonly platform: ActiveScrapePlatform;
  readonly reason: string;

  constructor(platform: ActiveScrapePlatform, reason: string) {
    super(`Platform ${platform} diblokir: ${reason}`);
    this.name = "PlatformBlockedError";
    this.platform = platform;
    this.reason = reason;
  }
}

export interface AdapterDetailResult {
  job: RawScrapedJob;
  rawHtml: string;
}

export interface SourceAdapter {
  platform: ActiveScrapePlatform;
  buildSearchUrl(query: SearchQuery): string;
  search(page: Page, query: SearchQuery): AsyncIterable<JobCard>;
  detail(page: Page, card: JobCard): Promise<AdapterDetailResult>;
  isBlocked(page: Page, responseStatus?: number | null): Promise<boolean>;
}
