export type OllamaErrorCode =
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "NETWORK"
  | "EMPTY_RESPONSE"
  | "INVALID_JSON";

export class OllamaError extends Error {
  readonly code: OllamaErrorCode;
  readonly status?: number;

  constructor(code: OllamaErrorCode, message: string, status?: number) {
    super(message);
    this.name = "OllamaError";
    this.code = code;
    this.status = status;
  }
}

export interface OllamaChatInput {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature?: number;
}

export interface OllamaClientOptions {
  baseUrl: string;
  model: string;
  numCtx: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface OllamaClient {
  readonly model: string;
  chatJson(input: OllamaChatInput): Promise<unknown>;
}

/**
 * Mengekstrak objek JSON dari respons model. qwen3 kadang membungkus jawaban
 * dengan pagar kode ```json ... ``` meski `format` sudah diisi schema.
 */
export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new OllamaError("EMPTY_RESPONSE", "Model mengembalikan respons kosong.");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  const payload =
    firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate;

  try {
    return JSON.parse(payload);
  } catch {
    throw new OllamaError("INVALID_JSON", "Respons model bukan JSON yang valid.");
  }
}

export function createOllamaClient(options: OllamaClientOptions): OllamaClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/api/chat`;

  return {
    model: options.model,
    async chatJson(input) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);

      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: options.model,
            messages: [
              { role: "system", content: input.system },
              { role: "user", content: input.prompt },
            ],
            stream: false,
            think: false,
            format: input.schema,
            options: {
              temperature: input.temperature ?? 0.1,
              num_ctx: options.numCtx,
            },
          }),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new OllamaError("TIMEOUT", `Ollama tidak merespons dalam ${options.timeoutMs} ms.`);
        }
        throw new OllamaError("NETWORK", "Tidak dapat menghubungi Ollama.");
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new OllamaError(
          "HTTP_ERROR",
          `Ollama membalas ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}.`,
          response.status,
        );
      }

      const payload = (await response.json().catch(() => null)) as
        | { message?: { content?: string } }
        | null;

      const content = payload?.message?.content;
      if (typeof content !== "string") {
        throw new OllamaError("EMPTY_RESPONSE", "Respons Ollama tidak memuat konten pesan.");
      }

      return extractJsonObject(content);
    },
  };
}
