import { BaseAgent, type AgentContext, type AgentManifest } from './base.js';
import type { Blackboard } from '../types.js';

/**
 * Normalizes a raw procurement request into a clean requirement spec and
 * surfaces early risk flags (e.g. PII handling, rush timelines).
 */
export class IntakeAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'intake',
    name: 'Intake & Requirements Agent',
    version: '1.2.0',
    publisher: 'ProcureCore',
    category: 'intake',
    description:
      'Cleans and structures procurement requests, extracts requirements, and flags early risks.',
    capabilities: ['normalize', 'requirements-extraction', 'risk-triage'],
    inputs: ['request'],
    outputs: ['intake'],
    pricePerRun: 0.02,
    rating: 4.8,
  };

  async execute(ctx: AgentContext): Promise<{ summary: string; patch: Partial<Blackboard> }> {
    const { request } = ctx;

    const intake = await ctx.llm.json(
      {
        task: 'intake.normalize',
        system:
          'You are a procurement intake specialist. Structure the request into ' +
          'a normalized title, a list of concrete requirements, a refined spend ' +
          'estimate, and any risk flags.',
        user: JSON.stringify(request),
      },
      () => {
        const riskFlags: string[] = [];
        if (request.dataSensitivity === 'pii' || request.dataSensitivity === 'confidential')
          riskFlags.push(`data_sensitivity:${request.dataSensitivity}`);
        if (request.urgency === 'critical' || request.urgency === 'high')
          riskFlags.push(`timeline:${request.urgency}`);
        if (request.newSupplier) riskFlags.push('new_supplier');
        if (request.estimatedAmount >= 50000) riskFlags.push('high_value');

        const requirements = [
          `Category: ${request.category}`,
          request.quantity ? `Quantity: ${request.quantity}` : 'Quantity: as needed',
          request.neededBy ? `Delivery by ${request.neededBy}` : 'No hard deadline',
          `Budget ceiling ~${request.currency} ${request.estimatedAmount.toLocaleString()}`,
        ];

        return {
          normalizedTitle: request.title.trim().replace(/\s+/g, ' '),
          requirements,
          refinedAmount: request.estimatedAmount,
          riskFlags,
        };
      },
    );

    ctx.log('normalized request', { riskFlags: intake.riskFlags });
    return {
      summary: `Structured "${intake.normalizedTitle}" with ${intake.riskFlags.length} risk flag(s).`,
      patch: { intake },
    };
  }
}
