# agentic-procurement

**An AI agents marketplace for the future of enterprise procurement — with dynamic, runtime-composed workflows.**

This is a working prototype that explores what enterprise buying looks like when
a *marketplace of specialized AI agents* (sourcing, vetting, negotiation,
compliance, approval, contracting…) is assembled **on the fly** into a workflow
tailored to each individual purchase — instead of running every request through
the same rigid pipeline.

> Inspired by Anthropic's research on agentic commerce / autonomous buying
> ("Project Deal") and the Model Context Protocol. The PDFs that prompted this
> were access-gated, so the design here is a faithful reconstruction of the
> *concepts* (agent marketplaces + dynamic procurement workflows), not their
> exact contents.

---

## The core idea

Two ingredients:

1. **An agent marketplace.** Each capability is an independently published,
   discoverable, rated, priced agent (see `src/marketplace/registry.ts`). Agents
   declare a manifest — capabilities, inputs/outputs, price-per-run, rating —
   exactly like an app-store listing. In production each could be a remote MCP
   server; here they run in-process.

2. **Dynamic workflows.** A **planner** (`src/workflow/planner.ts`) inspects each
   request and *composes a DAG* of marketplace agents suited to that deal's spend
   tier and risk. A $1,200 desk order is fast-tracked; an $84k PII-handling SaaS
   deal with a new vendor pulls in vetting, negotiation, compliance/legal and
   contracting. The DAG is then executed by the engine
   (`src/workflow/engine.ts`) over a shared "blackboard".

```
request ─▶ PLANNER ─▶ tailored DAG ─▶ ENGINE ─▶ outcome (decision, savings, PO)
                          │
        ┌─────────────────┴─────────────────────────────┐
   intake → sourcing → vetting → negotiation ┐
                       └──────► compliance ───┴► approval → contract → PO
```

## Runs offline out of the box

Every agent pairs a **Claude prompt** with a **deterministic fallback** that
encodes the same domain policy. With no API key the system runs fully offline in
**mock mode** (great for demos, tests and CI); set `ANTHROPIC_API_KEY` and the
agents delegate judgement to Claude (`claude-opus-4-8` by default).

## Quick start

```bash
npm install
npm run demo          # runs 3 bundled sample requests end-to-end (mock mode)
npm test              # offline tests
npm run serve         # HTTP API on :8787
```

Run a single custom request:

```bash
npm run demo examples/my-request.json
```

Use live Claude agents:

```bash
cp .env.example .env   # then set ANTHROPIC_API_KEY
npm run demo
```

## HTTP API

```bash
npm run serve
```

| Method | Path                         | Purpose                                  |
|--------|------------------------------|------------------------------------------|
| GET    | `/health`                    | Status + LLM mode                        |
| GET    | `/marketplace/agents`        | List agent manifests (`?q=` to search)   |
| GET    | `/marketplace/agents/:id`    | One agent manifest                        |
| POST   | `/procurements/plan`         | Dry-run: returns the composed workflow    |
| POST   | `/procurements`              | Execute end-to-end, returns full outcome  |

```bash
curl -s localhost:8787/procurements -H 'content-type: application/json' \
  -d @examples/sample-requests-single.json | jq .decision
```

## The agents

| Agent | Role |
|-------|------|
| `intake` | Normalize the request, extract requirements, flag early risk |
| `sourcing` | Discover qualified suppliers, collect competitive bids |
| `vetting` | Score & shortlist suppliers on a weighted scorecard |
| `negotiation` | Negotiate price + terms using competitive leverage |
| `compliance` | Data-protection / certification / country-risk review |
| `approval` | Route the approval chain by spend tier & risk, then decide |
| `contract` | Draft a contract folding in negotiated + required clauses |
| `purchase_order` | Issue the PO once approved |

## Project layout

```
src/
  agents/        # the marketplace's specialist agents (+ base class)
  marketplace/   # the agent registry / discovery surface
  workflow/      # planner (dynamic DAG) + engine (executor) + types
  llm/           # Claude client with deterministic offline fallback
  data/          # mock supplier master data
  runner.ts      # orchestration + report formatting
  index.ts       # CLI demo
  server.ts      # HTTP API
test/            # offline tests (node:test)
examples/        # sample procurement requests
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design rationale, extension
points (publishing a new agent, swapping in MCP, persistence), and roadmap.

## License

MIT © 2026 — see [LICENSE](./LICENSE).
