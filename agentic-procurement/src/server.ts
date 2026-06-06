import express from 'express';
import { loadConfig } from './config.js';
import { AgentMarketplace } from './marketplace/registry.js';
import { runProcurement } from './runner.js';
import { WorkflowPlanner } from './workflow/planner.js';
import { createLLMClient } from './llm/client.js';
import type { ProcurementRequest } from './types.js';

const config = loadConfig();
const marketplace = AgentMarketplace.withDefaults();
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', llmMode: config.mockMode ? 'mock' : 'live', model: config.model });
});

// --- Marketplace discovery ---------------------------------------------------
app.get('/marketplace/agents', (req, res) => {
  const q = String(req.query.q ?? '');
  res.json(q ? marketplace.search(q) : marketplace.list());
});

app.get('/marketplace/agents/:id', (req, res) => {
  const agent = marketplace.get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'agent not found' });
  res.json(agent.manifest);
});

// --- Workflow planning (dry run) --------------------------------------------
app.post('/procurements/plan', async (req, res) => {
  try {
    const planner = new WorkflowPlanner(createLLMClient(config), marketplace);
    const plan = await planner.plan(req.body as ProcurementRequest);
    res.json(plan);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// --- Full execution ----------------------------------------------------------
app.post('/procurements', async (req, res) => {
  try {
    const outcome = await runProcurement(req.body as ProcurementRequest, { config });
    res.json(outcome);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.listen(config.port, () => {
  console.log(`agentic-procurement API listening on http://localhost:${config.port}`);
  console.log(`  LLM mode: ${config.mockMode ? 'mock (offline)' : `live (${config.model})`}`);
});
