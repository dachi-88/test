/** Runtime configuration sourced from the environment. */
export interface AppConfig {
  apiKey: string | undefined;
  model: string;
  port: number;
  /** True when no API key is set — agents fall back to deterministic logic. */
  mockMode: boolean;
}

export function loadConfig(): AppConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || undefined;
  return {
    apiKey,
    model: process.env.PROCUREMENT_MODEL?.trim() || 'claude-opus-4-8',
    port: Number(process.env.PORT) || 8787,
    mockMode: !apiKey,
  };
}
