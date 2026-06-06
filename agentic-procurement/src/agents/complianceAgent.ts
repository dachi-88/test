import { BaseAgent, type AgentContext, type AgentManifest } from './base.js';
import type { Blackboard, ComplianceResult } from '../types.js';
import { SUPPLIERS } from '../data/suppliers.js';

/**
 * Validates the deal against compliance policy: data-protection posture,
 * required certifications, country risk, and mandatory contract clauses.
 */
export class ComplianceAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'compliance',
    name: 'Compliance & Legal Review Agent',
    version: '1.3.2',
    publisher: 'TrustLayer',
    category: 'compliance',
    description:
      'Checks data-protection, certifications and country risk; outputs required clauses.',
    capabilities: ['policy-check', 'dpa', 'sanctions-screening'],
    inputs: ['request', 'vetting'],
    outputs: ['compliance'],
    pricePerRun: 0.06,
    rating: 4.7,
  };

  async execute(ctx: AgentContext): Promise<{ summary: string; patch: Partial<Blackboard> }> {
    const { request } = ctx;
    const recId = ctx.blackboard.vetting?.recommendedSupplierId;
    const supplier = SUPPLIERS.find((s) => s.id === recId);

    const compliance = await ctx.llm.json<ComplianceResult>(
      {
        task: 'compliance.review',
        system:
          'You are a procurement compliance officer. Determine pass/fail, a risk ' +
          'level, findings and required contract clauses.',
        user: JSON.stringify({ request, supplier }),
      },
      () => {
        const findings: string[] = [];
        const requiredClauses: string[] = [];
        const handlesSensitive =
          request.dataSensitivity === 'pii' || request.dataSensitivity === 'confidential';

        if (handlesSensitive) {
          requiredClauses.push('Data Processing Agreement (DPA)');
          if (request.dataSensitivity === 'pii') requiredClauses.push('GDPR/CCPA addendum');
          const hasSec = supplier?.certifications.some((c) => /SOC2|ISO27001/i.test(c));
          if (!hasSec) findings.push('Supplier lacks SOC2/ISO27001 for sensitive data');
        }
        if (request.estimatedAmount >= 50000) {
          requiredClauses.push('Limitation of liability', 'Termination for convenience');
        }
        const highRiskCountry = supplier?.countries.some((c) =>
          ['RU', 'IR', 'KP', 'SY'].includes(c),
        );
        if (highRiskCountry) findings.push('Supplier operates in a sanctioned jurisdiction');

        const riskLevel: ComplianceResult['riskLevel'] =
          highRiskCountry || (handlesSensitive && findings.length)
            ? 'high'
            : findings.length
            ? 'medium'
            : 'low';

        return {
          passed: riskLevel !== 'high',
          riskLevel,
          findings: findings.length ? findings : ['No blocking issues found'],
          requiredClauses,
        };
      },
    );

    ctx.log('compliance reviewed', { risk: compliance.riskLevel, passed: compliance.passed });
    return {
      summary: `Compliance ${compliance.passed ? 'PASS' : 'FAIL'} (risk: ${compliance.riskLevel}); ${compliance.requiredClauses.length} required clause(s).`,
      patch: { compliance },
    };
  }
}
