import type { CvParseSection } from "@lamarkerja/shared";

import type { MergeDecision } from "@/lib/cv/merge";
import type { ProfileBundle } from "@/lib/profile-types";

/**
 * Tipe data halaman review CV. Aman diimpor komponen client karena hanya berisi
 * tipe dan tidak menarik kode server.
 */

export type ReviewSuggestionStatus = "pending" | "accepted" | "rejected";
export type ReviewRunStatus = "pending" | "running" | "parsed" | "failed" | "skipped";
export type ReviewCvStatus = "uploaded" | "extracted" | "skipped";

export interface CvReviewSuggestion {
  id: string;
  parse_run_id: string;
  section: CvParseSection;
  field_path: string;
  value_json: unknown;
  confidence: number;
  source_snippet: string | null;
  status: ReviewSuggestionStatus;
  created_at: string;
  decided_at: string | null;
}

export interface CvReviewRun {
  id: string;
  section: CvParseSection;
  status: ReviewRunStatus;
  error_code: string | null;
  attempts: number;
  finished_at: string | null;
}

export interface CvReviewGroup {
  cv: {
    id: string;
    original_filename: string;
    status: ReviewCvStatus;
    created_at: string;
    delete_after: string;
  };
  runs: CvReviewRun[];
  suggestions: CvReviewSuggestion[];
}

export interface CvReviewData {
  groups: CvReviewGroup[];
  bundle: ProfileBundle;
}

export interface ReviewDecisionResponse {
  action: "accept" | "reject";
  requested: number;
  decided: number;
  applied: number;
  duplicates: number;
  invalid: number;
  skipped: number;
  decided_ids: string[];
  decisions: MergeDecision[];
}
