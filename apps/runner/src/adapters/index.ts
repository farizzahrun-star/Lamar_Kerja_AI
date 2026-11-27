import type { ActiveScrapePlatform } from "@lamarkerja/shared";

import { glintsAdapter } from "./glints";
import { jobstreetAdapter } from "./jobstreet";
import { linkedinAdapter } from "./linkedin";
import type { SourceAdapter } from "./types";

export const ADAPTER_REGISTRY: Record<ActiveScrapePlatform, SourceAdapter> = {
  glints: glintsAdapter,
  jobstreet: jobstreetAdapter,
  linkedin: linkedinAdapter,
};
