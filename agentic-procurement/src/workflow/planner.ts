import type { LLMClient } from '../llm/client.js';
import type { ProcurementRequest } from '../types.js';
import type { AgentMarketplace } from '../marketplace/registry.js';
import type { PolicyTier, WorkflowPlan, WorkflowStep } from './types.js';

/**
 * The planner is what makes workflows *dynamic*: instead of a fixed pipeline,
 * it inspects each request and composes a tailored DAG of marketplace agents.
 *
 * A small, cheap purchase is fast-tracked (intake → sourcing-lite → approval →
 * PO); a high-value, data-sensitive, new-supplier deal pulls in vetting,
 * negotiation, compliance/legal and contracting. The LLM can propose the plan
 * in production; the deterministic fallback below encodes the same policy so it
 * runs offline and remains auditable.
 */
export class WorkflowPlanner {
  constructor(
    private readonly llm: LLMClient,
    private readonly marketplace: AgentMarketplace,
  ) {}

  async plan(request: ProcurementRequest): Promise<WorkflowPlan> {
    const plan = await this.llm.json<WorkflowPlan>(
      {
        task: 'planner.compose',
        system:
          'You orchestrate procurement workflows. Given a request and the set of ' +
          'available agents, output a DAG (steps with dependsOn) tailored to the ' +
          'spend tier and risk. Only use agentIds that exist in the marketplace.',
        user: JSON.stringify({ request, available: this.marketplace.list() }),
      },
      () => this.heuristicPlan(request),
    );

    // Guard: drop any steps referencing agents not installed in the marketplace.
    plan.steps = plan.steps.filter((s) => this.marketplace.has(s.agentId));
    return plan;
  }

  /** Deterministic policy engine used as the offline fallback. */
  private heuristicPlan(request: ProcurementRequest): WorkflowPlan {
    const amount = request.estimatedAmount;
    const tier: PolicyTier =
      amount >= 50000 ? 'strategic' : amount >= 5000 ? 'standard' : 'fast_track';

    const sensitive =
      request.dataSensitivity === 'pii' || request.dataSensitivity === 'confidential';
    const needsSourcing = tier !== 'fast_track' || !!request.newSupplier;
    const needsVetting = needsSourcing || !!request.newSupplier;
    const needsNegotiation = amount >= 10000;
    const needsCompliance = tier === 'strategic' || sensitive;
    const needsContract = tier !== 'fast_track';

    const steps: WorkflowStep[] = [];
    const add = (s: WorkflowStep) => steps.push(s);

    add({ id: 'intake', agentId: 'intake', reason: 'Every request is normalized first.', dependsOn: [] });

    if (needsSourcing)
      add({
        id: 'sourcing',
        agentId: 'sourcing',
        reason: needsSourcing && tier === 'fast_track'
          ? 'New supplier requires market discovery even for low spend.'
          : `Spend tier "${tier}" requires competitive sourcing.`,
        dependsOn: ['intake'],
      });

    if (needsVetting)
      add({
        id: 'vetting',
        agentId: 'vetting',
        reason: request.newSupplier
          ? 'New supplier must be vetted before award.'
          : 'Rank suppliers before negotiation.',
        dependsOn: ['sourcing'],
      });

    if (needsNegotiation)
      add({
        id: 'negotiation',
        agentId: 'negotiation',
        reason: 'Spend ≥ $10k justifies active negotiation.',
        dependsOn: needsVetting ? ['vetting'] : ['sourcing'],
      });

    if (needsCompliance)
      add({
        id: 'compliance',
        agentId: 'compliance',
        reason: sensitive
          ? `Data sensitivity "${request.dataSensitivity}" requires compliance review.`
          : 'Strategic spend requires compliance/legal review.',
        dependsOn: needsVetting ? ['vetting'] : ['intake'],
      });

    const approvalDeps = [
      needsNegotiation ? 'negotiation' : needsVetting ? 'vetting' : 'intake',
      ...(needsCompliance ? ['compliance'] : []),
    ];
    add({
      id: 'approval',
      agentId: 'approval',
      reason: `Approval chain scales with the "${tier}" spend tier.`,
      dependsOn: approvalDeps,
    });

    if (needsContract)
      add({
        id: 'contract',
        agentId: 'contract',
        reason: 'Standard/strategic deals are formalized in a contract.',
        dependsOn: ['approval'],
      });

    add({
      id: 'purchase_order',
      agentId: 'purchase_order',
      reason: 'Issue PO once approved.',
      dependsOn: needsContract ? ['contract'] : ['approval'],
    });

    const rationale =
      `Tier "${tier}" (≈${request.currency} ${amount.toLocaleString()}). ` +
      `Composed ${steps.length} agents` +
      (sensitive ? ', incl. compliance for sensitive data' : '') +
      (needsNegotiation ? ', incl. negotiation' : '') +
      '.';

    return { requestId: request.id, policyTier: tier, rationale, steps };
  }
}
