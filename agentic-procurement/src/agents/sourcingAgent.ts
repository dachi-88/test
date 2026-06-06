import { BaseAgent, type AgentContext, type AgentManifest } from './base.js';
import type { Bid, Blackboard, Supplier } from '../types.js';
import { findSuppliers } from '../data/suppliers.js';

/**
 * Discovers candidate suppliers for the request's category and solicits
 * (simulated) competitive bids based on supplier price indices.
 */
export class SourcingAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'sourcing',
    name: 'Sourcing & Discovery Agent',
    version: '2.0.1',
    publisher: 'ProcureCore',
    category: 'sourcing',
    description:
      'Finds qualified suppliers and collects competitive bids for a request.',
    capabilities: ['supplier-discovery', 'rfq', 'bid-collection'],
    inputs: ['request', 'intake'],
    outputs: ['candidates', 'bids'],
    pricePerRun: 0.05,
    rating: 4.5,
  };

  async execute(ctx: AgentContext): Promise<{ summary: string; patch: Partial<Blackboard> }> {
    const { request } = ctx;
    const amount = ctx.blackboard.intake?.refinedAmount ?? request.estimatedAmount;

    let candidates: Supplier[] = findSuppliers(request.category);
    if (request.preferredSuppliers?.length) {
      candidates.sort((a, b) =>
        Number(request.preferredSuppliers!.includes(b.name)) -
        Number(request.preferredSuppliers!.includes(a.name)),
      );
    }
    // Keep up to the top 4 candidates by rating for a manageable bid set.
    candidates = [...candidates].sort((a, b) => b.rating - a.rating).slice(0, 4);

    const bids: Bid[] = await ctx.llm.json(
      {
        task: 'sourcing.bids',
        system:
          'You are a sourcing agent. Produce realistic competitive bids for the ' +
          'candidate suppliers given the request budget.',
        user: JSON.stringify({ amount, candidates }),
      },
      () =>
        candidates.map((s) => {
          const total = Math.round(amount * s.priceIndex);
          const qty = request.quantity ?? 1;
          return {
            supplierId: s.id,
            supplierName: s.name,
            unitPrice: Math.round(total / qty),
            totalPrice: total,
            leadTimeDays: s.avgLeadTimeDays,
            notes: s.existingVendor ? 'Existing master agreement on file' : 'New supplier',
          } satisfies Bid;
        }),
    );

    ctx.log('collected bids', { count: bids.length });
    const cheapest = [...bids].sort((a, b) => a.totalPrice - b.totalPrice)[0];
    return {
      summary: `Sourced ${candidates.length} suppliers; ${bids.length} bids (low: ${
        cheapest ? `${cheapest.supplierName} @ ${request.currency} ${cheapest.totalPrice.toLocaleString()}` : 'n/a'
      }).`,
      patch: { candidates, bids },
    };
  }
}
