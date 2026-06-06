/** Spend/risk tier that shapes how heavy the workflow is. */
export type PolicyTier = 'fast_track' | 'standard' | 'strategic';

export interface WorkflowStep {
  /** Unique step id (usually equals the agent id). */
  id: string;
  /** Marketplace agent to invoke for this step. */
  agentId: string;
  /** Human-readable reason this step was included (dynamic rationale). */
  reason: string;
  /** Step ids that must complete before this one. */
  dependsOn: string[];
}

export interface WorkflowPlan {
  requestId: string;
  policyTier: PolicyTier;
  rationale: string;
  steps: WorkflowStep[];
}
