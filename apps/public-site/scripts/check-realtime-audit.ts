#!/usr/bin/env tsx
/**
 * ==============================================================================
 * GSA HUB REALTIME AUDIT & PROGRAMMATIC VERIFICATION TOOL
 * ==============================================================================
 * Comprehensive scanner for Supabase Realtime across 100% of the GSA HUB codebase.
 * Validates:
 *  1. Legacy Hook Absence/Presence: useRealtimeTable usage & exact lines.
 *  2. Canonical Hook Compliance: useRealtimeSubscription, useRealtime, subscribeToTable.
 *  3. Ad-Hoc Channel Scan: direct supabase.channel() calls & lifecycle cleanup validation.
 *  4. Anti-Patterns: unmemoized channel names (Date.now/Math.random), setInterval polling.
 *  5. Catalog verification for the 94 system components.
 *
 * Usage:
 *  npx tsx scripts/check-realtime-audit.ts
 *  npx ts-node scripts/check-realtime-audit.ts
 *  npx tsx scripts/check-realtime-audit.ts --json
 *  npx tsx scripts/check-realtime-audit.ts --target-94
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Types & Interfaces ---

export type Severity = 'CRITICAL' | 'WARNING' | 'INFO' | 'OK';

export interface LocationFinding {
  file: string;
  relativePath: string;
  lineNumber: number;
  column: number;
  lineContent: string;
  snippet?: string;
}

export interface LegacyHookFinding extends LocationFinding {
  type: 'useRealtimeTable_import' | 'useRealtimeTable_call';
  suggestedMigration: string;
}

export interface CanonicalHookUsage {
  file: string;
  relativePath: string;
  lineNumber: number;
  hookName: 'useRealtimeSubscription' | 'useRealtime' | 'subscribeToTable';
  tables: string[];
  filter?: string;
  event?: string;
  debounceMs?: number;
  hasCleanup: boolean; // Canonical hooks have built-in cleanup
  lineContent: string;
}

export interface AdHocChannelUsage {
  file: string;
  relativePath: string;
  lineNumber: number;
  channelExpression: string;
  hasCleanup: boolean;
  cleanupMethod?: 'removeChannel' | 'unsubscribe' | 'none';
  hasUnstableName: boolean;
  tables: string[];
  filter?: string;
  lineContent: string;
  suggestedMigration: string;
}

export interface ComponentAuditProfile {
  fileName: string;
  relativePath: string;
  hookUsed: string[];
  tables: string[];
  filters: string[];
  events: string[];
  hasCleanup: boolean;
  hasDebounce: boolean;
  debounceMs?: number;
  severity: Severity;
  issues: string[];
}

export interface AuditReportData {
  timestamp: string;
  totalFilesScanned: number;
  totalRealtimeConsumers: number;
  legacyHookFindings: LegacyHookFinding[];
  canonicalHookUsages: CanonicalHookUsage[];
  adHocChannelUsages: AdHocChannelUsage[];
  target94Profiles: ComponentAuditProfile[];
  metrics: {
    legacyHookFilesCount: number;
    canonicalAdoptionRate: string;
    adHocChannelsTotal: number;
    adHocChannelsCleaned: number;
    adHocChannelsLeaking: number;
    unstableChannelNamesCount: number;
    healthScore: number;
    status: 'PASS' | 'FAIL_WITH_WARNINGS' | 'CRITICAL_FAILURE';
  };
}

// --- ANSI Colors ---
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
};

// --- Canonical 94 Components Target List ---
export const TARGET_94_COMPONENTS = [
  'AcessosModule.tsx', 'AdminPrestadorDocumentos.tsx', 'AdvertiserPortal.tsx',
  'AdvertisingAdminModule.tsx', 'AffiliateAdminModule.tsx', 'AfiliadoDashboard.tsx',
  'AfiliadosSection.tsx', 'AreaVipView.tsx', 'AssinaturasModule.tsx',
  'AtendimentoTicketsView.tsx', 'CalculadorasGatewayView.tsx', 'CareersAdminModule.tsx',
  'CheckoutModal.tsx', 'CheckoutPage.tsx', 'ClassifiedsModule.tsx',
  'ClientAffiliatePanel.tsx', 'ClientAreaVIP.tsx', 'ClientAssinaturas.tsx',
  'ClientFidelidade.tsx', 'ClientFinanceiro.tsx', 'ClientIndiqueGanhe.tsx',
  'ClientMeuCredito.tsx', 'ClientOrcamentos.tsx', 'ClientPontos.tsx',
  'ClientProdutos.tsx', 'ClientProfile.tsx', 'ClientServicos.tsx',
  'ClientSuporte.tsx', 'ClientTransferencias.tsx', 'ClientVouchers.tsx',
  'CobrancaView.tsx', 'ConfiguracoesModule.tsx', 'ContratosDocumentosView.tsx',
  'CreateListingWizard.tsx', 'CrmClientesView.tsx', 'Dashboard.tsx',
  'DemandasColaboradorModule.tsx', 'DemandasComentarios.tsx', 'DemandasDashboard.tsx',
  'DemandasDetalhesModal.tsx', 'EcommerceHeader.tsx', 'EcommerceHome.tsx',
  'EditClassifiedListingPage.tsx', 'EmprestimosCreditoView.tsx', 'FaturamentoView.tsx',
  'FidelidadePromocoesSection.tsx', 'FinanceiroSuperDomain.tsx', 'FiscalModule.tsx',
  'FiscalView.tsx', 'FluxoCaixaView.tsx', 'FornecedoresModule.tsx',
  'FornecedoresSection.tsx', 'GovernancaAcessosView.tsx', 'GovernancaAuditoriaView.tsx',
  'GovernancaConfiguracoesView.tsx', 'GovernancaExecutiveDashboard.tsx', 'GovernancaInfraView.tsx',
  'GsaSaudeView.tsx', 'GsaSegurosView.tsx', 'GsaTvModule.tsx',
  'HubEmpresasView.tsx', 'NovaDemandaModal.tsx', 'NovoPrestadorDrawer.tsx',
  'OperacoesSuperDomain.tsx', 'OrcamentosWorkstation.tsx', 'OrdensAssinaturaModule.tsx',
  'OrdensCompraModule.tsx', 'PartnersAdminModule.tsx', 'PartnersPage.tsx',
  'PaymentModal.tsx', 'PayoutClearanceDrawer.tsx', 'PessoasSuperDomain.tsx',
  'PrestadorDetailDrawer.tsx', 'PrestadoresSection.tsx', 'ProdutosModule.tsx',
  'ProtectionAdminModule.tsx', 'ProtocolConsultPage.tsx', 'PurchasesPage.tsx',
  'RentabilidadeReembolsosView.tsx', 'SaquesList.tsx', 'SaquesRepassesSection.tsx',
  'ScrapingAdminModule.tsx', 'ServicePackagesModule.tsx', 'ServicosModule.tsx',
  'ShopeeOperationsModule.tsx', 'SiteCampaignAdminModule.tsx', 'StoreHub.tsx',
  'SupportConversationModal.tsx', 'SystemMonitorModule.tsx', 'TrabalheConoscoSection.tsx',
  'TravelAdminModule.tsx', 'TravelCancellationsPage.tsx', 'TravelProposalsPage.tsx',
  'TravelQuoteRequestPage.tsx', 'TravelReservationPage.tsx', 'usePublicRegistrationSettings.ts',
  'VendasModule.tsx', 'ViagensCategoriasModule.tsx'
];

// --- Helper Functions ---

function getProjectRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '..');
}

export function walkDirectory(dir: string, extensions: string[] = ['.ts', '.tsx']): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== '.agents') {
        results = results.concat(walkDirectory(fullPath, extensions));
      }
    } else if (entry.isFile()) {
      if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// --- Main Scanner Logic ---

export function runRealtimeAudit(options: { rootDir?: string } = {}): AuditReportData {
  const rootDir = options.rootDir || getProjectRoot();
  const srcDir = path.join(rootDir, 'src');
  const allFiles = walkDirectory(srcDir);

  const legacyHookFindings: LegacyHookFinding[] = [];
  const canonicalHookUsages: CanonicalHookUsage[] = [];
  const adHocChannelUsages: AdHocChannelUsage[] = [];
  const target94Map = new Map<string, string>(); // basename -> fullPath

  // Index 94 target files
  for (const f of allFiles) {
    const base = path.basename(f);
    if (TARGET_94_COMPONENTS.includes(base)) {
      target94Map.set(base, f);
    }
  }

  const filesWithRealtime = new Set<string>();

  for (const filePath of allFiles) {
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    const isHookDefinition = relPath === 'src/hooks/useRealtime.ts' || relPath === 'src/hooks/useRealtimeTable.ts' || relPath === 'src/lib/supabaseRealtime.ts';
    const isTestFile = relPath.startsWith('src/tests/');

    // 1. SCAN FOR LEGACY HOOK: useRealtimeTable
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      if (line.includes('useRealtimeTable')) {
        // Check if import or call
        const isImport = /import\s+.*useRealtimeTable.*from/.test(line);
        const isCall = /useRealtimeTable\s*\(/.test(line);

        if (!isHookDefinition && !isTestFile) {
          if (isImport) {
            legacyHookFindings.push({
              file: filePath,
              relativePath: relPath,
              lineNumber: lineNum,
              column: line.indexOf('useRealtimeTable') + 1,
              lineContent: line.trim(),
              type: 'useRealtimeTable_import',
              suggestedMigration: "Replace with: import { useRealtimeSubscription } from '../hooks/useRealtime';"
            });
            filesWithRealtime.add(relPath);
          } else if (isCall) {
            legacyHookFindings.push({
              file: filePath,
              relativePath: relPath,
              lineNumber: lineNum,
              column: line.indexOf('useRealtimeTable') + 1,
              lineContent: line.trim(),
              type: 'useRealtimeTable_call',
              suggestedMigration: "Migrate to canonical useRealtimeSubscription({ table: '<table_name>', onChange: <handler>, debounceMs: 300 })"
            });
            filesWithRealtime.add(relPath);
          }
        }
      }
    });

    // 2. SCAN FOR CANONICAL HOOKS: useRealtimeSubscription, useRealtime, subscribeToTable
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const usesCanonicalSub = /useRealtimeSubscription\s*\(/.test(line);
      const usesCanonicalSimple = /useRealtime\s*\(/.test(line) && !line.includes('export function useRealtime');
      const usesSubscribeToTable = /subscribeToTable\s*\(/.test(line) && !line.includes('export function subscribeToTable');

      if ((usesCanonicalSub || usesCanonicalSimple || usesSubscribeToTable) && !isHookDefinition && !isTestFile) {
        filesWithRealtime.add(relPath);

        const hookName = usesCanonicalSub
          ? 'useRealtimeSubscription'
          : usesCanonicalSimple
          ? 'useRealtime'
          : 'subscribeToTable';

        // Extract table names heuristically from surrounding context or line
        const tables: string[] = [];
        const surrounding = lines.slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 10)).join('\n');
        
        const tableMatches = surrounding.match(/table:\s*['"`]([a-zA-Z0-9_-]+)['"`]/g);
        if (tableMatches) {
          tableMatches.forEach(m => {
            const t = m.replace(/table:\s*['"`]/, '').replace(/['"`]/, '');
            if (!tables.includes(t)) tables.push(t);
          });
        }

        // Direct string table argument (e.g. useRealtime('parceiros', ...))
        const simpleTableMatch = line.match(/(?:useRealtime|subscribeToTable)\s*\(\s*['"`]([a-zA-Z0-9_-]+)['"`]/);
        if (simpleTableMatch && simpleTableMatch[1] && !tables.includes(simpleTableMatch[1])) {
          tables.push(simpleTableMatch[1]);
        }

        // Array table argument (e.g. useRealtimeTable(['a', 'b']) or configs)
        const arrayTableMatch = surrounding.match(/\[\s*(['"`][a-zA-Z0-9_-]+['"`]\s*,\s*)+['"`][a-zA-Z0-9_-]+['"`]\s*\]/);
        if (arrayTableMatch) {
          const matchedTables = arrayTableMatch[0].match(/['"`]([a-zA-Z0-9_-]+)['"`]/g);
          if (matchedTables) {
            matchedTables.forEach(t => {
              const clean = t.replace(/['"`]/g, '');
              if (!tables.includes(clean)) tables.push(clean);
            });
          }
        }

        // Extract filter
        const filterMatch = surrounding.match(/filter:\s*([`'"][^`'"]+[`'"])/);
        const filter = filterMatch ? filterMatch[1].replace(/[`'"]/g, '') : undefined;

        // Extract debounce
        const debounceMatch = surrounding.match(/debounceMs:\s*(\d+)/);
        const debounceMs = debounceMatch ? parseInt(debounceMatch[1], 10) : undefined;

        // Extract event
        const eventMatch = surrounding.match(/event:\s*['"`](INSERT|UPDATE|DELETE|\*)['"`]/);
        const event = eventMatch ? eventMatch[1] : undefined;

        canonicalHookUsages.push({
          file: filePath,
          relativePath: relPath,
          lineNumber: lineNum,
          hookName,
          tables,
          filter,
          debounceMs,
          event,
          hasCleanup: true, // Built into the canonical hook implementation
          lineContent: line.trim(),
        });
      }
    });

    // 3. SCAN FOR AD-HOC DIRECT CHANNELS (.channel() / supabase.channel())
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      if (line.includes('.channel(') && !isHookDefinition && !isTestFile) {
        filesWithRealtime.add(relPath);

        // Check channel expression
        const channelMatch = line.match(/\.channel\(([^)]+)\)/);
        const channelExpr = channelMatch ? channelMatch[1].trim() : 'unknown';

        const hasUnstableName = channelExpr.includes('Date.now()') || channelExpr.includes('Math.random()');

        // Check if file contains cleanup
        const hasRemoveChannel = content.includes('removeChannel(') || content.includes('.removeChannel');
        const hasUnsubscribe = content.includes('.unsubscribe(') || content.includes('unsubscribe()');
        const hasCleanup = hasRemoveChannel || hasUnsubscribe;
        const cleanupMethod = hasRemoveChannel ? 'removeChannel' : hasUnsubscribe ? 'unsubscribe' : 'none';

        // Extract table references from surrounding context
        const surrounding = lines.slice(Math.max(0, idx - 3), Math.min(lines.length, idx + 12)).join('\n');
        const tables: string[] = [];
        const tableMatches = surrounding.match(/table:\s*['"`]([a-zA-Z0-9_-]+)['"`]/g);
        if (tableMatches) {
          tableMatches.forEach(m => {
            const t = m.replace(/table:\s*['"`]/, '').replace(/['"`]/, '');
            if (!tables.includes(t)) tables.push(t);
          });
        }

        const filterMatch = surrounding.match(/filter:\s*([`'"][^`'"]+[`'"])/);
        const filter = filterMatch ? filterMatch[1].replace(/[`'"]/g, '') : undefined;

        adHocChannelUsages.push({
          file: filePath,
          relativePath: relPath,
          lineNumber: lineNum,
          channelExpression: channelExpr,
          hasCleanup,
          cleanupMethod,
          hasUnstableName,
          tables,
          filter,
          lineContent: line.trim(),
          suggestedMigration: `Migrate ad-hoc channel to useRealtimeSubscription({ table: '${tables[0] || 'target_table'}', onChange: ... }) for automatic reconnection and centralized cleanup.`
        });
      }
    });
  }

  // 4. GENERATE 94 TARGET COMPONENT PROFILES
  const target94Profiles: ComponentAuditProfile[] = [];

  for (const componentName of TARGET_94_COMPONENTS) {
    const fullPath = target94Map.get(componentName);
    if (!fullPath) {
      target94Profiles.push({
        fileName: componentName,
        relativePath: 'NOT_FOUND_IN_SRC',
        hookUsed: ['NONE'],
        tables: [],
        filters: [],
        events: [],
        hasCleanup: false,
        hasDebounce: false,
        severity: 'WARNING',
        issues: ['Component file not found in src/ tree'],
      });
      continue;
    }

    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    const content = fs.readFileSync(fullPath, 'utf8');

    const hooksUsed: string[] = [];
    const tables: string[] = [];
    const filters: string[] = [];
    const events: string[] = [];
    const issues: string[] = [];

    // Check hook types
    if (content.includes('useRealtimeTable(') || content.includes('useRealtimeTable')) {
      hooksUsed.push('useRealtimeTable (LEGACY)');
      issues.push('Uses deprecated useRealtimeTable hook - migration required.');
    }
    if (content.includes('useRealtimeSubscription(') || content.includes('useRealtimeSubscription')) {
      hooksUsed.push('useRealtimeSubscription (CANONICAL)');
    }
    if (content.includes('useRealtime(')) {
      hooksUsed.push('useRealtime (CANONICAL)');
    }
    if (content.includes('subscribeToTable(')) {
      hooksUsed.push('subscribeToTable (CANONICAL_HELPER)');
    }
    if (content.includes('.channel(')) {
      hooksUsed.push('.channel() (DIRECT_ADHOC)');
    }
    if (hooksUsed.length === 0) {
      hooksUsed.push('STATIC_OR_INDIRECT');
    }

    // Extract tables
    const tableMatches = content.match(/table:\s*['"`]([a-zA-Z0-9_-]+)['"`]/g);
    if (tableMatches) {
      tableMatches.forEach(m => {
        const t = m.replace(/table:\s*['"`]/, '').replace(/['"`]/, '');
        if (!tables.includes(t)) tables.push(t);
      });
    }

    // Extract filters
    const filterMatches = content.match(/filter:\s*([`'"][^`'"]+[`'"])/g);
    if (filterMatches) {
      filterMatches.forEach(m => {
        const f = m.replace(/filter:\s*/, '').replace(/[`'"]/g, '');
        if (!filters.includes(f)) filters.push(f);
      });
    }

    // Extract events
    const eventMatches = content.match(/event:\s*['"`](INSERT|UPDATE|DELETE|\*)['"`]/g);
    if (eventMatches) {
      eventMatches.forEach(m => {
        const e = m.replace(/event:\s*['"`]/, '').replace(/['"`]/, '');
        if (!events.includes(e)) events.push(e);
      });
    }

    // Check debounce
    const hasDebounce = /debounceMs:\s*\d+/.test(content) || /debounce\s*\(/.test(content) || /setTimeout\s*\(.*fetch/s.test(content);
    const debounceMatch = content.match(/debounceMs:\s*(\d+)/);
    const debounceMs = debounceMatch ? parseInt(debounceMatch[1], 10) : undefined;

    // Check cleanup
    const hasCanonical = hooksUsed.some(h => h.includes('CANONICAL'));
    const hasRemove = content.includes('removeChannel') || content.includes('unsubscribe');
    const hasCleanup = hasCanonical || hasRemove;

    if (!hasCleanup && hooksUsed.includes('.channel() (DIRECT_ADHOC)')) {
      issues.push('Direct .channel() without verified removeChannel/unsubscribe cleanup (POTENTIAL CHANNEL LEAK).');
    }

    if (content.includes('.channel(`') && (content.includes('Date.now()') || content.includes('Math.random()'))) {
      issues.push('Ad-hoc channel name generated with Date.now()/Math.random() without stable memoization.');
    }

    // Determine severity
    let severity: Severity = 'OK';
    if (issues.some(i => i.includes('POTENTIAL CHANNEL LEAK'))) {
      severity = 'CRITICAL';
    } else if (issues.length > 0 || hooksUsed.includes('useRealtimeTable (LEGACY)')) {
      severity = 'WARNING';
    }

    target94Profiles.push({
      fileName: componentName,
      relativePath: relPath,
      hookUsed: hooksUsed,
      tables,
      filters,
      events,
      hasCleanup,
      hasDebounce,
      debounceMs,
      severity,
      issues,
    });
  }

  // Calculate Metrics & Health Score
  const legacyHookFiles = new Set(legacyHookFindings.map(f => f.relativePath));
  const adHocLeaking = adHocChannelUsages.filter(a => !a.hasCleanup).length;
  const unstableChannels = adHocChannelUsages.filter(a => a.hasUnstableName).length;
  const totalSubscribers = canonicalHookUsages.length + adHocChannelUsages.length + legacyHookFindings.filter(f => f.type === 'useRealtimeTable_call').length;

  const canonicalCount = canonicalHookUsages.length;
  const canonicalAdoptionRate = totalSubscribers > 0
    ? `${((canonicalCount / totalSubscribers) * 100).toFixed(1)}%`
    : '0%';

  // Health Score deduction calculation:
  // 100 base score
  // -15 for each leaking direct channel (Critical)
  // -5 for each legacy hook file (Warning)
  // -2 for each unstable channel name (Warning)
  let healthScore = 100;
  healthScore -= adHocLeaking * 15;
  healthScore -= legacyHookFiles.size * 5;
  healthScore -= unstableChannels * 2;
  healthScore = Math.max(0, Math.min(100, healthScore));

  let status: 'PASS' | 'FAIL_WITH_WARNINGS' | 'CRITICAL_FAILURE' = 'PASS';
  if (adHocLeaking > 0) {
    status = 'CRITICAL_FAILURE';
  } else if (legacyHookFiles.size > 0 || unstableChannels > 0) {
    status = 'FAIL_WITH_WARNINGS';
  }

  return {
    timestamp: new Date().toISOString(),
    totalFilesScanned: allFiles.length,
    totalRealtimeConsumers: filesWithRealtime.size,
    legacyHookFindings,
    canonicalHookUsages,
    adHocChannelUsages,
    target94Profiles,
    metrics: {
      legacyHookFilesCount: legacyHookFiles.size,
      canonicalAdoptionRate,
      adHocChannelsTotal: adHocChannelUsages.length,
      adHocChannelsCleaned: adHocChannelUsages.filter(a => a.hasCleanup).length,
      adHocChannelsLeaking: adHocLeaking,
      unstableChannelNamesCount: unstableChannels,
      healthScore,
      status,
    },
  };
}

// --- Terminal Output Formatter ---

export function printTerminalReport(report: AuditReportData, options: { showAllComponents?: boolean } = {}) {
  const { metrics, legacyHookFindings, adHocChannelUsages, target94Profiles } = report;

  console.log(`\n${colors.cyan}╔════════════════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.bold}${colors.white}             GSA HUB REALTIME INFRASTRUCTURE AUDIT REPORT                       ${colors.reset}${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log(`${colors.dim} Timestamp: ${report.timestamp} | Files in src/: ${report.totalFilesScanned} | Active Realtime: ${report.totalRealtimeConsumers}${colors.reset}\n`);

  // --- 1. LEGACY HOOK AUDIT SECTION ---
  console.log(`${colors.bold}${colors.magenta}▶ SECTION 1: LEGACY HOOK AUDIT (useRealtimeTable)${colors.reset}`);
  console.log(`${colors.dim}--------------------------------------------------------------------------------${colors.reset}`);
  if (legacyHookFindings.length === 0) {
    console.log(`${colors.green}  ✔ 100% CLEAN: No usages of legacy useRealtimeTable found in production code.${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bold}  ✖ DETECTED ${legacyHookFindings.length} OCCURRENCES OF LEGACY useRealtimeTable IN PRODUCTION:${colors.reset}`);
    legacyHookFindings.forEach((f, i) => {
      console.log(`    ${colors.yellow}${i + 1}. [${f.type}] ${colors.white}${f.relativePath}:${f.lineNumber}:${f.column}${colors.reset}`);
      console.log(`       ${colors.dim}Code: ${f.lineContent}${colors.reset}`);
      console.log(`       ${colors.cyan}Fix:  ${f.suggestedMigration}${colors.reset}`);
    });
  }
  console.log();

  // --- 2. CANONICAL HOOK COMPLIANCE ---
  console.log(`${colors.bold}${colors.blue}▶ SECTION 2: CANONICAL HOOK ADOPTION & COMPLIANCE${colors.reset}`);
  console.log(`${colors.dim}--------------------------------------------------------------------------------${colors.reset}`);
  console.log(`  • Canonical hook calls detected: ${colors.bold}${report.canonicalHookUsages.length}${colors.reset}`);
  console.log(`  • Adoption Rate: ${colors.bold}${colors.green}${metrics.canonicalAdoptionRate}${colors.reset}`);
  console.log(`  • Infrastructure Canonical Hooks:`);
  console.log(`    - ${colors.green}useRealtimeSubscription${colors.reset} : Multi-table, typed, debounce & guaranteed cleanup`);
  console.log(`    - ${colors.green}useRealtime${colors.reset}             : Shorthand single-table wrapper`);
  console.log(`    - ${colors.green}subscribeToTable${colors.reset}        : Imperative non-React helper`);
  console.log();

  // --- 3. AD-HOC CHANNEL LIFECYCLE & CLEANUP SCAN ---
  console.log(`${colors.bold}${colors.yellow}▶ SECTION 3: DIRECT supabase.channel() AUDIT & LIFECYCLE${colors.reset}`);
  console.log(`${colors.dim}--------------------------------------------------------------------------------${colors.reset}`);
  console.log(`  • Total direct .channel() calls: ${colors.bold}${metrics.adHocChannelsTotal}${colors.reset}`);
  console.log(`  • Verified with cleanup (removeChannel/unsubscribe): ${colors.green}${colors.bold}${metrics.adHocChannelsCleaned}${colors.reset}`);
  console.log(`  • Potential Leaks (Missing cleanup): ${metrics.adHocChannelsLeaking > 0 ? colors.red + colors.bold + metrics.adHocChannelsLeaking : colors.green + '0'}${colors.reset}`);
  console.log(`  • Unstable Channel Names (Date.now/Math.random in render): ${metrics.unstableChannelNamesCount > 0 ? colors.yellow + metrics.unstableChannelNamesCount : colors.green + '0'}${colors.reset}`);
  
  const leakingChannels = adHocChannelUsages.filter(u => !u.hasCleanup);
  if (leakingChannels.length > 0) {
    console.log(`\n  ${colors.red}${colors.bold}CRITICAL LEAKING CHANNELS:${colors.reset}`);
    leakingChannels.forEach((u, i) => {
      console.log(`    ${i + 1}. ${colors.red}${u.relativePath}:${u.lineNumber}${colors.reset} -> ${u.lineContent}`);
    });
  }
  console.log();

  // --- 4. 94-COMPONENT CATALOG MATRIX ---
  console.log(`${colors.bold}${colors.cyan}▶ SECTION 4: 94-COMPONENT AUDIT MATRIX SUMMARY${colors.reset}`);
  console.log(`${colors.dim}--------------------------------------------------------------------------------${colors.reset}`);
  const okProfiles = target94Profiles.filter(p => p.severity === 'OK');
  const warnProfiles = target94Profiles.filter(p => p.severity === 'WARNING');
  const critProfiles = target94Profiles.filter(p => p.severity === 'CRITICAL');

  console.log(`  • Components Audited: ${colors.bold}${target94Profiles.length}${colors.reset}`);
  console.log(`  • Status Breakdown: 🟢 OK: ${colors.green}${okProfiles.length}${colors.reset} | 🟡 Warning: ${colors.yellow}${warnProfiles.length}${colors.reset} | 🔴 Critical: ${colors.red}${critProfiles.length}${colors.reset}`);
  
  if (warnProfiles.length > 0 || critProfiles.length > 0) {
    console.log(`\n  ${colors.yellow}${colors.bold}Flagged Components Requiring Attention (${warnProfiles.length + critProfiles.length}):${colors.reset}`);
    [...critProfiles, ...warnProfiles].forEach((p, idx) => {
      const badge = p.severity === 'CRITICAL' ? `${colors.red}🔴 CRIT${colors.reset}` : `${colors.yellow}🟡 WARN${colors.reset}`;
      const tablesStr = p.tables.length > 0 ? p.tables.join(', ') : 'none/indirect';
      console.log(`    [${idx + 1}] ${badge} ${colors.bold}${p.fileName.padEnd(32)}${colors.reset} | Tables: ${colors.cyan}${tablesStr}${colors.reset}`);
      p.issues.forEach(iss => console.log(`         └─ ${colors.yellow}Issue: ${iss}${colors.reset}`));
    });
  }

  if (options.showAllComponents) {
    console.log(`\n  ${colors.dim}Full 94-Component Catalog Breakdown:${colors.reset}`);
    target94Profiles.forEach((p, idx) => {
      const badge = p.severity === 'OK'
        ? `${colors.green}🟢 OK  ${colors.reset}`
        : p.severity === 'WARNING'
        ? `${colors.yellow}🟡 WARN${colors.reset}`
        : `${colors.red}🔴 CRIT${colors.reset}`;
      const tablesStr = p.tables.length > 0 ? p.tables.join(', ') : 'none/indirect';
      const hooksStr = p.hookUsed.join(', ');
      console.log(`    [${String(idx + 1).padStart(2, '0')}] ${badge} ${colors.bold}${p.fileName.padEnd(34)}${colors.reset} | ${colors.cyan}${tablesStr.slice(0, 30).padEnd(30)}${colors.reset} | ${colors.dim}${hooksStr}${colors.reset}`);
    });
  } else {
    console.log(`\n  ${colors.dim}(Use --all-components flag to display the full file-by-file catalog list)${colors.reset}`);
  }
  console.log();

  // --- 5. EXECUTIVE SCORECARD & BANNER ---
  console.log(`${colors.cyan}╔════════════════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.bold}${colors.white}                            AUDIT SCORECARD                                     ${colors.reset}${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╠════════════════════════════════════════════════════════════════════════════════╣${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  Health Score: ${metrics.healthScore >= 90 ? colors.green : metrics.healthScore >= 70 ? colors.yellow : colors.red}${colors.bold}${metrics.healthScore}/100${colors.reset}                                                      ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  Legacy Hook Violations (useRealtimeTable): ${metrics.legacyHookFilesCount === 0 ? colors.green + '0 (NONE)' : colors.red + metrics.legacyHookFilesCount + ' FILES DETECTED'}${colors.reset}                           ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  Canonical Realtime Adoption Rate:          ${colors.bold}${colors.green}${metrics.canonicalAdoptionRate.padEnd(10)}${colors.reset}                          ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  Direct Channels Without Cleanup:           ${metrics.adHocChannelsLeaking === 0 ? colors.green + '0 (ZERO LEAKS)' : colors.red + metrics.adHocChannelsLeaking + ' LEAKING'}${colors.reset}                          ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  Overall Status: ${metrics.status === 'PASS' ? colors.bgGreen + colors.white + ' PASS ' : metrics.status === 'FAIL_WITH_WARNINGS' ? colors.bgYellow + colors.white + ' PASS WITH WARNINGS ' : colors.bgRed + colors.white + ' FAIL (CRITICAL) '}${colors.reset}                                         ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);
}

// --- CLI Execution ---

export function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const showAllComponents = args.includes('--all-components') || args.includes('--target-94');

  const report = runRealtimeAudit();

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTerminalReport(report, { showAllComponents });
  }

  // Exit with appropriate code
  if (report.metrics.adHocChannelsLeaking > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Run when directly invoked
if (process.argv[1] && (process.argv[1].endsWith('check-realtime-audit.ts') || process.argv[1].endsWith('check-realtime-audit.js') || process.argv[1].endsWith('check-realtime-audit.mjs'))) {
  main();
}
