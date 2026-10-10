#!/usr/bin/env tsx
/**
 * ==============================================================================
 * GSA HUB MASTER TEST RUNNER & VERIFICATION ORCHESTRATOR
 * ==============================================================================
 * Central test runner providing unified execution across all 5 verification tiers:
 *
 * Tier 1: Type Safety & Compilation Check (TypeScript tsc --noEmit)
 * Tier 2: Static Analysis & Code Quality (React Hooks compliance, UTF-8 Mojibake forensic audit, Production Real scan)
 * Tier 3: Integrations & Webhook Safety (VPS Webhook syntax, Concurrency Mutex, Atomic operations, Realtime contracts)
 * Tier 4: Unit & Domain Business Logic (Vitest domain suites in src/tests)
 * Tier 5: Adversarial, Concurrency & Stress Scenarios (Adversarial harnesses, Idempotency, Realtime stress)
 *
 * Usage:
 *   npx tsx scripts/test-runner-master.ts
 *   npx tsx scripts/test-runner-master.ts --tier=1,2
 *   npx tsx scripts/test-runner-master.ts --tier=3,4,5
 *   npx tsx scripts/test-runner-master.ts --fast
 *   npx tsx scripts/test-runner-master.ts --bail
 *   npx tsx scripts/test-runner-master.ts --json
 * ==============================================================================
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const ROOT_DIR = process.cwd();

export interface TierStep {
  id: string;
  name: string;
  command: string;
  args: string[];
  tier: number;
}

export interface StepResult {
  step: TierStep;
  passed: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

const ALL_STEPS: TierStep[] = [
  // --- Tier 1: Type Safety & Compilation ---
  {
    id: 't1-typescript',
    name: 'TypeScript Compilation & Diagnostics Check',
    command: 'npx',
    args: ['tsx', 'scripts/verify-typescript.ts'],
    tier: 1,
  },

  // --- Tier 2: Static Analysis & Code Quality ---
  {
    id: 't2-hooks',
    name: 'React Hooks Compliance (AST Scanner)',
    command: 'npx',
    args: ['tsx', 'scripts/verify-react-hooks.ts'],
    tier: 2,
  },
  {
    id: 't2-utf8',
    name: 'UTF-8 & Mojibake Forensic Scanner',
    command: 'npx',
    args: ['tsx', 'scripts/verify-utf8-encoding.ts'],
    tier: 2,
  },
  {
    id: 't2-production-real',
    name: 'Production Real Operational Code Audit',
    command: 'node',
    args: ['scripts/audit-production-real.mjs', '--enforce'],
    tier: 2,
  },

  // --- Tier 3: Integrations & Webhook Safety ---
  {
    id: 't3-integrations-webhooks',
    name: 'Integrations & Webhook Sanity Checker',
    command: 'npx',
    args: ['tsx', 'scripts/verify-integrations-webhooks.ts'],
    tier: 3,
  },
  {
    id: 't3-realtime-audit',
    name: 'Supabase Realtime Architectural Audit',
    command: 'npx',
    args: ['tsx', 'scripts/check-realtime-audit.ts'],
    tier: 3,
  },
  {
    id: 't3-realtime-contracts',
    name: 'Realtime Contract Verification',
    command: 'npx',
    args: ['tsx', 'scripts/check-realtime-contracts.ts'],
    tier: 3,
  },

  // --- Tier 4: Unit & Domain Business Logic ---
  {
    id: 't4-domain-units',
    name: 'Domain Unit Test Suites (Vitest)',
    command: 'npx',
    args: ['vitest', 'run', 'src/tests'],
    tier: 4,
  },

  // --- Tier 5: Adversarial, Concurrency & Stress Scenarios ---
  {
    id: 't5-adversarial-harness',
    name: 'Adversarial Stress Harness & Edge Cases',
    command: 'npx',
    args: ['vitest', 'run', 'src/tests/adversarial-stress-harness.test.ts', 'src/tests/realtime-concurrency-adversarial.test.ts'],
    tier: 5,
  },
];

function parseCliArgs() {
  const args = process.argv.slice(2);
  let selectedTiers: number[] = [1, 2, 3, 4, 5];
  let isFast = false;
  let isBail = false;
  let isJson = false;

  for (const arg of args) {
    if (arg.startsWith('--tier=')) {
      const tierVal = arg.split('=')[1];
      if (tierVal.toLowerCase() === 'all') {
        selectedTiers = [1, 2, 3, 4, 5];
      } else {
        selectedTiers = tierVal.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
      }
    } else if (arg === '--fast') {
      isFast = true;
    } else if (arg === '--bail') {
      isBail = true;
    } else if (arg === '--json') {
      isJson = true;
    }
  }

  return { selectedTiers, isFast, isBail, isJson };
}

export function runMasterSuite(): { overallPassed: boolean; durationTotalMs: number; results: StepResult[] } {
  const { selectedTiers, isFast, isBail, isJson } = parseCliArgs();

  const stepsToRun = ALL_STEPS.filter(step => {
    if (!selectedTiers.includes(step.tier)) return false;
    if (isFast && step.tier === 5) return false;
    return true;
  });

  if (!isJson) {
    console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
    console.log('║               GSA HUB MASTER TEST RUNNER & VERIFICATION SUITE             ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
    console.log(`Active Tiers: ${selectedTiers.join(', ')} | Fast Mode: ${isFast} | Bail: ${isBail}\n`);
  }

  const startTimeTotal = Date.now();
  const results: StepResult[] = [];
  let overallPassed = true;

  for (const step of stepsToRun) {
    if (!isJson) {
      console.log(`▶ [Tier ${step.tier}] Executing: ${step.name}...`);
    }

    const stepStart = Date.now();
    const spawnRes = spawnSync(step.command, step.args, {
      cwd: ROOT_DIR,
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
    });

    const stepDuration = Date.now() - stepStart;
    const passed = spawnRes.status === 0;

    const resultObj: StepResult = {
      step,
      passed,
      durationMs: stepDuration,
      stdout: spawnRes.stdout || '',
      stderr: spawnRes.stderr || '',
    };

    results.push(resultObj);

    if (!passed) {
      overallPassed = false;
      if (!isJson) {
        console.error(`  ❌ FAILED (${(stepDuration / 1000).toFixed(2)}s)`);
        if (resultObj.stderr.trim()) {
          console.error(`  [Stderr snippet]:\n${resultObj.stderr.trim().slice(0, 500)}\n`);
        }
        if (resultObj.stdout.trim()) {
          console.error(`  [Stdout snippet]:\n${resultObj.stdout.trim().slice(0, 500)}\n`);
        }
      }
      if (isBail) {
        if (!isJson) console.error('⛔ Bail activated. Halting test suite execution.');
        break;
      }
    } else {
      if (!isJson) {
        console.log(`  ✅ PASSED (${(stepDuration / 1000).toFixed(2)}s)\n`);
      }
    }
  }

  const durationTotalMs = Date.now() - startTimeTotal;

  if (isJson) {
    console.log(JSON.stringify({ overallPassed, durationTotalMs, results }, null, 2));
    return { overallPassed, durationTotalMs, results };
  }

  console.log('═'.repeat(75));
  console.log('🏁 MASTER VERIFICATION SUITE SUMMARY');
  console.log('═'.repeat(75));

  const totalSteps = stepsToRun.length;
  const passedSteps = results.filter(r => r.passed).length;
  const failedSteps = results.filter(r => !r.passed).length;

  console.log(`Total Steps Executed: ${results.length}/${totalSteps}`);
  console.log(`Passed: ${passedSteps} | Failed: ${failedSteps}`);
  console.log(`Total Duration: ${(durationTotalMs / 1000).toFixed(2)}s\n`);

  console.log('Tier Breakdown:');
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} [Tier ${r.step.tier}] ${r.step.name} (${(r.durationMs / 1000).toFixed(2)}s)`);
  }

  console.log('');
  return { overallPassed, durationTotalMs, results };
}

// CLI Execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('test-runner-master.ts')) {
  const { overallPassed } = runMasterSuite();
  process.exit(overallPassed ? 0 : 1);
}
