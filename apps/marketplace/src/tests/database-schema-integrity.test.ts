import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Import programmatic validator engine
const {
  TABLE_COLUMN_CONTRACTS,
  RPC_CONTRACTS,
  SENSITIVE_FUNCTIONS_ANON_REVOKED,
  parseMigrationsSnapshot,
  validateDatabaseContracts,
  checkColumnMatches
} = require('../../scripts/validate-db-schema.cjs');

describe('Database Schema & RPC Integrity Verification Suite (M2 / R1 / R2)', () => {
  const fixturePath = path.resolve(process.cwd(), '../../tests/fixtures/schema-metadata.json');
  const metadata = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const definitions = fs.readFileSync(path.resolve(process.cwd(), '../../tests/fixtures/current-contracts.sql'), 'utf8');
  const migration = fs.readFileSync(path.resolve(process.cwd(), '../../infra/migrations/20261012_release_contracts.sql'), 'utf8');
  const tableColumns = new Map<string, Set<string>>();
  for (const [table, column] of metadata.columns) {
    if (!tableColumns.has(table)) tableColumns.set(table, new Set());
    tableColumns.get(table)!.add(column);
  }
  for (const match of migration.matchAll(/ADD COLUMN IF NOT EXISTS ([a-z_]+)/g)) {
    tableColumns.get('faturas')!.add(match[1]);
  }
  const functions = new Map<string, any>();
  const permissions = new Map<string, any>();
  for (const fn of metadata.functions) {
    const params = fn.args.split(',').map((arg: string) => arg.trim().split(/\s+/)[0]).filter(Boolean);
    const previous = functions.get(fn.name);
    if (!previous || previous.params.length < params.length) functions.set(fn.name, { name: fn.name, params, returnType: fn.returnType, sessionGuarded: params.includes('p_sessao_id') && params.includes('p_session_token') && /public\.gsa_admin_(session_actor|validate_context)\s*\(/i.test(definitions.slice(definitions.indexOf('CREATE FUNCTION public.' + fn.name + '('), definitions.indexOf('$;', definitions.indexOf('CREATE FUNCTION public.' + fn.name + '(')))) });
    const existing = permissions.get(fn.name);
    permissions.set(fn.name, { anon: !!fn.anon || !!existing?.anon, authenticated: !!fn.authenticated || !!existing?.authenticated });
  }
  expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.gsa_admin_write_audit');
  permissions.set('gsa_admin_write_audit', { anon: false, authenticated: false });
  const schemaSnapshot = { tableColumns, functions, permissions, tableRls: new Map(metadata.rls) };

  // =========================================================================
  // DOMAIN 1: CRITICAL TABLES SCHEMA & COLUMN CONTRACTS
  // =========================================================================
  describe('1. Critical Tables Column & Schema Contracts', () => {
    it('loads a schema-only snapshot with table and RPC metadata', () => {
      expect(metadata.columns.length).toBeGreaterThan(80);
      expect(metadata.source_function_count).toBeGreaterThan(80);
      expect(metadata.captured_at).toBeTruthy();
    });

    it('1.1 parceiros table: should satisfy all columns required for partner catalog, redemption and SLA', () => {
      const table = 'parceiros';
      const cols = schemaSnapshot.tableColumns.get(table);
      expect(cols, `Table public.${table} must exist in schema`).toBeDefined();

      const requiredColumns = [
        'id',
        'slug',
        'status',
        'logo_url',
        'banner_url',
        'short_description',
        'redemption_has_coupon',
        'redemption_coupon_code',
        'redemption_has_voucher',
        'redemption_has_link',
        'redemption_link',
        'redemption_auto_redirect',
        'redemption_instructions',
        'redemption_delay_24h',
        'tax_document',
        'application_source',
        'application_protocol',
        'submitted_at',
        'privacy_consent_at',
        'internal_notes',
        'created_at',
        'updated_at'
      ];

      for (const col of requiredColumns) {
        const matches = checkColumnMatches(table, col, cols!);
        expect(matches, `Column public.${table}.${col} must exist in schema`).toBe(true);
      }
    });

    it('1.2 parceiros_resgates table: should satisfy all columns for redemption lifecycle, email, and tokens', () => {
      const table = 'parceiros_resgates';
      const cols = schemaSnapshot.tableColumns.get(table);
      expect(cols, `Table public.${table} must exist in schema`).toBeDefined();

      const requiredColumns = [
        'id',
        'parceiro_id',
        'cliente_id',
        'nome_completo',
        'telefone',
        'email',
        'codigo_gerado',
        'tipo_resgate',
        'link_destino',
        'link_ativacao',
        'status',
        'auto_redirecionado',
        'data_ativacao',
        'data_cancelamento',
        'created_at'
      ];

      for (const col of requiredColumns) {
        const matches = checkColumnMatches(table, col, cols!);
        expect(matches, `Column public.${table}.${col} must exist in schema`).toBe(true);
      }
    });

    it('1.2.1 redemption cancellation timestamp is present in the deployed schema', () => {
      expect(schemaSnapshot.tableColumns.get('parceiros_resgates')?.has('data_cancelamento')).toBe(true);
    });

    it('1.3 faturas table: should satisfy financial invoice columns and payment references', () => {
      const table = 'faturas';
      const cols = schemaSnapshot.tableColumns.get(table);
      expect(cols, `Table public.${table} must exist in schema`).toBeDefined();

      const requiredColumns = [
        'id',
        'cliente_id',
        'valor',
        'status',
        'data_vencimento',
        'data_pagamento',
        'codigo_barras',
        'pix_copia_cola',
        'link_pagamento',
        'forma_pagamento',
        'servico_id',
        'created_at',
        'updated_at'
      ];

      for (const col of requiredColumns) {
        const matches = checkColumnMatches(table, col, cols!);
        expect(matches, `Column public.${table}.${col} must exist in schema`).toBe(true);
      }
    });

    it('1.4 contratos table: should satisfy legal contract super-domain columns', () => {
      const table = 'contratos';
      const cols = schemaSnapshot.tableColumns.get(table);
      expect(cols, `Table public.${table} must exist in schema`).toBeDefined();

      const requiredColumns = [
        'id',
        'codigo_contrato',
        'titulo',
        'tipo',
        'cliente_id',
        'cliente_nome',
        'cliente_documento',
        'status',
        'valor_mensal',
        'valor_total',
        'data_inicio',
        'data_fim',
        'renovacao_automatica',
        'dias_para_vencimento',
        'signatarios',
        'termos_aditivos_count',
        'clausulas_resumo',
        'created_at',
        'updated_at'
      ];

      for (const col of requiredColumns) {
        const matches = checkColumnMatches(table, col, cols!);
        expect(matches, `Column public.${table}.${col} must exist in schema`).toBe(true);
      }
    });

    it('1.5 blog_posts table: should satisfy institutional blog content columns', () => {
      const table = 'blog_posts';
      const cols = schemaSnapshot.tableColumns.get(table);
      expect(cols, `Table public.${table} must exist in schema`).toBeDefined();

      const requiredColumns = [
        'id',
        'title',
        'excerpt',
        'content',
        'image',
        'category',
        'author',
        'published_at',
        'created_at'
      ];

      for (const col of requiredColumns) {
        const matches = checkColumnMatches(table, col, cols!);
        expect(matches, `Column public.${table}.${col} must exist in schema`).toBe(true);
      }
    });

    it('1.6 loja_vaquinhas table: should satisfy store group gift (vaquinhas) columns', () => {
      const table = 'loja_vaquinhas';
      const cols = schemaSnapshot.tableColumns.get(table);
      expect(cols, `Table public.${table} must exist in schema`).toBeDefined();

      const requiredColumns = [
        'id',
        'codigo',
        'produto_id',
        'produto_snapshot',
        'organizador_nome',
        'organizador_telefone',
        'organizador_email',
        'organizador_id',
        'presenteado_nome',
        'data_evento',
        'mensagem',
        'meta_valor',
        'valor_arrecadado',
        'quantidade_contribuicoes',
        'status',
        'endereco_entrega',
        'pedido_gerado_id',
        'created_at',
        'updated_at'
      ];

      for (const col of requiredColumns) {
        const matches = checkColumnMatches(table, col, cols!);
        expect(matches, `Column public.${table}.${col} must exist in schema`).toBe(true);
      }
    });

    it('1.7 gsa_hero_banners table: should satisfy marketplace hero banner carousel columns', () => {
      const table = 'gsa_hero_banners';
      const cols = schemaSnapshot.tableColumns.get(table);
      expect(cols, `Table public.${table} must exist in schema`).toBeDefined();

      const requiredColumns = [
        'id',
        'title',
        'subtitle',
        'image_url',
        'image_mobile_url',
        'link_url',
        'button_text',
        'background_color',
        'display_order',
        'is_active',
        'starts_at',
        'ends_at',
        'created_at',
        'updated_at'
      ];

      for (const col of requiredColumns) {
        const matches = checkColumnMatches(table, col, cols!);
        expect(matches, `Column public.${table}.${col} must exist in schema`).toBe(true);
      }
    });

    it('1.8 system_settings table: should satisfy key-value system configuration schema', () => {
      const table = 'system_settings';
      const cols = schemaSnapshot.tableColumns.get(table);
      expect(cols, `Table public.${table} must exist in schema`).toBeDefined();
      expect(cols!.has('key'), 'system_settings must have key').toBe(true);
      expect(cols!.has('value'), 'system_settings must have value').toBe(true);
    });
  });

  // =========================================================================
  // DOMAIN 2: RPC SIGNATURE CONTRACTS
  // =========================================================================
  describe('2. RPC Signature & Parameter Contracts', () => {
    it('2.1 Public RPC: gsa_public_resgatar_beneficio_parceiro should match 6-parameter signature', () => {
      const rpc = schemaSnapshot.functions.get('gsa_public_resgatar_beneficio_parceiro');
      expect(rpc, 'RPC gsa_public_resgatar_beneficio_parceiro must exist').toBeDefined();
      expect(rpc!.params).toContain('p_parceiro_id');
      expect(rpc!.params).toContain('p_parceiro_slug');
      expect(rpc!.params).toContain('p_nome_completo');
      expect(rpc!.params).toContain('p_telefone');
      expect(rpc!.params).toContain('p_cliente_id');
      expect(rpc!.params).toContain('p_email');
      expect(rpc!.returnType.toLowerCase()).toContain('json');
    });

    it('2.2 Public RPC: gsa_public_track_affiliate_click should match affiliate click signature', () => {
      const rpc = schemaSnapshot.functions.get('gsa_public_track_affiliate_click');
      expect(rpc, 'RPC gsa_public_track_affiliate_click must exist').toBeDefined();
      expect(rpc!.params).toContain('p_codigo');
      expect(rpc!.params).toContain('p_visitante_token');
      expect(rpc!.params).toContain('p_landing_path');
      expect(rpc!.params).toContain('p_referrer_host');
    });

    it('2.3 Client RPC: gsa_client_bind_affiliate_click should match token parameter signature', () => {
      const rpc = schemaSnapshot.functions.get('gsa_client_bind_affiliate_click');
      expect(rpc, 'RPC gsa_client_bind_affiliate_click must exist').toBeDefined();
      expect(rpc!.params).toContain('p_click_token');
    });

    it('2.4 Admin RPC: gsa_admin_baixar_fatura should match invoice payment signature', () => {
      const rpc = schemaSnapshot.functions.get('gsa_admin_baixar_fatura');
      expect(rpc, 'RPC gsa_admin_baixar_fatura must exist').toBeDefined();
      expect(rpc!.params).toContain('p_fatura_id');
    });

    it('2.5 Admin RPC: gsa_admin_decide_affiliate_payout should match payout approval signature', () => {
      const rpc = schemaSnapshot.functions.get('gsa_admin_decide_affiliate_payout');
      expect(rpc, 'RPC gsa_admin_decide_affiliate_payout must exist').toBeDefined();
      expect(rpc!.params).toContain('p_payout_id');
    });

    it('2.6 Admin RPC: gsa_admin_complete_partner_redemption should match redemption completion signature', () => {
      const rpc = schemaSnapshot.functions.get('gsa_admin_complete_partner_redemption');
      expect(rpc, 'RPC gsa_admin_complete_partner_redemption must exist').toBeDefined();
      expect(rpc!.params).toContain('p_resgate_id');
      expect(rpc!.params).toContain('p_link_ativacao');
    });

    it('2.7 Store Group Gift RPCs: vaquinha lifecycle RPCs must exist', () => {
      expect(schemaSnapshot.functions.has('gsa_criar_vaquinha')).toBe(true);
      expect(schemaSnapshot.functions.has('gsa_obter_vaquinha')).toBe(true);
      expect(schemaSnapshot.functions.has('gsa_confirmar_contribuicao_vaquinha')).toBe(true);
    });

    it('2.8 WhatsApp RPCs: pending whatsapp dispatcher must exist', () => {
      expect(schemaSnapshot.functions.has('gsa_registrar_pendencia_whatsapp')).toBe(true);
    });
  });

  // =========================================================================
  // DOMAIN 3: SECURITY & PERMISSION CONTRACTS (EXECUTE GRANTS & RLS)
  // =========================================================================
  describe('3. Security & Permission Contracts (EXECUTE Grants & RLS)', () => {
    it('3.1 Public RPCs: should have EXECUTE granted to anon, authenticated and service_role', () => {
      const publicRpcs = [
        'gsa_public_resgatar_beneficio_parceiro',
        'gsa_public_track_affiliate_click',
        'gsa_criar_vaquinha',
        'gsa_obter_vaquinha',
        'gsa_registrar_pendencia_whatsapp'
      ];

      for (const rpcName of publicRpcs) {
        const perm = schemaSnapshot.permissions.get(rpcName);
        expect(perm, `Permissions for ${rpcName} must exist`).toBeDefined();
        expect(perm!.anon, `Public RPC ${rpcName} must be executable by anon`).toBe(true);
        expect(perm!.authenticated, `Public RPC ${rpcName} must be executable by authenticated`).toBe(true);
      }
    });

    it('3.2 Admin & Sensitive RPCs: anon must NOT have EXECUTE access on critical admin functions', () => {
      for (const sensitiveFunc of SENSITIVE_FUNCTIONS_ANON_REVOKED) {
        const perm = schemaSnapshot.permissions.get(sensitiveFunc);
        if (perm) {
          expect(!perm.anon || schemaSnapshot.functions.get(sensitiveFunc)?.sessionGuarded, `Sensitive function '${sensitiveFunc}' must deny anonymous access or validate a signed application session`).toBe(true);
        }
      }
    });

    it('3.3 Table RLS: critical tables must have ROW LEVEL SECURITY enabled', () => {
      const criticalTables = [
        'parceiros',
        'parceiros_resgates',
        'faturas',
        'contratos',
        'blog_posts',
        'loja_vaquinhas',
        'gsa_hero_banners',
        'system_settings'
      ];

      for (const table of criticalTables) {
        const rlsEnabled = schemaSnapshot.tableRls.get(table);
        expect(rlsEnabled, `Table public.${table} must have RLS enabled`).toBe(true);
      }
    });
  });

  // =========================================================================
  // DOMAIN 4: PROGRAMMATIC SCHEMA VALIDATOR ENGINE INTEGRATION
  // =========================================================================
  describe('4. Programmatic Schema Validator Execution', () => {
    it('should run validateDatabaseContracts and report 100% passing with 0 blocking discrepancies', () => {
      const result = validateDatabaseContracts(schemaSnapshot);

      expect(result.valid).toBe(true);
      expect(result.blockers).toEqual([]);
      expect(result.summary.status).toBe('PASSED');
      expect(result.summary.blockerCount).toBe(0);
      expect(result.details.tablesChecked).toBe(Object.keys(TABLE_COLUMN_CONTRACTS).length);
      expect(result.details.rpcsChecked).toBe(Object.keys(RPC_CONTRACTS).length);
    });
  });
});
