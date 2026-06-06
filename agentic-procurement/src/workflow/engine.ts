import type { LLMClient } from '../llm/client.js';
import type { AgentMarketplace } from '../marketplace/registry.js';
import type { AgentContext } from '../agents/base.js';
import type {
  AgentResult,
  Blackboard,
  ProcurementOutcome,
  ProcurementRequest,
} from '../types.js';
import type { WorkflowPlan } from './types.js';
import { makeLogger } from '../utils/logger.js';

/**
 * Executes a workflow plan: resolves the DAG into a valid order and runs each
 * agent against a shared blackboard, accumulating results, cost and timing.
 */
export class WorkflowEngine {
  constructor(
    private readonly marketplace: AgentMarketplace,
    private readonly llm: LLMClient,
    private readonly opts: { verbose?: boolean } = {},
  ) {}

  async execute(request: ProcurementRequest, plan: WorkflowPlan): Promise<ProcurementOutcome> {
    const order = topoSort(plan);
    const blackboard: Blackboard = {};
    const results: AgentResult[] = [];
    const startedAt = Date.now();

    for (const stepId of order) {
      const step = plan.steps.find((s) => s.id === stepId)!;
      const agent = this.marketplace.get(step.agentId);
      if (!agent) continue;

      const ctx: AgentContext = {
        request,
        blackboard,
        llm: this.llm,
        log: this.opts.verbose ? makeLogger(step.agentId) : () => {},
      };

      const t0 = Date.now();
      const res = await agent.run(ctx);
      const result: AgentResult = { ...res, durationMs: Date.now() - t0 };

      Object.assign(blackboard, result.patch);
      results.push(result);
    }

    const totalCostUsd = results.reduce((a, r) => a + r.costUsd, 0);
    return {
      request,
      plan,
      results,
      blackboard,
      totalCostUsd: Math.round(totalCostUsd * 1e4) / 1e4,
      totalDurationMs: Date.now() - startedAt,
      decision: blackboard.approval?.decision ?? 'incomplete',
    };
  }
}

/** Kahn's algorithm — produces a deterministic execution order from the DAG. */
export function topoSort(plan: WorkflowPlan): string[] {
  const ids = plan.steps.map((s) => s.id);
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const step of plan.steps) {
    for (const dep of step.dependsOn) {
      if (!indegree.has(dep)) continue; // ignore deps not in this plan
      adj.get(dep)!.push(step.id);
      indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
    }
  }

  // Stable queue: preserve declared step order among ready nodes.
  const ready = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  const out: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    out.push(id);
    for (const next of adj.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) ready.push(next);
    }
  }

  if (out.length !== ids.length) {
    throw new Error('Workflow plan contains a cycle — cannot execute.');
  }
  return out;
}
