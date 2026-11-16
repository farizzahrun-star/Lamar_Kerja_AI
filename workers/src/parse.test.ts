import { describe, expect, it } from "vitest";

import { CircuitBreaker } from "./circuit-breaker";
import { OllamaError, type OllamaClient } from "./ollama";
import { claimRun, processRun, skipAllPendingRuns, type ParseDeps, type ParseRunRow } from "./parse";
import type { WorkerSupabase } from "./supabase";

type Row = Record<string, unknown>;

interface FakeState {
  cv_parse_runs: Row[];
  cv_parse_suggestions: Row[];
  uploaded_cvs: Row[];
  user_consents: Row[];
}

type Op = "select" | "update" | "delete" | "insert";

function createFakeSupabase(state: FakeState) {
  let autoId = 0;

  function makeBuilder(table: keyof FakeState) {
    const filters: Array<(row: Row) => boolean> = [];
    let op: Op = "select";
    let patch: Row = {};
    let insertRows: Row[] = [];
    let wantRows = true;

    function apply(): Row[] {
      const rows = state[table];
      if (op === "insert") {
        const inserted = insertRows.map((row) => ({
          id: `00000000-0000-0000-0000-${String(++autoId).padStart(12, "0")}`,
          created_at: new Date().toISOString(),
          status: "pending",
          ...row,
        }));
        rows.push(...inserted);
        return wantRows ? inserted : [];
      }

      const matched = rows.filter((row) => filters.every((fn) => fn(row)));

      if (op === "update") {
        for (const row of matched) Object.assign(row, patch);
        return wantRows ? matched : [];
      }

      if (op === "delete") {
        for (const row of matched) rows.splice(rows.indexOf(row), 1);
        return wantRows ? matched : [];
      }

      return matched;
    }

    const builder = {
      select() {
        wantRows = true;
        return builder;
      },
      update(next: Row) {
        op = "update";
        patch = next;
        wantRows = false;
        return builder;
      },
      delete() {
        op = "delete";
        wantRows = false;
        return builder;
      },
      insert(rows: Row | Row[]) {
        op = "insert";
        insertRows = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      is(column: string, value: unknown) {
        filters.push((row) => (value === null ? row[column] === null : row[column] === value));
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      async maybeSingle() {
        const rows = apply();
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const rows = apply();
        return { data: rows[0] ?? null, error: rows[0] ? null : { code: "NO_ROWS" } };
      },
      then(
        resolve: (value: { data: Row[] | null; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        try {
          return Promise.resolve(resolve({ data: apply(), error: null }));
        } catch (error) {
          return Promise.resolve(reject?.(error));
        }
      },
    };

    return builder;
  }

  return {
    from(table: keyof FakeState) {
      return makeBuilder(table);
    },
  };
}

function makeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    cv_parse_runs: [],
    cv_parse_suggestions: [],
    uploaded_cvs: [],
    user_consents: [],
    ...overrides,
  };
}

const CV_TEXT =
  "Budi Santoso adalah Senior Software Engineer dengan pengalaman membangun layanan backend menggunakan TypeScript dan PostgreSQL.";

function baseRun(overrides: Row = {}): ParseRunRow {
  return {
    id: "run-1",
    uploaded_cv_id: "cv-1",
    user_id: "user-1",
    section: "identity",
    model: "qwen3:4b",
    consent_version: "2026-11-06.v1",
    status: "running",
    attempts: 1,
    created_at: new Date().toISOString(),
    duration_ms: null,
    output_json: null,
    error_code: null,
    started_at: new Date().toISOString(),
    finished_at: null,
    ...overrides,
  } as ParseRunRow;
}

function makeDeps(
  state: FakeState,
  ollama: OllamaClient,
  overrides: Partial<ParseDeps> = {},
): ParseDeps {
  return {
    supabase: createFakeSupabase(state) as unknown as WorkerSupabase,
    ollama,
    breaker: new CircuitBreaker(),
    maxAttempts: 2,
    log: () => {},
    ...overrides,
  };
}

const VALID_IDENTITY_OUTPUT = {
  items: [
    {
      field: "full_name",
      value: "Budi Santoso",
      confidence: 0.97,
      source_snippet: "Budi Santoso",
    },
    {
      field: "headline",
      value: "Senior Software Engineer",
      confidence: 0.93,
      source_snippet: "Senior Software Engineer",
    },
  ],
};

function ollamaReturning(outputs: unknown[]): OllamaClient {
  let call = 0;
  return {
    model: "qwen3:4b",
    async chatJson() {
      const output = outputs[Math.min(call, outputs.length - 1)];
      call += 1;
      return output;
    },
  };
}

describe("claimRun", () => {
  it("mengklaim satu run pending menjadi running dan menaikkan attempts", async () => {
    const state = makeState({ cv_parse_runs: [baseRun({ id: "run-a", status: "pending", attempts: 0 })] });
    const deps = makeDeps(state, ollamaReturning([VALID_IDENTITY_OUTPUT]));

    const claimed = await claimRun(deps);
    expect(claimed?.id).toBe("run-a");
    expect(state.cv_parse_runs[0]).toMatchObject({ status: "running", attempts: 1 });
    expect(state.cv_parse_runs[0]?.started_at).not.toBeNull();

    const second = await claimRun(deps);
    expect(second).toBeNull();
  });
});

describe("processRun", () => {
  it("menandai skipped bila consent sudah dicabut", async () => {
    const run = baseRun();
    const state = makeState({
      cv_parse_runs: [run],
      uploaded_cvs: [{ id: "cv-1", text_content: CV_TEXT, status: "extracted", delete_after: future() }],
      user_consents: [],
    });

    const outcome = await processRun(makeDeps(state, ollamaReturning([VALID_IDENTITY_OUTPUT])), run);

    expect(outcome).toMatchObject({ kind: "skipped", code: "CONSENT_REVOKED" });
    expect(state.cv_parse_runs[0]).toMatchObject({
      status: "skipped",
      error_code: "CONSENT_REVOKED",
    });
  });

  it("menandai skipped bila versi consent run sudah usang", async () => {
    const run = baseRun({ consent_version: "2025-01-01.v0" });
    const state = makeState({ cv_parse_runs: [run] });

    const outcome = await processRun(makeDeps(state, ollamaReturning([VALID_IDENTITY_OUTPUT])), run);

    expect(outcome).toMatchObject({ kind: "skipped", code: "CONSENT_OUTDATED" });
  });

  it("menandai skipped bila CV tidak punya teks (hasil scan)", async () => {
    const run = baseRun();
    const state = makeState({
      cv_parse_runs: [run],
      uploaded_cvs: [{ id: "cv-1", text_content: "", status: "skipped", delete_after: future() }],
      user_consents: [
        { user_id: "user-1", kind: "cv_ai_processing", version: "2026-11-06.v1", revoked_at: null },
      ],
    });

    const outcome = await processRun(makeDeps(state, ollamaReturning([VALID_IDENTITY_OUTPUT])), run);

    expect(outcome).toMatchObject({ kind: "skipped", code: "NO_EXTRACTABLE_TEXT" });
  });

  it("menyimpan saran yang grounded dan menandai run parsed", async () => {
    const run = baseRun();
    const state = makeState({
      cv_parse_runs: [run],
      uploaded_cvs: [{ id: "cv-1", text_content: CV_TEXT, status: "extracted", delete_after: future() }],
      user_consents: [
        { user_id: "user-1", kind: "cv_ai_processing", version: "2026-11-06.v1", revoked_at: null },
      ],
    });

    const outcome = await processRun(makeDeps(state, ollamaReturning([VALID_IDENTITY_OUTPUT])), run);

    expect(outcome).toMatchObject({ kind: "parsed", suggestions: 2, dropped: 0 });
    expect(state.cv_parse_runs[0]).toMatchObject({ status: "parsed", error_code: null });
    expect(state.cv_parse_runs[0]?.output_json).toMatchObject({ promptVersion: "2026-11-16.v1" });
    expect(state.cv_parse_suggestions).toHaveLength(2);
    expect(state.cv_parse_suggestions[0]).toMatchObject({
      parse_run_id: "run-1",
      user_id: "user-1",
      section: "identity",
      field_path: "full_name",
      status: "pending",
    });
  });

  it("memperbaiki keluaran tidak valid satu kali sebelum menyerah", async () => {
    const run = baseRun();
    const state = makeState({
      cv_parse_runs: [run],
      uploaded_cvs: [{ id: "cv-1", text_content: CV_TEXT, status: "extracted", delete_after: future() }],
      user_consents: [
        { user_id: "user-1", kind: "cv_ai_processing", version: "2026-11-06.v1", revoked_at: null },
      ],
    });

    const invalid = {
      items: [{ field: "nama_lengkap", value: "Budi", confidence: 5, source_snippet: "Budi" }],
    };

    const outcome = await processRun(
      makeDeps(state, ollamaReturning([invalid, VALID_IDENTITY_OUTPUT])),
      run,
    );

    expect(outcome).toMatchObject({ kind: "parsed", suggestions: 2 });
    expect(state.cv_parse_runs[0]?.output_json).toMatchObject({ repaired: true });
  });

  it("menjadwalkan retry saat Ollama gagal, lalu failed ketika batas attempt tercapai", async () => {
    const run = baseRun({ attempts: 1 });
    const state = makeState({
      cv_parse_runs: [run],
      uploaded_cvs: [{ id: "cv-1", text_content: CV_TEXT, status: "extracted", delete_after: future() }],
      user_consents: [
        { user_id: "user-1", kind: "cv_ai_processing", version: "2026-11-06.v1", revoked_at: null },
      ],
    });

    const failingOllama: OllamaClient = {
      model: "qwen3:4b",
      async chatJson() {
        throw new OllamaError("NETWORK", "mati");
      },
    };

    const first = await processRun(makeDeps(state, failingOllama), run);
    expect(first).toMatchObject({ kind: "failed", code: "OLLAMA_UNAVAILABLE", retryable: true });
    expect(state.cv_parse_runs[0]).toMatchObject({
      status: "pending",
      error_code: "OLLAMA_UNAVAILABLE",
    });

    state.cv_parse_runs[0]!.status = "running";
    state.cv_parse_runs[0]!.attempts = 2;

    const second = await processRun(makeDeps(state, failingOllama), state.cv_parse_runs[0] as never);
    expect(second).toMatchObject({ kind: "failed", retryable: false });
    expect(state.cv_parse_runs[0]).toMatchObject({ status: "failed" });
  });

  it("menolak memproses saat circuit breaker terbuka", async () => {
    const run = baseRun();
    const state = makeState({
      cv_parse_runs: [run],
      uploaded_cvs: [{ id: "cv-1", text_content: CV_TEXT, status: "extracted", delete_after: future() }],
      user_consents: [
        { user_id: "user-1", kind: "cv_ai_processing", version: "2026-11-06.v1", revoked_at: null },
      ],
    });

    const breaker = new CircuitBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    const outcome = await processRun(
      makeDeps(state, ollamaReturning([VALID_IDENTITY_OUTPUT]), { breaker }),
      run,
    );

    expect(outcome).toMatchObject({ kind: "failed", code: "CIRCUIT_OPEN" });
  });
});

describe("skipAllPendingRuns", () => {
  it("menandai seluruh run pending sebagai skipped AI_DISABLED", async () => {
    const state = makeState({
      cv_parse_runs: [
        baseRun({ id: "run-1", status: "pending" }),
        baseRun({ id: "run-2", status: "running" }),
      ],
    });

    const skipped = await skipAllPendingRuns(makeDeps(state, ollamaReturning([])));

    expect(skipped).toBe(1);
    expect(state.cv_parse_runs[0]).toMatchObject({
      status: "skipped",
      error_code: "AI_DISABLED",
    });
    expect(state.cv_parse_runs[1]?.status).toBe("running");
  });
});

function future(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}
