import {
  APPLY_CHANNELS,
  csvJobRowSchema,
  type ApplyChannel,
  type CsvJobRow,
  type JobPlatform,
  type WorkMode,
} from "./phase2-schemas";

const TRACKING_QUERY_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "trk",
  "trackingid",
  "currentjobid",
]);

const IGNORED_EMAIL_LOCAL_PARTS = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "webmaster",
]);

const GENERIC_INTEREST_TOKENS = new Set([
  "and",
  "dan",
  "engineer",
  "developer",
  "specialist",
  "manager",
  "staff",
  "officer",
  "associate",
  "lead",
  "senior",
  "junior",
  "intern",
  "magang",
  "admin",
]);

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Membersihkan HTML/teks mentah lowongan (untrusted input) menjadi teks aman
 * dengan spasi dan baris baru yang rapi.
 */
export function sanitizeJobText(raw: string | null | undefined): string {
  if (!raw) return "";

  let cleaned = raw
    .replace(/\u0000/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|tr|ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ");

  cleaned = cleaned.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/gi, (entity) => {
    return HTML_ENTITY_MAP[entity.toLowerCase()] ?? entity;
  });

  return cleaned
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function canonicalizeJobUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";

  const keptParams: Array<[string, string]> = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith("utm_") || TRACKING_QUERY_PARAMS.has(lowerKey)) {
      continue;
    }
    keptParams.push([key, value]);
  }

  keptParams.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  parsed.search = "";
  for (const [key, value] of keptParams) {
    parsed.searchParams.append(key, value);
  }

  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  }

  return parsed.toString();
}

// Implementasi SHA-256 murni (FIPS 180-4) agar identik di Node & browser tanpa `node:crypto`.
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x1_0000_0000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }

  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

export function buildJobRawHashInput(input: {
  title: string;
  company: string;
  location?: string | null;
}): string {
  const norm = (value: string | null | undefined) =>
    (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(input.title)}|${norm(input.company)}|${norm(input.location)}`;
}

export function computeJobRawHash(input: {
  title: string;
  company: string;
  location?: string | null;
}): string {
  return sha256Hex(buildJobRawHashInput(input));
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;

export function extractHrEmails(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) ?? [];
  const seen = new Set<string>();
  const results: string[] = [];

  for (const rawEmail of matches) {
    const email = rawEmail.toLowerCase().replace(/\.+$/, "");
    const [localPart, domain] = email.split("@");
    if (!localPart || !domain) continue;
    if (IGNORED_EMAIL_LOCAL_PARTS.has(localPart)) continue;
    if (/\.(?:png|jpe?g|gif|svg|webp|css|js)$/i.test(domain)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    results.push(email);
  }

  return results;
}

export function inferPlatformFromUrl(rawUrl: string | null | undefined): JobPlatform {
  const canonical = canonicalizeJobUrl(rawUrl);
  if (!canonical) return "manual";

  const host = new URL(canonical).hostname;
  if (host === "glints.com" || host.endsWith(".glints.com")) return "glints";
  if (host.includes("jobstreet.") || host.includes("seek.com")) return "jobstreet";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (host.includes("glassdoor.")) return "glassdoor";
  return "manual";
}

export function detectApplyChannel(input: {
  hrEmails?: string[];
  explicitChannel?: ApplyChannel | null;
  platform?: JobPlatform | null;
  url?: string | null;
}): ApplyChannel {
  if (input.hrEmails && input.hrEmails.length > 0) {
    return "email";
  }
  if (input.explicitChannel) {
    return input.explicitChannel;
  }
  if (input.platform === "glints" || input.platform === "jobstreet" || input.platform === "linkedin") {
    return "link";
  }
  if (input.url) {
    return "link";
  }
  return "link";
}

export function selectBestApplicationChannel(
  channels: ApplyChannel[],
  hasHrEmail: boolean,
): ApplyChannel {
  if (hasHrEmail) return "email";
  for (const preferred of APPLY_CHANNELS) {
    if (channels.includes(preferred)) {
      return preferred;
    }
  }
  return "link";
}

export function matchesUserInterests(
  job: { title: string; description: string },
  interestLabels: string[],
): boolean {
  if (interestLabels.length === 0) return true;

  const haystack = `${job.title}\n${job.description}`.toLowerCase();

  for (const label of interestLabels) {
    const cleanLabel = label.trim().toLowerCase();
    if (!cleanLabel) continue;
    if (haystack.includes(cleanLabel)) return true;

    const tokens = cleanLabel
      .split(/[^a-z0-9+.#]+/)
      .filter((token) => token.length >= 2 && !GENERIC_INTEREST_TOKENS.has(token));

    if (tokens.length > 0 && tokens.every((token) => haystack.includes(token))) {
      return true;
    }
  }

  return false;
}

export interface CsvParseErrorItem {
  rowNumber: number;
  message: string;
}

export interface CsvParseResult {
  rows: CsvJobRow[];
  errors: CsvParseErrorItem[];
}

function parseCsvMatrix(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

const CSV_HEADER_ALIASES: Record<string, keyof CsvJobRow> = {
  title: "title",
  judul: "title",
  posisi: "title",
  company: "company",
  perusahaan: "company",
  location: "location",
  lokasi: "location",
  work_mode: "work_mode",
  workmode: "work_mode",
  description: "description",
  deskripsi: "description",
  url: "url",
  link: "url",
  posted_at: "posted_at",
  postedat: "posted_at",
  salary_min: "salary_min",
  salary_max: "salary_max",
  external_id: "external_id",
  source_name: "source_name",
  hr_email: "hr_email",
  email_hr: "hr_email",
};

export function parseJobsCsv(csvText: string): CsvParseResult {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) {
    return {
      rows: [],
      errors: [
        {
          rowNumber: 1,
          message: "CSV harus berisi header kolom dan minimal satu baris data.",
        },
      ],
    };
  }

  const headerCells = matrix[0]!.map((cell) => cell.trim().toLowerCase());
  const columnMap = new Map<number, keyof CsvJobRow>();
  headerCells.forEach((header, index) => {
    const mapped = CSV_HEADER_ALIASES[header];
    if (mapped) columnMap.set(index, mapped);
  });

  const mappedValues = new Set(columnMap.values());
  if (!mappedValues.has("title") || !mappedValues.has("company")) {
    return {
      rows: [],
      errors: [
        {
          rowNumber: 1,
          message: "Header CSV wajib memuat kolom `title` dan `company`.",
        },
      ],
    };
  }

  const rows: CsvJobRow[] = [];
  const errors: CsvParseErrorItem[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i]!;
    const rawObject: Record<string, string> = {};
    for (const [colIdx, key] of columnMap.entries()) {
      rawObject[key] = (cells[colIdx] ?? "").trim();
    }

    const parsed = csvJobRowSchema.safeParse(rawObject);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => issue.message).join("; ");
      errors.push({ rowNumber: i + 1, message: messages });
      continue;
    }

    rows.push(parsed.data);
  }

  return { rows, errors };
}

export interface RawJobInput {
  title: string;
  company: string;
  location?: string | null;
  work_mode?: WorkMode | null;
  salary_min?: number | null;
  salary_max?: number | null;
  description?: string | null;
  url?: string | null;
  posted_at?: string | null;
  external_id?: string | null;
  source_name?: string | null;
  hr_email?: string | null;
  platform?: JobPlatform | null;
  apply_channel?: ApplyChannel | null;
}

export interface NormalizedJob {
  title: string;
  company: string;
  location: string | null;
  work_mode: WorkMode | null;
  salary_min: number | null;
  salary_max: number | null;
  description: string;
  url: string | null;
  posted_at: string | null;
  external_id: string | null;
  raw_hash: string;
  platform: JobPlatform;
  apply_channel: ApplyChannel;
  hr_emails: Array<{ email: string; source: "description" | "manual" }>;
}

export function prepareNormalizedJob(input: RawJobInput): NormalizedJob {
  const title = sanitizeJobText(input.title).replace(/\n+/g, " ").slice(0, 180);
  const company = sanitizeJobText(input.company).replace(/\n+/g, " ").slice(0, 160);
  const locationRaw = input.location ? sanitizeJobText(input.location).replace(/\n+/g, " ") : "";
  const location = locationRaw ? locationRaw.slice(0, 160) : null;

  const canonicalUrl = canonicalizeJobUrl(input.url ?? null);
  const sanitizedDescription = sanitizeJobText(input.description ?? "");
  const description =
    sanitizedDescription ||
    (canonicalUrl ? `Lowongan ${title} di ${company}. Tautan: ${canonicalUrl}` : `${title} — ${company}`);

  const platform = input.platform ?? inferPlatformFromUrl(canonicalUrl);
  const extractedEmails = extractHrEmails(description);
  const manualEmail = input.hr_email?.trim().toLowerCase() || null;

  const emailMap = new Map<string, "description" | "manual">();
  for (const email of extractedEmails) {
    emailMap.set(email, "description");
  }
  if (manualEmail) {
    emailMap.set(manualEmail, "manual");
  }

  const hrEmails = [...emailMap.entries()].map(([email, source]) => ({ email, source }));
  const applyChannel = detectApplyChannel({
    hrEmails: hrEmails.map((item) => item.email),
    explicitChannel: input.apply_channel ?? null,
    platform,
    url: canonicalUrl,
  });

  const salaryMin = input.salary_min ?? null;
  const salaryMax =
    input.salary_max != null && salaryMin != null && input.salary_max < salaryMin
      ? salaryMin
      : (input.salary_max ?? null);

  return {
    title,
    company,
    location,
    work_mode: input.work_mode ?? null,
    salary_min: salaryMin,
    salary_max: salaryMax,
    description,
    url: canonicalUrl,
    posted_at: input.posted_at ?? null,
    external_id: input.external_id?.trim() || null,
    raw_hash: computeJobRawHash({ title, company, location }),
    platform,
    apply_channel: applyChannel,
    hr_emails: hrEmails,
  };
}

