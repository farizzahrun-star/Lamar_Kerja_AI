import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupExpiredCvs, resolveCvStorageDirs, resolveSafeCvPath } from "./cleanup";
import type { WorkerSupabase } from "./supabase";

type Row = Record<string, unknown>;

interface FakeState {
  uploaded_cvs: Array<{ id: string; user_id: string; file_path: string; delete_after: string }>;
  audit_log: Row[];
}

function createFakeSupabase(state: FakeState): WorkerSupabase {
  return {
    from(table: keyof FakeState) {
      let cutoff: string | null = null;
      let targetId: string | null = null;
      let op: "select" | "delete" | "insert" = "select";
      let insertRow: Row | null = null;

      function apply() {
        if (table === "audit_log" && op === "insert" && insertRow) {
          state.audit_log.push(insertRow);
          return [];
        }

        if (table === "uploaded_cvs" && op === "delete") {
          state.uploaded_cvs = state.uploaded_cvs.filter((row) => row.id !== targetId);
          return [];
        }

        return state.uploaded_cvs.filter((row) => !cutoff || row.delete_after <= cutoff);
      }

      const builder = {
        select() {
          op = "select";
          return builder;
        },
        delete() {
          op = "delete";
          return builder;
        },
        insert(row: Row) {
          op = "insert";
          insertRow = row;
          return builder;
        },
        lte(_column: string, value: string) {
          cutoff = value;
          return builder;
        },
        eq(_column: string, value: string) {
          targetId = value;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        then(resolve: (value: { data: unknown; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: apply(), error: null }));
        },
      };

      return builder;
    },
  } as unknown as WorkerSupabase;
}

const tempRoot = path.resolve(process.cwd(), "data", "__cleanup-test__");

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("resolveSafeCvPath", () => {
  it("menerima path di dalam folder user dan menolak traversal", () => {
    expect(resolveSafeCvPath("/tmp/cv", "user-1", "user-1/file.pdf")).not.toBeNull();
    expect(resolveSafeCvPath("/tmp/cv", "user-1", "user-2/file.pdf")).toBeNull();
    expect(resolveSafeCvPath("/tmp/cv", "user-1", "../secret.pdf")).toBeNull();
    expect(resolveSafeCvPath("/tmp/cv", "user-1", "user-1/file.exe")).toBeNull();
  });
});

describe("resolveCvStorageDirs", () => {
  it("menyertakan direktori relatif dari root repo maupun apps/web", () => {
    const dirs = resolveCvStorageDirs("./data/cv", "/repo/workers");
    expect(dirs.some((d) => d.endsWith(path.join("apps", "web", "data", "cv")))).toBe(true);
  });
});

describe("cleanupExpiredCvs", () => {
  it("menghapus file dan baris yang sudah melewati delete_after serta mencatat audit", async () => {
    const userDir = path.join(tempRoot, "user-1");
    mkdirSync(userDir, { recursive: true });
    const expiredFile = path.join(userDir, "cv-expired.pdf");
    const activeFile = path.join(userDir, "cv-active.pdf");
    writeFileSync(expiredFile, "expired");
    writeFileSync(activeFile, "active");

    const state: FakeState = {
      uploaded_cvs: [
        {
          id: "cv-1",
          user_id: "user-1",
          file_path: "user-1/cv-expired.pdf",
          delete_after: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "cv-2",
          user_id: "user-1",
          file_path: "user-1/cv-active.pdf",
          delete_after: "2027-01-01T00:00:00.000Z",
        },
      ],
      audit_log: [],
    };

    const result = await cleanupExpiredCvs({
      supabase: createFakeSupabase(state),
      cvStorageDir: tempRoot,
      now: () => new Date("2026-06-01T00:00:00.000Z"),
      log: () => {},
    });

    expect(result).toEqual({ deletedRows: 1, deletedFiles: 1, skippedPaths: 0 });
    expect(existsSync(expiredFile)).toBe(false);
    expect(existsSync(activeFile)).toBe(true);
    expect(state.uploaded_cvs.map((r) => r.id)).toEqual(["cv-2"]);
    expect(state.audit_log).toHaveLength(1);
    expect(state.audit_log[0]?.action).toBe("cv.cleanup");
  });

  it("mengabaikan file dengan path tidak aman namun tetap menghapus baris kedaluwarsa", async () => {
    const state: FakeState = {
      uploaded_cvs: [
        {
          id: "cv-bad",
          user_id: "user-1",
          file_path: "../outside.pdf",
          delete_after: "2026-01-01T00:00:00.000Z",
        },
      ],
      audit_log: [],
    };

    const result = await cleanupExpiredCvs({
      supabase: createFakeSupabase(state),
      cvStorageDir: tempRoot,
      now: () => new Date("2026-06-01T00:00:00.000Z"),
      log: () => {},
    });

    expect(result).toEqual({ deletedRows: 1, deletedFiles: 0, skippedPaths: 1 });
    expect(state.uploaded_cvs).toHaveLength(0);
  });
});
