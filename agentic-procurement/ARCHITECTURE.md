# Architecture

`agentic-procurement` models enterprise buying as a **marketplace of AI agents**
that a planner **composes into a per-request workflow**. This document explains
the design, the rationale, and how to extend it.

## Why dynamic workflows?

Traditional procurement automation hard-codes one pipeline: every request, from
a $50 keyboard to a $5M datacenter buildout, walks the same steps. That is slow
for small buys and dangerously thin for large/risky ones.

Here, a **planner** reads each request and emits a tailored DAG. The amount of
process *scales with spend and risk*:

| Tier | Trigger | Agents typically composed |
|------|---------|---------------------------|
| `fast_track` | < $5k, low risk, known supplier | intake → approval → PO |
| `standard` | $5k–$50k | intake → sourcing → vetting → negotiation → approval → contract → PO |
| `strategic` | ≥ $50k, or sensitive data | + compliance/legal, executive approval |

Orthogonal signals add agents regardless of tier: a **new supplier** forces
`vetting`; **PII/confidential** data forces `compliance` with a DPA clause;
spend ≥ $10k turns on active `negotiation`.

## Components

### Agent marketplace (`src/marketplace/registry.ts`)
A registry of agents keyed by id. Each agent ships an `AgentManifest`
(capabilities, inputs/outputs, `pricePerRun`, `rating`) — the unit that would be
*published, discovered, rated and installed* in a real marketplace. The registry
exposes `list()`, `get()`, `has()` and `search()`. The planner may only compose
workflows from agents installed here, and it defensively drops steps that
reference unknown agents.

### Agents (`src/agents/*`)
Each agent extends `BaseAgent` and implements `execute(ctx)`, reading from and
writing to a shared **blackboard**. Crucially, every agent expresses its logic
twice:

- a **Claude prompt** (`llm.json({...}, fallback)`) for production judgement, and
- a **deterministic `fallback()`** encoding the same policy.

`LLMClient.json()` uses the fallback whenever we're in mock mode *or* the live
model returns malformed JSON — so the system is always runnable offline and
never breaks a procurement run on a transient model error. This dual encoding
also keeps decisions **auditable**: the fallback is the written-down policy.

### Planner (`src/workflow/planner.ts`)
Produces a `WorkflowPlan` (steps + `dependsOn` + per-step rationale + policy
tier). In production Claude proposes the DAG; offline, `heuristicPlan()` encodes
the policy table above. Every step carries a human-readable `reason`, so the
composed workflow is explainable.

### Engine (`src/workflow/engine.ts`)
Resolves the DAG with a stable topological sort (`topoSort`, Kahn's algorithm),
detects cycles, then runs agents in order against the shared blackboard,
accumulating results, agent fees and timing into a `ProcurementOutcome`.

### Blackboard (`src/types.ts`)
A single mutable object that agents patch. Because the workflow is composed
dynamically, all slices are optional; downstream agents read whatever upstream
agents produced and degrade gracefully when something is absent.

## Data flow

```
ProcurementRequest
   │  WorkflowPlanner.plan()         (Claude or heuristic)
   ▼
WorkflowPlan (DAG)
   │  WorkflowEngine.execute()
   ▼
for step in topoSort(plan):
     agent.run(ctx) ──patch──▶ Blackboard
   ▼
ProcurementOutcome { decision, savings, contract, PO, costs, timings }
```

## Extension points

- **Publish a new agent.** Implement `BaseAgent`, give it a manifest, and
  `marketplace.install(new MyAgent())`. Add it to the planner's policy (or let
  Claude pick it up via its capabilities) and it joins workflows.
- **Real suppliers / ERP.** Replace `src/data/suppliers.ts` with a live source.
  A natural fit is an **MCP server** per system of record (supplier master,
  budget, contracts), with agents calling tools instead of static data.
- **Remote agents.** Manifests already resemble service descriptors; agents
  could be remote MCP servers invoked over the network rather than in-process.
- **Persistence & audit.** Persist `ProcurementOutcome` (plan + per-step
  rationale + decisions) for a complete, replayable audit trail.
- **Human-in-the-loop.** The `approval` agent returns an approver chain; wire it
  to real approvers and pause the engine on `conditional`/high-risk steps.

## Design principles

1. **Composition over pipelines** — process scales with spend and risk.
2. **Offline-first & deterministic** — runnable and testable with zero secrets.
3. **Explainable** — every step records *why* it was included and what it decided.
4. **Marketplace-native** — capabilities are independently published, priced units.

## Roadmap

- [ ] Parallel execution of independent DAG branches (engine already has the DAG)
- [ ] MCP-backed supplier/budget/contract tools
- [ ] Persistence layer + audit UI
- [ ] Multi-round negotiation with real supplier agents (agent-to-agent)
- [ ] Policy editor so finance can tune tiers/thresholds without code
