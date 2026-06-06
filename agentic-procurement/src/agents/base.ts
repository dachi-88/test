import type { LLMClient } from '../llm/client.js';
import type { AgentResult, Blackboard, ProcurementRequest } from '../types.js';

/**
 * Marketplace listing for an agent. This is the unit that gets published,
 * discovered, rated and "installed" into a workspace — the marketplace analogue
 * of an app-store entry.
 */
export interface AgentManifest {
  id: string;
  name: string;
  version: string;
  publisher: string;
  category: string;
  description: string;
  /** Capability tags the planner matches against when composing a workflow. */
  capabilities: string[];
  inputs: string[];
  outputs: string[];
  /** Marketplace price charged per invocation (USD). */
  pricePerRun: number;
  /** 0–5 community rating. */
  rating: number;
}

export interface AgentContext {
  request: ProcurementRequest;
  blackboard: Blackboard;
  llm: LLMClient;
  log: (msg: string, data?: unknown) => void;
}

export interface Agent {
  readonly manifest: AgentManifest;
  run(ctx: AgentContext): Promise<Omit<AgentResult, 'durationMs'>>;
}

/** Shared helpers for concrete agents. */
export abstract class BaseAgent implements Agent {
  abstract readonly manifest: AgentManifest;
  abstract execute(ctx: AgentContext): Promise<{ summary: string; patch: Partial<Blackboard> }>;

  async run(ctx: AgentContext): Promise<Omit<AgentResult, 'durationMs'>> {
    try {
      const { summary, patch } = await this.execute(ctx);
      return {
        agentId: this.manifest.id,
        status: 'ok',
        summary,
        patch,
        costUsd: this.manifest.pricePerRun,
      };
    } catch (err) {
      return {
        agentId: this.manifest.id,
        status: 'failed',
        summary: `failed: ${(err as Error).message}`,
        patch: {},
        costUsd: 0,
      };
    }
  }
}
