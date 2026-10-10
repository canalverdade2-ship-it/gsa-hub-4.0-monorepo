#!/usr/bin/env tsx
/**
 * ==============================================================================
 * GSA HUB REACT HOOKS COMPLIANCE & ARCHITECTURAL VALIDATOR (AST-Powered)
 * ==============================================================================
 * Uses TypeScript AST compiler API to accurately detect:
 *  1. Hooks called inside conditional statements (IfStatement, ConditionalExpression, SwitchStatement).
 *  2. Hooks called inside loops (ForStatement, ForInStatement, ForOfStatement, WhileStatement, DoStatement).
 *  3. Hooks called inside regular functions or async callbacks (FunctionDeclaration, FunctionExpression, ArrowFunction that is not a component or custom hook).
 *  4. Hooks called inside try/catch blocks (TryStatement, CatchClause).
 *  5. Legacy Realtime hook usages (useRealtimeTable).
 *
 * Usage:
 *  npx tsx scripts/verify-react-hooks.ts
 *  npx tsx scripts/verify-react-hooks.ts --json
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');

export interface HookViolation {
  file: string;
  relativePath: string;
  lineNumber: number;
  column: number;
  hookName: string;
  violationType: 'CONDITIONAL_HOOK' | 'LOOP_HOOK' | 'NESTED_FUNCTION_HOOK' | 'TRY_CATCH_HOOK' | 'LEGACY_HOOK';
  description: string;
  lineContent: string;
}

function isHookName(name: string): boolean {
  return /^use[A-Z0-9]/.test(name);
}

function isComponentOrHookName(name: string): boolean {
  return /^[A-Z]/.test(name) || /^use[A-Z0-9]/.test(name);
}

function walk(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__tests__' && entry.name !== 'tests') {
        walk(fullPath, fileList);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if ((ext === '.tsx' || ext === '.ts') && !entry.name.endsWith('.d.ts') && !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function checkSourceFile(sourceFile: ts.SourceFile, relativePath: string): HookViolation[] {
  const violations: HookViolation[] = [];
  const lines = sourceFile.text.split(/\r?\n/);

  function getLineContent(pos: number): { lineNumber: number; column: number; lineContent: string } {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
    return {
      lineNumber: line + 1,
      column: character + 1,
      lineContent: lines[line]?.trim() || '',
    };
  }

  // Check for legacy useRealtimeTable
  function checkLegacyHooks(node: ts.Node) {
    if (ts.isIdentifier(node) && node.text === 'useRealtimeTable') {
      const { lineNumber, column, lineContent } = getLineContent(node.getStart(sourceFile));
      violations.push({
        file: sourceFile.fileName,
        relativePath,
        lineNumber,
        column,
        hookName: 'useRealtimeTable',
        violationType: 'LEGACY_HOOK',
        description: 'Uso de hook legado useRealtimeTable detectado. Deve ser migrado para useRealtimeSubscription.',
        lineContent,
      });
    }
    ts.forEachChild(node, checkLegacyHooks);
  }

  checkLegacyHooks(sourceFile);

  // AST Context Stack to track surrounding construct types
  interface ContextFrame {
    type: 'root' | 'component' | 'custom_hook' | 'nested_function' | 'if' | 'loop' | 'try_catch' | 'hook_call';
    node: ts.Node;
    name?: string;
  }

  const contextStack: ContextFrame[] = [{ type: 'root', node: sourceFile }];

  function visit(node: ts.Node) {
    let frameAdded = false;

    // 1. Identify Component or Hook Declaration
    if (ts.isFunctionDeclaration(node)) {
      const name = node.name?.text || '';
      const frameType = isComponentOrHookName(name)
        ? (name.startsWith('use') ? 'custom_hook' : 'component')
        : 'nested_function';
      contextStack.push({ type: frameType, node, name });
      frameAdded = true;
    } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      let isComp = false;
      let name = '';
      if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
        name = node.parent.name.text;
        if (isComponentOrHookName(name)) {
          isComp = true;
        }
      }

      // Check if this arrow function is passed as an argument to a standard hook (like useEffect, useMemo, useCallback)
      const parentCall = node.parent && ts.isCallExpression(node.parent) ? node.parent : null;
      const isHookArg = parentCall && ts.isIdentifier(parentCall.expression) && isHookName(parentCall.expression.text);

      const frameType = isComp
        ? (name.startsWith('use') ? 'custom_hook' : 'component')
        : (isHookArg ? 'hook_call' : 'nested_function');

      contextStack.push({ type: frameType, node, name });
      frameAdded = true;
    } else if (ts.isIfStatement(node) || ts.isConditionalExpression(node) || ts.isSwitchStatement(node)) {
      contextStack.push({ type: 'if', node });
      frameAdded = true;
    } else if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    ) {
      contextStack.push({ type: 'loop', node });
      frameAdded = true;
    } else if (ts.isTryStatement(node) || ts.isCatchClause(node)) {
      contextStack.push({ type: 'try_catch', node });
      frameAdded = true;
    }

    // 2. Check Call Expressions for Hook Invocations
    if (ts.isCallExpression(node)) {
      let calleeName = '';
      if (ts.isIdentifier(node.expression)) {
        calleeName = node.expression.text;
      } else if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.name)) {
        calleeName = node.expression.name.text;
      }

      if (calleeName && isHookName(calleeName) && calleeName !== 'useRealtimeTable') {
        const { lineNumber, column, lineContent } = getLineContent(node.getStart(sourceFile));

        // Walk context stack from top to bottom
        let inIf = false;
        let inLoop = false;
        let inTryCatch = false;
        let inNestedFunction = false;

        for (let i = contextStack.length - 1; i >= 0; i--) {
          const frame = contextStack[i];
          if (frame.type === 'if') inIf = true;
          if (frame.type === 'loop') inLoop = true;
          if (frame.type === 'try_catch') inTryCatch = true;
          if (frame.type === 'nested_function') {
            inNestedFunction = true;
          }
          if (frame.type === 'component' || frame.type === 'custom_hook') {
            break; // Reached component root boundary
          }
        }

        if (inIf) {
          violations.push({
            file: sourceFile.fileName,
            relativePath,
            lineNumber,
            column,
            hookName: calleeName,
            violationType: 'CONDITIONAL_HOOK',
            description: `Hook ${calleeName} chamado dentro de estrutura condicional (if / ternary / switch). Viola as Regras de Hooks do React.`,
            lineContent,
          });
        } else if (inLoop) {
          violations.push({
            file: sourceFile.fileName,
            relativePath,
            lineNumber,
            column,
            hookName: calleeName,
            violationType: 'LOOP_HOOK',
            description: `Hook ${calleeName} chamado dentro de loop (for / while). Viola as Regras de Hooks do React.`,
            lineContent,
          });
        } else if (inTryCatch) {
          violations.push({
            file: sourceFile.fileName,
            relativePath,
            lineNumber,
            column,
            hookName: calleeName,
            violationType: 'TRY_CATCH_HOOK',
            description: `Hook ${calleeName} chamado dentro de bloco try/catch. Viola as Regras de Hooks do React.`,
            lineContent,
          });
        } else if (inNestedFunction) {
          violations.push({
            file: sourceFile.fileName,
            relativePath,
            lineNumber,
            column,
            hookName: calleeName,
            violationType: 'NESTED_FUNCTION_HOOK',
            description: `Hook ${calleeName} chamado dentro de função interna/callback não-componente. Deve estar no nível superior do componente React.`,
            lineContent,
          });
        }
      }
    }

    ts.forEachChild(node, visit);

    if (frameAdded) {
      contextStack.pop();
    }
  }

  visit(sourceFile);

  return violations;
}

export function runHooksAudit(): { scannedCount: number; violations: HookViolation[] } {
  const files = walk(SRC_DIR);
  const violations: HookViolation[] = [];

  for (const file of files) {
    try {
      const code = fs.readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(
        file,
        code,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
      const fileViolations = checkSourceFile(sourceFile, path.relative(ROOT_DIR, file).replace(/\\/g, '/'));
      violations.push(...fileViolations);
    } catch (err: any) {
      console.warn(`[WARN] Could not parse file ${file}:`, err.message);
    }
  }

  return { scannedCount: files.length, violations };
}

// CLI Execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('verify-react-hooks.ts')) {
  console.log('='.repeat(80));
  console.log('⚛️  GSA HUB — REACT HOOKS COMPLIANCE AUDIT (AST PARSER)');
  console.log('='.repeat(80));

  const { scannedCount, violations } = runHooksAudit();

  console.log(`📁 Scanned files: ${scannedCount} (.tsx and .ts in src/)`);
  console.log(`⚠️ Total Hook violations: ${violations.length}\n`);

  if (violations.length > 0) {
    console.error('❌ REACT HOOK VIOLATIONS DETECTED:\n');
    const groupedByFile = new Map<string, HookViolation[]>();
    for (const v of violations) {
      const list = groupedByFile.get(v.relativePath) || [];
      list.push(v);
      groupedByFile.set(v.relativePath, list);
    }

    for (const [relPath, fileViolations] of groupedByFile.entries()) {
      console.error(`  📄 ${relPath} (${fileViolations.length} violations)`);
      for (const item of fileViolations) {
        console.error(`     Line ${item.lineNumber}:${item.column} [${item.violationType}] — ${item.description}`);
        console.error(`     ↳ ${item.lineContent}`);
      }
      console.error('');
    }

    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(violations, null, 2));
    }

    process.exit(1);
  } else {
    console.log('✅ 100% CLEAN: All React hooks comply with React rules of hooks and architectural standards.\n');
    process.exit(0);
  }
}
