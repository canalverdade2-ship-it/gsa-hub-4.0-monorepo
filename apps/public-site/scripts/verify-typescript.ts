#!/usr/bin/env tsx
/**
 * ==============================================================================
 * GSA HUB TYPESCRIPT COMPILATION & TYPE-SAFETY VERIFIER
 * ==============================================================================
 * Runs compiler diagnostics via tsc --noEmit and analyzes typecheck output.
 * Formats errors by category, file, line number, and error code.
 *
 * Usage:
 *  npx tsx scripts/verify-typescript.ts
 *  npx tsx scripts/verify-typescript.ts --strict
 *  npx tsx scripts/verify-typescript.ts --json
 * ==============================================================================
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT_DIR = process.cwd();

export interface TsDiagnostic {
  file: string;
  relativePath: string;
  lineNumber: number;
  column: number;
  errorCode: string;
  message: string;
}

export function runTypeScriptCheck(strictOnly = false): { passed: boolean; diagnostics: TsDiagnostic[]; rawOutput: string } {
  const tsconfig = strictOnly ? 'tsconfig.strict.json' : 'tsconfig.json';
  const args = ['--noEmit', '-p', tsconfig];

  const result = spawnSync('npx', ['tsc', ...args], {
    cwd: ROOT_DIR,
    shell: true,
    encoding: 'utf8',
  });

  const rawOutput = (result.stdout || '') + (result.stderr || '');
  const lines = rawOutput.split(/\r?\n/);
  const diagnostics: TsDiagnostic[] = [];

  // Match pattern: src/path/file.ts(line,col): error TSXXXX: Message
  const tsErrorRegex = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;

  for (const line of lines) {
    const match = tsErrorRegex.exec(line.trim());
    if (match) {
      const [, filePath, lineStr, colStr, errorCode, message] = match;
      diagnostics.push({
        file: filePath,
        relativePath: path.relative(ROOT_DIR, filePath).replace(/\\/g, '/'),
        lineNumber: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        errorCode,
        message,
      });
    }
  }

  return {
    passed: result.status === 0 && diagnostics.length === 0,
    diagnostics,
    rawOutput,
  };
}

// CLI Execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('verify-typescript.ts')) {
  console.log('='.repeat(80));
  console.log('📘 GSA HUB — TYPESCRIPT BUILD & TYPECHECK AUDIT');
  console.log('='.repeat(80));

  const strictOnly = process.argv.includes('--strict');
  console.log(`🔧 Running tsc --noEmit (${strictOnly ? 'Strict Config' : 'Full Project'})...\n`);

  const { passed, diagnostics, rawOutput } = runTypeScriptCheck(strictOnly);

  if (passed) {
    console.log('✅ 100% CLEAN: TypeScript build completed with 0 errors and 0 type warnings.\n');
    process.exit(0);
  } else {
    console.error(`❌ TypeScript compilation failed with ${diagnostics.length} diagnostic error(s):\n`);

    const groupedByFile = new Map<string, TsDiagnostic[]>();
    for (const d of diagnostics) {
      const list = groupedByFile.get(d.relativePath) || [];
      list.push(d);
      groupedByFile.set(d.relativePath, list);
    }

    for (const [relPath, fileDiags] of groupedByFile.entries()) {
      console.error(`  📄 ${relPath} (${fileDiags.length} errors)`);
      for (const d of fileDiags.slice(0, 10)) {
        console.error(`     Line ${d.lineNumber}:${d.column} [${d.errorCode}]: ${d.message}`);
      }
      if (fileDiags.length > 10) {
        console.error(`     ... and ${fileDiags.length - 10} more errors`);
      }
      console.error('');
    }

    if (diagnostics.length === 0 && rawOutput.trim().length > 0) {
      console.error('Raw Compiler Output:\n', rawOutput);
    }

    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(diagnostics, null, 2));
    }

    process.exit(1);
  }
}
