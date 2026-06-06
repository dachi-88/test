import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadConfig } from './config.js';
import { formatReport, runProcurement } from './runner.js';
import { log } from './utils/logger.js';
import type { ProcurementRequest } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSamples(): ProcurementRequest[] {
  const path = resolve(__dirname, '../examples/sample-requests.json');
  return JSON.parse(readFileSync(path, 'utf8')) as ProcurementRequest[];
}

async function main() {
  const config = loadConfig();
  const args = process.argv.slice(2);

  log.rule();
  log.info(`  Agentic Procurement — dynamic workflow demo`);
  log.info(`  LLM mode: ${config.mockMode ? 'MOCK (offline, deterministic)' : `LIVE (${config.model})`}`);
  log.rule();

  // Either run a single request from a JSON file arg, or all bundled samples.
  let requests: ProcurementRequest[];
  if (args[0]) {
    requests = [JSON.parse(readFileSync(resolve(process.cwd(), args[0]), 'utf8'))];
  } else {
    requests = loadSamples();
  }

  for (const request of requests) {
    log.step(`Processing ${request.id} — ${request.title}`);
    const outcome = await runProcurement(request, { config, verbose: !!process.env.VERBOSE });
    console.log('');
    console.log(formatReport(outcome));
    log.rule();
  }

  if (config.mockMode) {
    log.warn('Running in MOCK mode. Set ANTHROPIC_API_KEY in .env to use live Claude agents.');
  }
}

main().catch((err) => {
  log.err(String(err?.stack ?? err));
  process.exit(1);
});
