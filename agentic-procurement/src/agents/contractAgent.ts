import { BaseAgent, type AgentContext, type AgentManifest } from './base.js';
import type { Blackboard, Contract } from '../types.js';

/** Drafts a contract for the approved supplier, folding in required clauses. */
export class ContractAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'contract',
    name: 'Contract Drafting Agent',
    version: '1.0.3',
    publisher: 'DealForge',
    category: 'contracting',
    description: 'Drafts a supplier contract incorporating negotiated terms and clauses.',
    capabilities: ['contract-drafting', 'clause-assembly'],
    inputs: ['negotiation', 'compliance', 'approval'],
    outputs: ['contract'],
    pricePerRun: 0.05,
    rating: 4.3,
  };

  async execute(ctx: AgentContext): Promise<{ summary: string; patch: Partial<Blackboard> }> {
    const neg = ctx.blackboard.negotiation;
    const rec = ctx.blackboard.vetting;
    const supplierId = neg?.supplierId ?? rec?.recommendedSupplierId ?? '';
    const supplierName =
      neg?.supplierName ??
      ctx.blackboard.candidates?.find((c) => c.id === supplierId)?.name ??
      'Selected Supplier';
    const value = neg?.finalPrice ?? ctx.blackboard.intake?.refinedAmount ?? ctx.request.estimatedAmount;

    const contract = await ctx.llm.json<Contract>(
      {
        task: 'contract.draft',
        system: 'You are a contracts specialist. Assemble a contract record.',
        user: JSON.stringify({ supplierId, supplierName, value, blackboard: ctx.blackboard }),
      },
      () => {
        const clauses = [
          ...(ctx.blackboard.negotiation?.terms ?? []),
          ...(ctx.blackboard.compliance?.requiredClauses ?? []),
        ];
        return {
          id: `CTR-${Date.now().toString(36).toUpperCase()}`,
          supplierId,
          supplierName,
          value,
          termMonths: value >= 50000 ? 24 : 12,
          clauses: clauses.length ? clauses : ['Standard master services terms'],
          status: 'drafted',
        };
      },
    );

    ctx.log('contract drafted', { id: contract.id });
    return {
      summary: `Drafted contract ${contract.id} (${contract.clauses.length} clauses, ${contract.termMonths}mo).`,
      patch: { contract },
    };
  }
}
