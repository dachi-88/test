import { BaseAgent, type AgentContext, type AgentManifest } from './base.js';
import type { Blackboard, NegotiationResult } from '../types.js';

/**
 * Runs a simulated negotiation against the recommended supplier, using
 * competitive tension and spend volume as leverage to extract savings + terms.
 */
export class NegotiationAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'negotiation',
    name: 'Negotiation Agent',
    version: '1.1.0',
    publisher: 'DealForge',
    category: 'negotiation',
    description:
      'Negotiates price and commercial terms with the selected supplier.',
    capabilities: ['price-negotiation', 'terms-negotiation', 'savings'],
    inputs: ['bids', 'vetting'],
    outputs: ['negotiation'],
    pricePerRun: 0.08,
    rating: 4.4,
  };

  async execute(ctx: AgentContext): Promise<{ summary: string; patch: Partial<Blackboard> }> {
    const bids = ctx.blackboard.bids ?? [];
    const recId = ctx.blackboard.vetting?.recommendedSupplierId;
    const target = bids.find((b) => b.supplierId === recId) ?? bids[0];
    if (!target) {
      return { summary: 'No bid available to negotiate.', patch: {} };
    }

    const competing = bids.filter((b) => b.supplierId !== target.supplierId);
    const lowestCompetitor = Math.min(
      target.totalPrice,
      ...competing.map((b) => b.totalPrice),
    );

    const negotiation = await ctx.llm.json<NegotiationResult>(
      {
        task: 'negotiation.run',
        system:
          'You are an expert procurement negotiator. Given the target bid and ' +
          'competing bids, output the negotiated final price, savings and terms.',
        user: JSON.stringify({ target, competing }),
      },
      () => {
        const leverageUsed: string[] = [];
        // Base discount scales with spend; competitive tension adds more.
        let discount = target.totalPrice >= 50000 ? 0.12 : target.totalPrice >= 10000 ? 0.08 : 0.04;
        if (competing.length > 0) {
          discount += 0.03;
          leverageUsed.push('competitive_bids');
        }
        if (lowestCompetitor < target.totalPrice) {
          discount += 0.02;
          leverageUsed.push('price_match');
        }
        leverageUsed.push('volume_commitment');

        const finalPrice = Math.round(target.totalPrice * (1 - discount));
        const savings = target.totalPrice - finalPrice;
        return {
          supplierId: target.supplierId,
          supplierName: target.supplierName,
          startingPrice: target.totalPrice,
          finalPrice,
          savings,
          savingsPct: Math.round((savings / target.totalPrice) * 1000) / 10,
          terms: [
            'Net-45 payment terms',
            'Price locked for 12 months',
            '99.5% uptime SLA with service credits',
          ],
          leverageUsed,
        };
      },
    );

    ctx.log('negotiated', { savingsPct: negotiation.savingsPct });
    return {
      summary: `Negotiated ${negotiation.savingsPct}% off ${negotiation.supplierName} (saved ${negotiation.savings.toLocaleString()}).`,
      patch: { negotiation },
    };
  }
}
