import type { Agent, AgentManifest } from '../agents/base.js';
import { IntakeAgent } from '../agents/intakeAgent.js';
import { SourcingAgent } from '../agents/sourcingAgent.js';
import { VettingAgent } from '../agents/vettingAgent.js';
import { NegotiationAgent } from '../agents/negotiationAgent.js';
import { ComplianceAgent } from '../agents/complianceAgent.js';
import { ApprovalAgent } from '../agents/approvalAgent.js';
import { ContractAgent } from '../agents/contractAgent.js';
import { PurchaseOrderAgent } from '../agents/poAgent.js';

/**
 * The agent marketplace: a registry of publishable, discoverable agents.
 * In production these could be remote MCP servers; here they're in-process.
 * The planner only ever composes workflows from agents installed here.
 */
export class AgentMarketplace {
  private readonly agents = new Map<string, Agent>();

  constructor(agents: Agent[]) {
    for (const a of agents) this.install(a);
  }

  /** Default catalog shipped with the prototype. */
  static withDefaults(): AgentMarketplace {
    return new AgentMarketplace([
      new IntakeAgent(),
      new SourcingAgent(),
      new VettingAgent(),
      new NegotiationAgent(),
      new ComplianceAgent(),
      new ApprovalAgent(),
      new ContractAgent(),
      new PurchaseOrderAgent(),
    ]);
  }

  install(agent: Agent): void {
    this.agents.set(agent.manifest.id, agent);
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  list(): AgentManifest[] {
    return [...this.agents.values()].map((a) => a.manifest);
  }

  /** Discovery: full-text-ish search over name, description and capabilities. */
  search(query: string): AgentManifest[] {
    const q = query.toLowerCase();
    return this.list().filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.capabilities.some((c) => c.toLowerCase().includes(q)),
    );
  }
}
