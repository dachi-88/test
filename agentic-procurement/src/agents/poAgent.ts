import { BaseAgent, type AgentContext, type AgentManifest } from './base.js';
import type { Blackboard, PurchaseOrder } from '../types.js';

/** Issues a purchase order once the deal is (conditionally) approved. */
export class PurchaseOrderAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'purchase_order',
    name: 'Purchase Order Agent',
    version: '1.0.0',
    publisher: 'ProcureCore',
    category: 'fulfillment',
    description: 'Generates a purchase order from the approved, contracted deal.',
    capabilities: ['po-generation', 'erp-handoff'],
    inputs: ['approval', 'contract', 'negotiation'],
    outputs: ['purchaseOrder'],
    pricePerRun: 0.02,
    rating: 4.6,
  };

  async execute(ctx: AgentContext): Promise<{ summary: string; patch: Partial<Blackboard> }> {
    const approval = ctx.blackboard.approval;
    if (approval?.decision === 'rejected') {
      return { summary: 'PO not issued — deal was rejected.', patch: {} };
    }

    const neg = ctx.blackboard.negotiation;
    const supplierId = neg?.supplierId ?? ctx.blackboard.vetting?.recommendedSupplierId ?? '';
    const supplierName =
      neg?.supplierName ??
      ctx.blackboard.candidates?.find((c) => c.id === supplierId)?.name ??
      'Selected Supplier';
    const amount = neg?.finalPrice ?? ctx.blackboard.intake?.refinedAmount ?? ctx.request.estimatedAmount;

    const po: PurchaseOrder = {
      id: `PO-${Date.now().toString(36).toUpperCase()}`,
      supplierId,
      supplierName,
      description: ctx.blackboard.intake?.normalizedTitle ?? ctx.request.title,
      amount,
      currency: ctx.request.currency,
      approvedBy: (approval?.approverChain ?? []).map((a) => a.role),
      createdAt: new Date().toISOString(),
    };

    ctx.log('PO issued', { id: po.id, amount: po.amount });
    return {
      summary: `Issued ${po.id} to ${po.supplierName} for ${po.currency} ${po.amount.toLocaleString()}.`,
      patch: { purchaseOrder: po },
    };
  }
}
