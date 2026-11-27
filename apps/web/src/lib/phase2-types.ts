import type { Database } from "@lamarkerja/db";
import type {
  ActiveScrapePlatform,
  ApplicationStatus,
  ApplyChannel,
  JobPlatform,
  PlatformSessionStatus,
  RunnerAlert,
  WorkMode,
} from "@lamarkerja/shared";

export type InterestRow = Database["public"]["Tables"]["interests"]["Row"];
export type UserPlatformRow = Database["public"]["Tables"]["user_platforms"]["Row"];
export type UserSettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];
export type JobSourceRow = Database["public"]["Tables"]["job_sources"]["Row"];
export type CollectorRunRow = Database["public"]["Tables"]["collector_runs"]["Row"];

export interface PreferencesBundle {
  interests: InterestRow[];
  selectedInterestIds: string[];
  platforms: Array<{
    platform: ActiveScrapePlatform;
    enabled: boolean;
    session_status: PlatformSessionStatus;
    last_checked_at: string | null;
  }>;
  settings: {
    apply_daily_limit: number;
    review_before_send: boolean;
    portal_auto_submit: boolean;
  };
}

export interface PlatformStatusSummary {
  platform: JobPlatform;
  sourceEnabled: boolean;
  lastRunDate: string | null;
  lastRunAt: string | null;
  blocked: boolean;
  found: number;
  newCount: number;
  errorCount: number;
  lastError: string | null;
}

export interface JobFeedItem {
  id: string;
  title: string;
  company: string;
  location: string | null;
  work_mode: WorkMode | null;
  salary_min: number | null;
  salary_max: number | null;
  description_preview: string;
  url: string | null;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  snapshot_dates: string[];
  platforms: JobPlatform[];
  primary_platform: JobPlatform;
  best_channel: ApplyChannel;
  hr_emails_count: number;
  has_hr_email: boolean;
  application: {
    id: string;
    status: ApplicationStatus;
    channel: ApplyChannel;
    queued_at: string;
  } | null;
}

export interface JobsFeedMeta {
  snapshotMode: "h1" | "today" | "all";
  requestedDate: string;
  snapshotDate: string | null;
  isFallback: boolean;
  lastRunAt: string | null;
  availableDates: string[];
  interestLabels: string[];
  filteredByInterest: boolean;
  totalInSnapshot: number;
  dailyQuota: {
    used: number;
    limit: number;
    remaining: number;
  };
  platformStatus: PlatformStatusSummary[];
}

export interface JobsFeedResponse {
  items: JobFeedItem[];
  meta: JobsFeedMeta;
}

export interface JobDetailData {
  id: string;
  title: string;
  company: string;
  location: string | null;
  work_mode: WorkMode | null;
  salary_min: number | null;
  salary_max: number | null;
  description: string;
  url: string | null;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  source: {
    platform: JobPlatform;
    type: string;
    name: string;
  } | null;
  urls: Array<{
    id: string;
    platform: JobPlatform;
    url: string;
    apply_channel: ApplyChannel;
    is_primary: boolean;
  }>;
  contacts: Array<{
    id: string;
    hr_email: string;
    source: string;
  }>;
  snapshot_dates: string[];
  best_channel: ApplyChannel;
  application: {
    id: string;
    status: ApplicationStatus;
    channel: ApplyChannel;
    queued_at: string;
    cancelled_at: string | null;
  } | null;
  dailyQuota: {
    used: number;
    limit: number;
    remaining: number;
  };
}

export interface ApplicationListItem {
  id: string;
  job_id: string;
  channel: ApplyChannel;
  status: ApplicationStatus;
  match_score: number | null;
  recipient_email: string | null;
  last_error: string | null;
  queued_at: string;
  ready_at: string | null;
  sent_at: string | null;
  replied_at: string | null;
  cancelled_at: string | null;
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    work_mode: WorkMode | null;
    url: string | null;
  } | null;
  events: Array<{
    id: string;
    event_type: string;
    payload_json: Record<string, unknown>;
    created_at: string;
  }>;
}

export interface ApplicationsOverview {
  items: ApplicationListItem[];
  quota: {
    used: number;
    limit: number;
    remaining: number;
    dateWib: string;
  };
  countsByStatus: Record<string, number>;
}

export interface RunnerTokenItem {
  id: string;
  name: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface RunnerDashboardData {
  runners: RunnerTokenItem[];
  sources: JobSourceRow[];
  runs: CollectorRunRow[];
  alerts: RunnerAlert[];
  platformStatus: PlatformStatusSummary[];
  adminAccess: {
    canManageSources: boolean;
    openDevMode: boolean;
  };
}

export interface ManualIngestResult {
  created: number;
  deduplicated: number;
  jobIds: string[];
  snapshotDate: string;
}

export interface CsvImportResponse extends ManualIngestResult {
  skipped: number;
  errors: Array<{ rowNumber: number; message: string }>;
}
