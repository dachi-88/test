import type { AppConfig } from '../config.js';

export interface LLMRequest {
  /** Semantic tag for the unit of work (telemetry + mock routing). */
  task: string;
  system: string;
  user: string;
  maxTokens?: number;
}

/**
 * A thin abstraction over Claude. Every call supplies a deterministic
 * `fallback` that encodes the agent's domain logic. The fallback is used when:
 *   - we're in mock mode (no API key), or
 *   - the live model returns malformed JSON.
 * This keeps agents fully runnable offline while still being able to delegate
 * judgement to Claude in production.
 */
export interface LLMClient {
  readonly mode: 'live' | 'mock';
  json<T>(req: LLMRequest, fallback: () => T): Promise<T>;
  text(req: LLMRequest): Promise<string>;
}

export function createLLMClient(config: AppConfig): LLMClient {
  return config.mockMode ? new MockLLM() : new ClaudeLLM(config);
}

/** Deterministic, offline client — always defers to the agent's own logic. */
export class MockLLM implements LLMClient {
  readonly mode = 'mock' as const;

  async json<T>(_req: LLMRequest, fallback: () => T): Promise<T> {
    return fallback();
  }

  async text(req: LLMRequest): Promise<string> {
    return `[mock:${req.task}]`;
  }
}

/** Live client backed by the Anthropic SDK (lazily imported). */
export class ClaudeLLM implements LLMClient {
  readonly mode = 'live' as const;
  private clientPromise: Promise<any> | null = null;

  constructor(private readonly config: AppConfig) {}

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = import('@anthropic-ai/sdk').then(
        (m) => new m.default({ apiKey: this.config.apiKey }),
      );
    }
    return this.clientPromise;
  }

  async text(req: LLMRequest): Promise<string> {
    const anthropic = await this.client();
    const res = await anthropic.messages.create({
      model: this.config.model,
      max_tokens: req.maxTokens ?? 1024,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    });
    return res.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
  }

  async json<T>(req: LLMRequest, fallback: () => T): Promise<T> {
    try {
      const raw = await this.text({
        ...req,
        system:
          req.system +
          '\n\nRespond with a single valid JSON object and nothing else.',
      });
      return extractJson<T>(raw) ?? fallback();
    } catch {
      // Network/model failure must never break a procurement run.
      return fallback();
    }
  }
}

/** Pull the first balanced JSON object out of a model response. */
export function extractJson<T>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}' && --depth === 0) {
      try {
        return JSON.parse(body.slice(start, i + 1)) as T;
      } catch {
        return null;
      }
    }
  }
  return null;
}
