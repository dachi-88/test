/**
 * Core domain model for the agentic procurement marketplace.
 *
 * The whole system is organized around a single mutable "blackboard" that
 * specialist agents read from and write to as a dynamic workflow executes.
 */

export type ProcurementCategory =
  | 'software_saas'
  | 'hardware'
  | 'professional_services'
  | 'marketing'
  | 'facilities'
  | 'logistics'
  | 'other';

export type Urgency = 'low' | 'normal' | 'high' | 'critical';

export type DataSensitivity = 'none' | 'internal' | 'confidential' | 'pii';

/** A buyer's request — the trigger for a procurement workflow. */
export interface ProcurementRequest {
  id: string;
  title: string;
  description: string;
  category: ProcurementCategory;
  /** Estimated total spend in `currency`. */
  estimatedAmount: number;
  currency: string;
  quantity?: number;
  requestedBy: { name: string; email: string; department: string };
  /** ISO date the goods/services are needed by. */
  neededBy?: string;
  urgency: Urgency;
  preferredSuppliers?: string[];
  /** True if the buyer wants to onboard a brand-new (un-vetted) supplier. */
  newSupplier?: boolean;
  dataSensitivity?: DataSensitivity;
}

export interface Supplier {
  id: string;
  name: string;
  categories: ProcurementCategory[];
  countries: string[];
  certifications: string[];
  /** 0–5 marketplace/quality rating. */
  rating: number;
  avgLeadTimeDays: number;
  /** Relative price level; 1.0 = market baseline, <1 cheaper, >1 pricier. */
  priceIndex: number;
  diversityOwned?: boolean;
  existingVendor: boolean;
}

export interface Bid {
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  totalPrice: number;
  leadTimeDays: number;
  notes?: string;
}

export interface VettingScore {
  supplierId: string;
  supplierName: string;
  /** 0–100 composite score. */
  score: number;
  breakdown: Record<string, number>;
  flags: string[];
}

export interface NegotiationResult {
  supplierId: string;
  supplierName: string;
  startingPrice: number;
  finalPrice: number;
  savings: number;
  savingsPct: number;
  terms: string[];
  leverageUsed: string[];
}

export interface ComplianceResult {
  passed: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  findings: string[];
  requiredClauses: string[];
}

export interface ApprovalDecision {
  decision: 'approved' | 'conditional' | 'rejected';
  approverChain: { role: string; reason: string }[];
  conditions: string[];
  rationale: string;
}

export interface Contract {
  id: string;
  supplierId: string;
  supplierName: string;
  value: number;
  termMonths: number;
  clauses: string[];
  status: 'drafted' | 'pending_signature';
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  description: string;
  amount: number;
  currency: string;
  approvedBy: string[];
  createdAt: string;
}

/**
 * Shared workspace passed between agents. Each agent writes its typed slice;
 * downstream agents read whatever earlier agents produced. Keys are optional
 * because the workflow is composed dynamically — not every agent always runs.
 */
export interface Blackboard {
  intake?: {
    normalizedTitle: string;
    requirements: string[];
    refinedAmount: number;
    riskFlags: string[];
  };
  candidates?: Supplier[];
  bids?: Bid[];
  vetting?: { scores: VettingScore[]; recommendedSupplierId: string };
  negotiation?: NegotiationResult;
  compliance?: ComplianceResult;
  approval?: ApprovalDecision;
  contract?: Contract;
  purchaseOrder?: PurchaseOrder;
  [key: string]: unknown;
}

export interface AgentResult {
  agentId: string;
  status: 'ok' | 'skipped' | 'failed';
  summary: string;
  /** Patch applied onto the blackboard. */
  patch: Partial<Blackboard>;
  durationMs: number;
  costUsd: number;
}

export interface ProcurementOutcome {
  request: ProcurementRequest;
  plan: import('./workflow/types.js').WorkflowPlan;
  results: AgentResult[];
  blackboard: Blackboard;
  totalCostUsd: number;
  totalDurationMs: number;
  decision: ApprovalDecision['decision'] | 'incomplete';
}
