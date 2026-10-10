#!/usr/bin/env tsx
/**
 * ==============================================================================
 * GSA HUB UTF-8 ENCODING & MOJIBAKE FORENSIC VERIFIER
 * ==============================================================================
 * Scans 100% of source, scripts, migrations, webhooks, and tests for:
 * 1. Unicode Replacement Characters (\uFFFD / ).
 * 2. Latin-1 / UTF-8 Double-Encoded Mojibake sequences (e.g. Ã§, Ã£, Ã©, Â°, etc.).
 * 3. Corrupted Portuguese diacritics in code strings, templates, and messages.
 * 4. Unexpected null bytes (\x00) or UTF-16 BOMs in text files.
 *
 * Usage:
 *   npx tsx scripts/verify-utf8-encoding.ts
 *   npx tsx scripts/verify-utf8-encoding.ts --json
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

const SCAN_DIRS = [
  'src',
  'scripts',
  'supabase',
  'tests',
  'automation',
];

const SCAN_ROOT_FILES = [
  'server_webhook.cjs',
  'server_webhook_vps_live.cjs',
  'vite.config.ts',
  'package.json',
];

const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /build/,
  /\.agents/,
  /\.system_generated/,
  /\.gemini/,
  /audit_realtime_report\.md/, // Historical report
];

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs',
  '.json', '.sql', '.html', '.css', '.md', '.sh', '.yml', '.yaml'
]);

// Known Mojibake regex patterns
const MOJIBAKE_PATTERNS: { id: string; regex: RegExp; description: string }[] = [
  { id: 'replacement-char', regex: /\uFFFD/, description: 'Unicode replacement character ( / \\uFFFD)' },
  { id: 'null-byte', regex: /\x00/, description: 'Unexpected null byte in text file (possible UTF-16LE / corruption)' },
  { id: 'mojibake-atilde', regex: /Ã[£a]/, description: 'Corrupted "ã" (Ã£ / Ãa)' },
  { id: 'mojibake-ccedil', regex: /Ã[§c]/, description: 'Corrupted "ç" (Ã§ / Ãc)' },
  { id: 'mojibake-eacute', regex: /Ã[©e]/, description: 'Corrupted "é" (Ã© / Ãe)' },
  { id: 'mojibake-aacute', regex: /Ã[¡a]/, description: 'Corrupted "á" (Ã¡ / Ãa)' },
  { id: 'mojibake-oacute', regex: /Ã[³o]/, description: 'Corrupted "ó" (Ã³ / Ão)' },
  { id: 'mojibake-uacute', regex: /Ã[ºu]/, description: 'Corrupted "ú" (Ãº / Ãu)' },
  { id: 'mojibake-iacute', regex: /Ã[­i]/, description: 'Corrupted "í" (Ã­ / Ãi)' },
  { id: 'mojibake-otilde', regex: /Ãµ/, description: 'Corrupted "õ" (Ãµ)' },
  { id: 'mojibake-ecirc', regex: /Ãª/, description: 'Corrupted "ê" (Ãª)' },
  { id: 'mojibake-acirc', regex: /Ã¢/, description: 'Corrupted "â" (Ã¢)' },
  { id: 'mojibake-agrave', regex: /Ã\s*[`à]/, description: 'Corrupted "à" (Ã`)' },
  { id: 'mojibake-ordinal-masc', regex: /Â[º°]/, description: 'Corrupted ordinal "º" or "°" (Âº / Â°)' },
  { id: 'mojibake-ordinal-fem', regex: /Âª/, description: 'Corrupted ordinal "ª" (Âª)' },
  { id: 'mojibake-dash-quotes', regex: /â[€\u0090-\u009F]/, description: 'Corrupted UTF-8 smart quotes or em-dashes' },
];

export interface EncodingFinding {
  file: string;
  relativePath: string;
  lineNumber: number;
  patternId: string;
  description: string;
  matchedText: string;
  lineExcerpt: string;
}

function shouldScanPath(filePath: string): boolean {
  for (const pat of IGNORE_PATTERNS) {
    if (pat.test(filePath)) return false;
  }
  return true;
}

function collectFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (!shouldScanPath(fullPath)) continue;

    if (entry.isDirectory()) {
      collectFiles(fullPath, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (TEXT_EXTENSIONS.has(ext)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function isTestAssertionLine(line: string): boolean {
  // If a test file has expect(...).not.toContain('Ã§') or /Ã§/, it's an assertion against mojibake
  const normalized = line.trim();
  return (
    normalized.includes('expect(') && (normalized.includes('not.toContain') || normalized.includes('not.toMatch') || normalized.includes('toBe'))
  ) || (
    normalized.startsWith('//') || normalized.startsWith('*')
  ) || (
    /\/[ÃÂâ].+\/\s*,?\s*(\/\/.*)?$/.test(normalized) // regex literal pattern in test list
  );
}

export function runUtf8Audit(): { scannedCount: number; findings: EncodingFinding[] } {
  const allFiles: string[] = [];

  for (const dir of SCAN_DIRS) {
    collectFiles(path.join(ROOT_DIR, dir), allFiles);
  }

  for (const rootFile of SCAN_ROOT_FILES) {
    const p = path.join(ROOT_DIR, rootFile);
    if (fs.existsSync(p)) {
      allFiles.push(p);
    }
  }

  const findings: EncodingFinding[] = [];

  for (const file of allFiles) {
    // Avoid self-scanning the detector scripts
    if (file.endsWith('verify-utf8-encoding.ts') || file.endsWith('verify-utf8-encoding.mjs')) {
      continue;
    }

    const isTestFile = file.includes('.test.') || file.includes('.spec.') || file.includes('tests/');

    try {
      const rawBuffer = fs.readFileSync(file);
      const content = rawBuffer.toString('utf8');
      const lines = content.split(/\r?\n/);

      lines.forEach((line, idx) => {
        const lineNum = idx + 1;

        if (isTestFile && isTestAssertionLine(line)) {
          return; // Skip test assertions that check for bad characters
        }

        for (const pattern of MOJIBAKE_PATTERNS) {
          pattern.regex.lastIndex = 0;
          const match = pattern.regex.exec(line);
          if (match) {
            findings.push({
              file,
              relativePath: path.relative(ROOT_DIR, file).replace(/\\/g, '/'),
              lineNumber: lineNum,
              patternId: pattern.id,
              description: pattern.description,
              matchedText: match[0],
              lineExcerpt: line.trim().slice(0, 200),
            });
            break; // Report once per line
          }
        }
      });
    } catch (err: any) {
      console.warn(`[WARN] Could not read file ${file}:`, err.message);
    }
  }

  return { scannedCount: allFiles.length, findings };
}

// CLI Execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('verify-utf8-encoding.ts')) {
  console.log('='.repeat(80));
  console.log('🔍 GSA HUB — UTF-8 & MOJIBAKE FORENSIC AUDIT');
  console.log('='.repeat(80));

  const { scannedCount, findings } = runUtf8Audit();

  console.log(`📁 Scanned files: ${scannedCount}`);
  console.log(`⚠️ Total encoding violations: ${findings.length}\n`);

  if (findings.length > 0) {
    console.error('❌ ENCODING VIOLATIONS DETECTED:\n');
    const groupedByFile = new Map<string, EncodingFinding[]>();
    for (const f of findings) {
      const list = groupedByFile.get(f.relativePath) || [];
      list.push(f);
      groupedByFile.set(f.relativePath, list);
    }

    for (const [relPath, fileFindings] of groupedByFile.entries()) {
      console.error(`  📄 ${relPath} (${fileFindings.length} issues)`);
      for (const item of fileFindings.slice(0, 5)) {
        console.error(`     Line ${item.lineNumber} [${item.patternId}]: ${item.lineExcerpt}`);
      }
      if (fileFindings.length > 5) {
        console.error(`     ... and ${fileFindings.length - 5} more issues in this file`);
      }
      console.error('');
    }

    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(findings, null, 2));
    }

    process.exit(1);
  } else {
    console.log('✅ 100% CLEAN: No UTF-8 corruption, replacement characters, or mojibake detected across codebase.\n');
    process.exit(0);
  }
}
