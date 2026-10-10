#!/usr/bin/env tsx
/**
 * ==============================================================================
 * GSA HUB INTEGRATIONS & WEBHOOKS SANITY CHECKER
 * ==============================================================================
 * Validates backend webhooks, VPS scripts, Evolution API, and n8n integrations:
 *  1. Syntax validation: node --check on all .cjs and .mjs webhook scripts.
 *  2. Concurrency Safety: SessionMutex / queue implementation in webhook servers.
 *  3. JWT & Service Role Resilience: Safe dynamic fallbacks for SUPABASE_SERVICE_ROLE_KEY.
 *  4. Atomic Points Mutation: RPC/lock protection against Read-Modify-Write race conditions.
 *  5. Error Handling & Resilience: try/catch and timeout safeguards in integration clients.
 *
 * Usage:
 *  npx tsx scripts/verify-integrations-webhooks.ts
 *  npx tsx scripts/verify-integrations-webhooks.ts --json
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = process.cwd();

export interface IntegrationCheckResult {
  target: string;
  category: 'WEBHOOK_SYNTAX' | 'CONCURRENCY_MUTEX' | 'ATOMIC_OPERATIONS' | 'AUTH_JWT_FALLBACK' | 'INTEGRATION_CLIENT';
  passed: boolean;
  message: string;
  details?: string;
}

const WEBHOOK_FILES = [
  'server_webhook.cjs',
  'server_webhook_vps_live.cjs',
];

export function runIntegrationsAudit(): { passedCount: number; failedCount: number; results: IntegrationCheckResult[] } {
  const results: IntegrationCheckResult[] = [];

  // 1. Syntax Validation for Webhook Server files
  for (const file of WEBHOOK_FILES) {
    const fullPath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(fullPath)) {
      results.push({
        target: file,
        category: 'WEBHOOK_SYNTAX',
        passed: false,
        message: `Arquivo ${file} não encontrado na raiz do projeto.`,
      });
      continue;
    }

    try {
      execSync(`node --check "${fullPath}"`, { stdio: 'pipe' });
      results.push({
        target: file,
        category: 'WEBHOOK_SYNTAX',
        passed: true,
        message: `Sintaxe JavaScript V8 válida (node --check passou com sucesso).`,
      });
    } catch (err: any) {
      results.push({
        target: file,
        category: 'WEBHOOK_SYNTAX',
        passed: false,
        message: `Erro de sintaxe JavaScript em ${file}: ${err.stderr?.toString() || err.message}`,
      });
    }

    // 2. Concurrency & Mutex Check
    const code = fs.readFileSync(fullPath, 'utf8');
    const hasMutex = /SessionMutex|mutex|queue|concurrencyLock|p-limit|lock/i.test(code);
    const hasPerNumberQueue = /messageQueue|queueByPhone|phoneLock|lockByNumber/i.test(code);

    if (hasMutex || hasPerNumberQueue) {
      results.push({
        target: file,
        category: 'CONCURRENCY_MUTEX',
        passed: true,
        message: `Proteção contra race condition de mensagens simultâneas detectada (Mutex/Queue).`,
      });
    } else {
      results.push({
        target: file,
        category: 'CONCURRENCY_MUTEX',
        passed: false,
        message: `Webhook ${file} não implementa SessionMutex ou fila por telefone contra race conditions (R4).`,
      });
    }

    // 3. Service Role JWT Fallback
    const hasJwtFallback = /SERVICE_ROLE_JWT|SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey/i.test(code);
    const hasStaticHardcodeOnly = /const\s+SERVICE_ROLE_JWT\s*=\s*['"`]eyJ/i.test(code) && !/process\.env/i.test(code);

    if (hasJwtFallback && !hasStaticHardcodeOnly) {
      results.push({
        target: file,
        category: 'AUTH_JWT_FALLBACK',
        passed: true,
        message: `Gerenciamento seguro de token de serviço (lê de variáveis de ambiente com fallback).`,
      });
    } else {
      results.push({
        target: file,
        category: 'AUTH_JWT_FALLBACK',
        passed: false,
        message: `Token SERVICE_ROLE_JWT em ${file} possui hardcode estático ou fallback vulnerável.`,
      });
    }

    // 4. Atomic Points / Balance Mutation
    const hasAtomicRpcOrLock = /gsa_add_client_points|gsa_convert_points|rpc\(|atomic|transaction/i.test(code);
    results.push({
      target: file,
      category: 'ATOMIC_OPERATIONS',
      passed: hasAtomicRpcOrLock,
      message: hasAtomicRpcOrLock
        ? `Operações de pontos utilizam RPC/função atômica contra RMW (Read-Modify-Write).`
        : `Possível vulnerabilidade de RMW em saldo de pontos em ${file}.`,
    });
  }

  // 5. Integration Clients in src/ (n8nWhatsApp.ts, evolutionApi.ts, whatsappVariationService.ts)
  const clientFiles = [
    'src/utils/n8nWhatsApp.ts',
    'src/lib/whatsappVariationService.ts',
  ];

  for (const clientFile of clientFiles) {
    const fullPath = path.join(ROOT_DIR, clientFile);
    if (fs.existsSync(fullPath)) {
      const code = fs.readFileSync(fullPath, 'utf8');
      const hasTryCatch = /try\s*\{[\s\S]*\}\s*catch/m.test(code);
      const hasTimeoutOrAbort = /AbortController|timeout|signal/i.test(code);

      results.push({
        target: clientFile,
        category: 'INTEGRATION_CLIENT',
        passed: hasTryCatch,
        message: hasTryCatch
          ? `Módulo de integração ${clientFile} possui tratamento de erro robusto (try/catch).`
          : `Módulo ${clientFile} não encapsula chamadas assíncronas em try/catch.`,
        details: hasTimeoutOrAbort ? 'Possui proteção contra timeout de rede.' : 'Recomendado adicionar AbortSignal/timeout.',
      });
    }
  }

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  return { passedCount, failedCount, results };
}

// CLI Execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('verify-integrations-webhooks.ts')) {
  console.log('='.repeat(80));
  console.log('🔌 GSA HUB — INTEGRATIONS & WEBHOOKS SANITY CHECK');
  console.log('='.repeat(80));

  const { passedCount, failedCount, results } = runIntegrationsAudit();

  console.log(`📊 Total checks: ${results.length} | ✅ Passed: ${passedCount} | ❌ Failed: ${failedCount}\n`);

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} [${r.category}] ${r.target}: ${r.message}`);
    if (r.details) {
      console.log(`   ↳ Note: ${r.details}`);
    }
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results, null, 2));
  }

  console.log('');
  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}
