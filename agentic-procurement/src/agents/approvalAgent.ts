import { BaseAgent, type AgentContext, type AgentManifest } from './base.js';
import type { ApprovalDecision, Blackboard } from '../types.js';

/**
 * Routes the deal through the right approval chain based on spend tier and
 * compliance posture, then renders an approve / conditional / reject decision.
 */
export class ApprovalAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'approval',
    name: 'Budget & Approval Routing Agent',
    version: '1.5.0',
    publisher: 'ProcureCore',
    category: 'approval',
    description:
      'Dynamically routes approvals by spend threshold and risk, then decides.',
    capabilities: ['approval-routing', 'budget-check', 'policy-decision'],
    inputs: ['negotiation', 'compliance'],
    outputs: ['approval'],
    pricePerRun: 0.03,
    rating: 4.5,
  };

  async execute(ctx: AgentContext): Promise<{ summary: string; patch: Partial<Blackboard> }> {
    const { request } = ctx;
    const finalValue =
      ctx.blackboard.negotiation?.finalPrice ??
      ctx.blackboard.intake?.refinedAmount ??
      request.estimatedAmount;
    const compliance = ctx.blackboard.compliance;

    const approval = await ctx.llm.json<ApprovalDecision>(
      {
        task: 'approval.route',
        system:
          'You are an approval routing engine. Build the approver chain by spend ' +
          'tier and risk, and return a decision with any conditions.',
        user: JSON.stringify({ request, finalValue, compliance }),
      },
      () => {
        const chain: ApprovalDecision['approverChain'] = [
          { role: `${request.requestedBy.department} Manager`, reason: 'Department budget owner' },
        ];
        if (finalValue >= 5000)
          chain.push({ role: 'Finance Business Partner', reason: 'Spend ≥ $5k' });
        if (finalValue >= 50000)
          chain.push({ role: 'VP / Executive Sponsor', reason: 'Spend ≥ $50k (strategic)' });
        if (compliance && compliance.riskLevel !== 'low')
          chain.push({ role: 'Legal & Compliance', reason: `Risk level: ${compliance.riskLevel}` });

        const conditions: string[] = [];
        if (compliance?.requiredClauses.length)
          conditions.push(`Execute clauses: ${compliance.requiredClauses.join('; ')}`);

        let decision: ApprovalDecision['decision'] = 'approved';
        if (compliance && !compliance.passed) decision = 'rejected';
        else if (conditions.length || (compliance && compliance.riskLevel === 'medium'))
          decision = 'conditional';

        const rationale =
          decision === 'rejected'
            ? 'Blocked by compliance failure.'
            : decision === 'conditional'
            ? 'Approved subject to conditions being met before PO issuance.'
            : 'Within policy; auto-approved through routing chain.';

        return { decision, approverChain: chain, conditions, rationale };
      },
    );

    ctx.log('approval routed', { decision: approval.decision, approvers: approval.approverChain.length });
    return {
      summary: `Decision: ${approval.decision.toUpperCase()} via ${approval.approverChain.length}-step chain.`,
      patch: { approval },
    };
  }
}
