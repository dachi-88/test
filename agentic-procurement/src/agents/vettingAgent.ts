import { BaseAgent, type AgentContext, type AgentManifest } from './base.js';
import type { Blackboard, VettingScore } from '../types.js';

/**
 * Scores candidate suppliers on quality, compliance posture, lead time, price
 * competitiveness and risk, then recommends one to carry forward.
 */
export class VettingAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'vetting',
    name: 'Supplier Vetting Agent',
    version: '1.4.0',
    publisher: 'TrustLayer',
    category: 'risk',
    description:
      'Evaluates and ranks suppliers using a weighted scorecard and flags risks.',
    capabilities: ['supplier-scoring', 'due-diligence', 'shortlisting'],
    inputs: ['candidates', 'bids'],
    outputs: ['vetting'],
    pricePerRun: 0.04,
    rating: 4.6,
  };

  async execute(ctx: AgentContext): Promise<{ summary: string; patch: Partial<Blackboard> }> {
    const candidates = ctx.blackboard.candidates ?? [];
    const bids = ctx.blackboard.bids ?? [];
    const { request } = ctx;

    const vetting = await ctx.llm.json(
      {
        task: 'vetting.score',
        system:
          'You are a supplier risk analyst. Score each candidate 0-100 and pick a ' +
          'recommendation, weighing quality, compliance, lead time and price.',
        user: JSON.stringify({ candidates, bids, request }),
      },
      () => {
        const needsCerts =
          request.dataSensitivity === 'pii' || request.dataSensitivity === 'confidential';

        const scores: VettingScore[] = candidates.map((s) => {
          const bid = bids.find((b) => b.supplierId === s.id);
          const breakdown = {
            quality: Math.round((s.rating / 5) * 30),
            compliance: Math.min(25, s.certifications.length * 8 + (needsCerts ? 0 : 5)),
            leadTime: Math.max(0, 20 - Math.floor(s.avgLeadTimeDays / 2)),
            price: bid ? Math.max(0, 25 - Math.round((s.priceIndex - 0.85) * 60)) : 10,
          };
          const flags: string[] = [];
          if (needsCerts && !s.certifications.some((c) => /SOC2|ISO27001|GDPR/i.test(c)))
            flags.push('missing_security_certifications');
          if (!s.existingVendor) flags.push('new_supplier_onboarding_required');
          if (s.avgLeadTimeDays > 14) flags.push('long_lead_time');

          const score = Math.min(
            100,
            Object.values(breakdown).reduce((a, b) => a + b, 0) +
              (s.existingVendor ? 5 : 0),
          );
          return { supplierId: s.id, supplierName: s.name, score, breakdown, flags };
        });

        scores.sort((a, b) => b.score - a.score);
        return {
          scores,
          recommendedSupplierId: scores[0]?.supplierId ?? '',
        };
      },
    );

    const top = vetting.scores.find((s) => s.supplierId === vetting.recommendedSupplierId);
    ctx.log('vetting complete', { recommended: top?.supplierName, score: top?.score });
    return {
      summary: `Recommended ${top?.supplierName ?? 'n/a'} (score ${top?.score ?? '?'}/100).`,
      patch: { vetting },
    };
  }
}
