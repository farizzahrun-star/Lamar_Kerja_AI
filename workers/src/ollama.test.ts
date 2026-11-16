import { describe, expect, it } from "vitest";

import { createOllamaClient, extractJsonObject, OllamaError } from "./ollama";

describe("extractJsonObject", () => {
  it("mem-parse JSON polos", () => {
    expect(extractJsonObject('{"items":[]}')).toEqual({ items: [] });
  });

  it("mem-parse JSON di dalam pagar kode", () => {
    expect(extractJsonObject('```json\n{"items":[{"name":"Go"}]}\n```')).toEqual({
      items: [{ name: "Go" }],
    });
  });

  it("mengambil objek pertama bila ada teks tambahan", () => {
    expect(extractJsonObject('Berikut hasilnya: {"items":[]} semoga membantu')).toEqual({
      items: [],
    });
  });

  it("melempar EMPTY_RESPONSE dan INVALID_JSON", () => {
    expect(() => extractJsonObject("   ")).toThrowError(
      expect.objectContaining({ code: "EMPTY_RESPONSE" }),
    );
    expect(() => extractJsonObject("bukan json")).toThrowError(
      expect.objectContaining({ code: "INVALID_JSON" }),
    );
  });
});

describe("createOllamaClient", () => {
  const schema = { type: "object", properties: { items: { type: "array" } } };

  it("mengirim think:false, format schema, dan mengembalikan JSON", async () => {
    const captured: { body: Record<string, unknown> | null } = { body: null };

    const client = createOllamaClient({
      baseUrl: "http://ollama.test/",
      model: "qwen3:4b",
      numCtx: 4096,
      timeoutMs: 5_000,
      fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
        captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ message: { content: '{"items":[]}' } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    });

    const result = await client.chatJson({
      system: "sistem",
      prompt: "prompt",
      schema,
    });

    expect(result).toEqual({ items: [] });
    expect(captured.body).toMatchObject({
      model: "qwen3:4b",
      stream: false,
      think: false,
      format: schema,
    });
    expect(captured.body?.options).toMatchObject({ num_ctx: 4096 });
  });

  it("melempar TIMEOUT saat request melebihi batas waktu", async () => {
    const client = createOllamaClient({
      baseUrl: "http://ollama.test",
      model: "qwen3:4b",
      numCtx: 2048,
      timeoutMs: 20,
      fetchImpl: ((_url: string | URL | Request, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        })) as typeof fetch,
    });

    await expect(
      client.chatJson({ system: "s", prompt: "p", schema }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("melempar HTTP_ERROR saat Ollama membalas non-2xx", async () => {
    const client = createOllamaClient({
      baseUrl: "http://ollama.test",
      model: "qwen3:4b",
      numCtx: 2048,
      timeoutMs: 1_000,
      fetchImpl: (async () => new Response("model not found", { status: 404 })) as typeof fetch,
    });

    await expect(client.chatJson({ system: "s", prompt: "p", schema })).rejects.toBeInstanceOf(
      OllamaError,
    );
  });
});
