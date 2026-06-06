import { loadConfig, type AppConfig } from './config.js';
import { createLLMClient } from './llm/client.js';
import { AgentMarketplace } from './marketplace/registry.js';
import { WorkflowPlanner } from './workflow/planner.js';
import { WorkflowEngine } from './workflow/engine.js';
import type { ProcurementOutcome, ProcurementRequest } from './types.js';

export interface RunOptions {
  config?: AppConfig;
  marketplace?: AgentMarketplace;
  verbose?: boolean;
}

/**
 * End-to-end entry point: plan a dynamic workflow for the request, then execute
 * it. Reused by the CLI demo, the HTTP server and the tests.
 */
export async function runProcurement(
  request: ProcurementRequest,
  opts: RunOptions = {},
): Promise<ProcurementOutcome> {
  const config = opts.config ?? loadConfig();
  const marketplace = opts.marketplace ?? AgentMarketplace.withDefaults();
  const llm = createLLMClient(config);

  const planner = new WorkflowPlanner(llm, marketplace);
  const engine = new WorkflowEngine(marketplace, llm, { verbose: opts.verbose });

  const plan = await planner.plan(request);
  return engine.execute(request, plan);
}

/** Render a human-readable terminal report for an outcome. */
export function formatReport(outcome: ProcurementOutcome): string {
  const { request, plan, results, blackboard } = outcome;
  const lines: string[] = [];
  const money = (n: number) => `${request.currency} ${n.toLocaleString()}`;

  lines.push(`Request   : ${request.title} [${request.id}]`);
  lines.push(`Category  : ${request.category}  •  Est: ${money(request.estimatedAmount)}  •  Urgency: ${request.urgency}`);
  lines.push('');
  lines.push(`Plan      : tier=${plan.policyTier}  steps=${plan.steps.length}`);
  lines.push(`            ${plan.rationale}`);
  lines.push('');
  lines.push('Workflow  :');
  for (const step of plan.steps) {
    const dep = step.dependsOn.length ? ` ← [${step.dependsOn.join(', ')}]` : '';
    lines.push(`  • ${step.agentId}${dep}`);
    lines.push(`      ${step.reason}`);
  }
  lines.push('');
  lines.push('Execution :');
  for (const r of results) {
    const mark = r.status === 'ok' ? '✓' : r.status === 'skipped' ? '–' : '✗';
    lines.push(`  ${mark} ${r.agentId.padEnd(16)} ${r.summary}  (${r.durationMs}ms, $${r.costUsd.toFixed(2)})`);
  }
  lines.push('');

  const neg = blackboard.negotiation;
  const po = blackboard.purchaseOrder;
  lines.push('Outcome   :');
  lines.push(`  Decision : ${outcome.decision.toUpperCase()}`);
  if (neg) lines.push(`  Savings  : ${money(neg.savings)} (${neg.savingsPct}%) vs starting ${money(neg.startingPrice)}`);
  if (blackboard.compliance)
    lines.push(`  Compliance: ${blackboard.compliance.passed ? 'PASS' : 'FAIL'} (risk ${blackboard.compliance.riskLevel})`);
  if (blackboard.contract) lines.push(`  Contract : ${blackboard.contract.id} (${blackboard.contract.termMonths}mo)`);
  if (po) lines.push(`  PO       : ${po.id} → ${po.supplierName} for ${money(po.amount)}`);
  lines.push(`  Agent fees: $${outcome.totalCostUsd.toFixed(2)}  •  Wall time: ${outcome.totalDurationMs}ms`);

  return lines.join('\n');
}
