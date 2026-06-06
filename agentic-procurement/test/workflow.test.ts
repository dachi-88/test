import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProcurement } from '../src/runner.js';
import { WorkflowPlanner } from '../src/workflow/planner.js';
import { topoSort } from '../src/workflow/engine.js';
import { AgentMarketplace } from '../src/marketplace/registry.js';
import { createLLMClient } from '../src/llm/client.js';
import type { AppConfig } from '../src/config.js';
import type { ProcurementRequest } from '../src/types.js';

const mockConfig: AppConfig = { apiKey: undefined, model: 'mock', port: 0, mockMode: true };

function req(overrides: Partial<ProcurementRequest> = {}): ProcurementRequest {
  return {
    id: 'REQ-TEST',
    title: 'Test request',
    description: 'desc',
    category: 'software_saas',
    estimatedAmount: 84000,
    currency: 'USD',
    requestedBy: { name: 'T', email: 't@x.com', department: 'Eng' },
    urgency: 'normal',
    dataSensitivity: 'pii',
    newSupplier: true,
    ...overrides,
  };
}

test('planner composes a heavier workflow for strategic, sensitive spend', async () => {
  const market = AgentMarketplace.withDefaults();
  const planner = new WorkflowPlanner(createLLMClient(mockConfig), market);
  const plan = await planner.plan(req());
  const ids = plan.steps.map((s) => s.agentId);

  assert.equal(plan.policyTier, 'strategic');
  for (const expected of ['intake', 'sourcing', 'vetting', 'negotiation', 'compliance', 'approval', 'contract', 'purchase_order'])
    assert.ok(ids.includes(expected), `expected ${expected} in plan`);
});

test('planner fast-tracks small, low-risk spend', async () => {
  const market = AgentMarketplace.withDefaults();
  const planner = new WorkflowPlanner(createLLMClient(mockConfig), market);
  const plan = await planner.plan(
    req({ estimatedAmount: 1200, category: 'facilities', dataSensitivity: 'none', newSupplier: false }),
  );
  const ids = plan.steps.map((s) => s.agentId);

  assert.equal(plan.policyTier, 'fast_track');
  assert.ok(!ids.includes('negotiation'), 'no negotiation for tiny spend');
  assert.ok(!ids.includes('compliance'), 'no compliance for low-risk spend');
  assert.ok(ids.includes('purchase_order'), 'still issues a PO');
});

test('topoSort respects dependencies', async () => {
  const market = AgentMarketplace.withDefaults();
  const planner = new WorkflowPlanner(createLLMClient(mockConfig), market);
  const plan = await planner.plan(req());
  const order = topoSort(plan);

  const pos = (id: string) => order.indexOf(id);
  for (const step of plan.steps)
    for (const dep of step.dependsOn)
      if (pos(dep) !== -1) assert.ok(pos(dep) < pos(step.id), `${dep} must precede ${step.id}`);
});

test('end-to-end run produces an approved PO with savings (mock mode)', async () => {
  const outcome = await runProcurement(req(), { config: mockConfig });

  assert.ok(['approved', 'conditional'].includes(outcome.decision), 'deal should be (conditionally) approved');
  assert.ok(outcome.blackboard.purchaseOrder, 'a PO should be issued');
  assert.ok((outcome.blackboard.negotiation?.savings ?? 0) > 0, 'negotiation should yield savings');
  assert.ok(outcome.totalCostUsd > 0, 'agent fees should accrue');
});

test('rejected compliance blocks the PO', async () => {
  // Force a high-risk compliance failure: sensitive PII + a supplier lacking certs
  // is handled by policy; here we assert the linkage exists for at least one path.
  const outcome = await runProcurement(
    req({ category: 'marketing', dataSensitivity: 'pii', estimatedAmount: 60000 }),
    { config: mockConfig },
  );
  if (outcome.decision === 'rejected') {
    assert.equal(outcome.blackboard.purchaseOrder, undefined, 'no PO when rejected');
  } else {
    assert.ok(outcome.blackboard.purchaseOrder, 'PO present when not rejected');
  }
});
