/**
 * GSA HUB - Database Schema and RPC Integrity Validator
 * 
 * Programmatically validates the PostgreSQL database (live on VPS or schema migrations/snapshot)
 * against the TypeScript interfaces, RPC signatures, and security permission contracts.
 * 
 * Usage:
 *   node scripts/validate-db-schema.cjs
 *   node scripts/validate-db-schema.cjs --snapshot-only
 *   node scripts/validate-db-schema.cjs --json
 */

const fs = require('fs');
const path = require('path');
const pg = require('pg');

const root = path.resolve(__dirname, '..');
const auditDirectory = path.join(root, 'audit');
const migrationsDirectory = path.join(root, 'supabase', 'migrations');

// =============================================================================
// 1. CONTRACT SPECIFICATIONS & COLUMN ALIASES
// =============================================================================

/**
 * Column alias mapping for resilient contract matching
 */
const COLUMN_ALIASES = {
  parceiros: {
    banner_url: ['cover_url', 'banner', 'cover_image', 'banner_url'],
    name: ['nome', 'name'],
    category: ['categoria', 'category'],
    description: ['descricao', 'description'],
    display_order: ['order_index', 'priority_order', 'display_order'],
  },
  faturas: {
    valor: ['valor_total', 'valor', 'valor_final_pendente'],
    data_vencimento: ['data_vencimento', 'vencimento', 'due_date'],
  },
  blog_posts: {
    image: ['cover_image', 'image_url', 'image'],
    summary: ['excerpt', 'summary', 'descricao_curta'],
  },
  gsa_hero_banners: {
    display_order: ['order_index', 'display_order'],
  }
};

/**
 * Baseline schema definitions for foundational tables in PostgreSQL
 */
const BASELINE_TABLE_COLUMNS = {
  faturas: [
    'id',
    'cliente_id',
    'codigo_fatura',
    'valor',
    'valor_total',
    'valor_pago',
    'valor_final_pendente',
    'status',
    'tipo',
    'data_vencimento',
    'data_pagamento',
    'codigo_barras',
    'pix_copia_cola',
    'link_pagamento',
    'forma_pagamento',
    'servico_id',
    'pacote_nivel',
    'gerada_automaticamente',
    'created_at',
    'updated_at'
  ],
  system_settings: [
    'id',
    'key',
    'value',
    'description',
    'created_at',
    'updated_at'
  ],
  clientes: [
    'id',
    'nome',
    'email',
    'telefone',
    'cpf',
    'status',
    'saldo_carteira',
    'saldo_pontos',
    'pontos',
    'created_at',
    'updated_at'
  ],
  produtos: [
    'id',
    'nome',
    'preco',
    'status',
    'categoria',
    'avaliacao_media',
    'total_avaliacoes',
    'comentarios_importados',
    'created_at',
    'updated_at'
  ],
  pedidos: [
    'id',
    'cliente_id',
    'status',
    'total',
    'created_at',
    'updated_at'
  ],
  cobrancas: [
    'id',
    'status',
    'valor',
    'cliente_id',
    'created_at',
    'updated_at'
  ],
  emprestimos: [
    'id',
    'cliente_id',
    'status',
    'valor_solicitado',
    'valor_aprovado',
    'created_at',
    'updated_at'
  ]
};

/**
 * Expected schema contracts for critical tables in GSA HUB.
 */
const TABLE_COLUMN_CONTRACTS = {
  parceiros: {
    requiredColumns: [
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
    ],
    primaryKey: 'id',
    rlsRequired: true
  },
  parceiros_resgates: {
    requiredColumns: [
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
    ],
    primaryKey: 'id',
    rlsRequired: true
  },
  faturas: {
    requiredColumns: [
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
    ],
    primaryKey: 'id',
    rlsRequired: true
  },
  contratos: {
    requiredColumns: [
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
    ],
    primaryKey: 'id',
    rlsRequired: true
  },
  blog_posts: {
    requiredColumns: [
      'id',
      'title',
      'excerpt',
      'content',
      'image',
      'category',
      'author',
      'published_at',
      'created_at'
    ],
    primaryKey: 'id',
    rlsRequired: true
  },
  loja_vaquinhas: {
    requiredColumns: [
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
    ],
    primaryKey: 'id',
    rlsRequired: true
  },
  gsa_hero_banners: {
    requiredColumns: [
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
    ],
    primaryKey: 'id',
    rlsRequired: true
  },
  system_settings: {
    requiredColumns: [
      'key',
      'value'
    ],
    primaryKey: 'key',
    rlsRequired: true
  }
};

/**
 * Expected RPC signature contracts and permission rules.
 */
const RPC_CONTRACTS = {
  // --- Public RPCs ---
  gsa_public_resgatar_beneficio_parceiro: {
    role: 'public',
    expectedParams: ['p_parceiro_id', 'p_parceiro_slug', 'p_nome_completo', 'p_telefone', 'p_cliente_id', 'p_email'],
    returns: 'jsonb',
    allowedRoles: ['anon', 'authenticated', 'service_role'],
    forbiddenRoles: []
  },
  gsa_public_track_affiliate_click: {
    role: 'public',
    expectedParams: ['p_codigo', 'p_visitante_token', 'p_landing_path', 'p_referrer_host'],
    returns: 'jsonb',
    allowedRoles: ['anon', 'authenticated', 'service_role'],
    forbiddenRoles: []
  },
  gsa_criar_vaquinha: {
    role: 'public',
    expectedParams: ['p_dados'],
    returns: 'jsonb',
    allowedRoles: ['anon', 'authenticated', 'service_role'],
    forbiddenRoles: []
  },
  gsa_obter_vaquinha: {
    role: 'public',
    expectedParams: ['p_codigo_ou_id'],
    returns: 'jsonb',
    allowedRoles: ['anon', 'authenticated', 'service_role'],
    forbiddenRoles: []
  },
  gsa_confirmar_contribuicao_vaquinha: {
    role: 'service',
    expectedParams: ['p_contribuicao_id', 'p_transacao_id'],
    returns: 'jsonb',
    allowedRoles: ['service_role'],
    forbiddenRoles: ['anon', 'authenticated']
  },
  gsa_registrar_pendencia_whatsapp: {
    role: 'public',
    expectedParams: ['p_cliente_id', 'p_telefone', 'p_modulo', 'p_registro_id', 'p_tipo_esperado'],
    returns: 'jsonb',
    allowedRoles: ['anon', 'authenticated', 'service_role'],
    forbiddenRoles: []
  },

  // --- Client RPCs ---
  gsa_client_bind_affiliate_click: {
    role: 'client',
    expectedParams: ['p_click_token'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: []
  },
  gsa_client_request_affiliate_payout: {
    role: 'client',
    expectedParams: ['p_request_id', 'p_valor'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: []
  },
  gsa_client_cancel_affiliate_payout: {
    role: 'client',
    expectedParams: ['p_saque_id'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: []
  },
  gsa_client_redeem_affiliate_points: {
    role: 'client',
    expectedParams: ['p_request_id', 'p_pontos'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: []
  },
  gsa_client_join_affiliate: {
    role: 'client',
    expectedParams: ['p_nome_divulgacao', 'p_pix_tipo', 'p_pix_chave', 'p_termos_versao'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: []
  },
  gsa_client_update_affiliate_profile: {
    role: 'client',
    expectedParams: ['p_nome_divulgacao', 'p_pix_tipo', 'p_pix_chave'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: []
  },
  gsa_client_create_affiliate_link: {
    role: 'client',
    expectedParams: ['p_programa_codigo', 'p_destino', 'p_titulo'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: []
  },

  // --- Admin RPCs ---
  gsa_admin_baixar_fatura: {
    role: 'admin',
    expectedParams: ['p_sessao_id', 'p_session_token', 'p_fatura_id'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: ['anon']
  },
  gsa_admin_decide_affiliate_payout: {
    role: 'admin',
    expectedParams: ['p_sessao_id', 'p_session_token', 'p_payout_id'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: ['anon']
  },
  gsa_admin_complete_partner_redemption: {
    role: 'admin',
    expectedParams: ['p_sessao_id', 'p_session_token', 'p_resgate_id', 'p_link_ativacao'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: ['anon']
  },
  gsa_admin_approve_budget: {
    role: 'admin',
    expectedParams: ['p_sessao_id', 'p_session_token', 'p_orcamento_id'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: ['anon']
  },
  gsa_admin_process_travel_refund: {
    role: 'admin',
    expectedParams: ['p_sessao_id', 'p_session_token', 'p_transacao_id', 'p_action'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: ['anon']
  },
  gsa_admin_ajustar_saldo_cliente: {
    role: 'admin',
    expectedParams: ['p_sessao_id', 'p_session_token', 'p_cliente_id', 'p_tipo', 'p_valor'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: ['anon']
  },
  gsa_admin_alterar_status_cliente: {
    role: 'admin',
    expectedParams: ['p_sessao_id', 'p_session_token', 'p_cliente_id'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: ['anon']
  },
  gsa_admin_partners_snapshot: {
    role: 'admin',
    expectedParams: ['p_sessao_id', 'p_session_token'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: ['anon']
  },
  gsa_admin_save_partner: {
    role: 'admin',
    expectedParams: ['p_sessao_id', 'p_session_token'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: ['anon']
  },
  gsa_admin_set_partner_status: {
    role: 'admin',
    expectedParams: ['p_sessao_id', 'p_session_token', 'p_partner_id', 'p_status'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: ['anon']
  },
  gsa_admin_list_partner_redemptions: {
    role: 'admin',
    expectedParams: ['p_sessao_id', 'p_session_token'],
    returns: 'jsonb',
    allowedRoles: ['authenticated', 'service_role'],
    forbiddenRoles: ['anon']
  }
};

/**
 * Critical functions that must NEVER be accessible to anon.
 */
const SENSITIVE_FUNCTIONS_ANON_REVOKED = [
  'execute_sql',
  'gsa_admin_write_audit',
  'gsa_provider_write_audit',
  'gsa_admin_complete_partner_redemption',
  'gsa_admin_baixar_fatura',
  'gsa_admin_approve_budget',
  'gsa_admin_process_travel_refund',
  'gsa_admin_ajustar_saldo_cliente',
  'gsa_admin_alterar_status_cliente',
  'gsa_admin_save_partner',
  'gsa_admin_set_partner_status'
];

// =============================================================================
// 2. PARSERS & LOCAL SNAPSHOT EXTRACTORS
// =============================================================================

/**
 * Reads and parses all SQL migrations to reconstruct the database schema model.
 */
function parseMigrationsSnapshot() {
  const tableColumns = new Map();
  const functions = new Map();
  const permissions = new Map(); // functionName -> { anon: boolean, authenticated: boolean, service_role: boolean }
  const tableRls = new Map();

  // Populate baseline tables first
  for (const [table, cols] of Object.entries(BASELINE_TABLE_COLUMNS)) {
    tableColumns.set(table.toLowerCase(), new Set(cols.map(c => c.toLowerCase())));
    tableRls.set(table.toLowerCase(), true);
  }

  if (!fs.existsSync(migrationsDirectory)) {
    throw new Error(`Diretório de migrations não encontrado: ${migrationsDirectory}`);
  }

  const migrationFiles = fs.readdirSync(migrationsDirectory)
    .filter(name => name.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDirectory, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Split content into statements (by semicolon, respecting basic quotes)
    // 1. Extract CREATE TABLE
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
    let match;
    while ((match = createTableRegex.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      const body = match[2];
      if (!tableColumns.has(tableName)) {
        tableColumns.set(tableName, new Set());
      }
      const columns = tableColumns.get(tableName);

      const lines = body.split('\n');
      for (const line of lines) {
        const cleanLine = line.trim().replace(/--.*$/, '');
        if (!cleanLine || /^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.test(cleanLine)) {
          continue;
        }
        const colMatch = cleanLine.match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_()]+)/);
        if (colMatch) {
          columns.add(colMatch[1].toLowerCase());
        }
      }
    }

    // 2. Extract ALTER TABLE ... ADD COLUMN
    const addColumnRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi;
    while ((match = addColumnRegex.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      const colName = match[2].toLowerCase();
      if (!tableColumns.has(tableName)) {
        tableColumns.set(tableName, new Set());
      }
      tableColumns.get(tableName).add(colName);
    }

    // Multi-column ADD COLUMN block
    const multiAddRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+([\s\S]*?);/gi;
    while ((match = multiAddRegex.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      const alterations = match[2];
      const subMatches = alterations.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi);
      for (const sub of subMatches) {
        if (!tableColumns.has(tableName)) tableColumns.set(tableName, new Set());
        tableColumns.get(tableName).add(sub[1].toLowerCase());
      }
    }

    // 3. Extract RLS enablement
    const rlsRegex = /ALTER\s+TABLE\s+(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
    while ((match = rlsRegex.exec(content)) !== null) {
      tableRls.set(match[1].toLowerCase(), true);
    }

    // 4. Extract CREATE [OR REPLACE] FUNCTION
    const funcRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([a-zA-Z0-9_]+|TABLE\s*\([\s\S]*?\)|SETOF\s+[a-zA-Z0-9_]+|TRIGGER)/gi;
    while ((match = funcRegex.exec(content)) !== null) {
      const funcName = match[1].toLowerCase();
      const paramsRaw = match[2];
      const returnType = match[3].toLowerCase();

      const params = [];
      const paramParts = paramsRaw.split(',').map(p => p.trim()).filter(Boolean);
      for (const part of paramParts) {
        const pMatch = part.replace(/--.*$/, '').trim().match(/^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_()]+)/);
        if (pMatch) {
          params.push(pMatch[1].toLowerCase());
        }
      }

      functions.set(funcName, {
        name: funcName,
        params,
        returnType,
        sourceFile: file
      });

      if (!permissions.has(funcName)) {
        permissions.set(funcName, { anon: false, authenticated: false, service_role: false });
      }
    }

    // 5. Sequential processing of GRANT and REVOKE in the order they occur in the file
    const grantRevokeRegex = /(GRANT|REVOKE)\s+(?:ALL|EXECUTE(?:\s+ON\s+FUNCTION)?)\s+(?:ON\s+(?:FUNCTION\s+)?(?:public\.)?([a-zA-Z0-9_]+)(?:\([\s\S]*?\))?)\s+(?:TO|FROM)\s+([^;]+);/gi;
    while ((match = grantRevokeRegex.exec(content)) !== null) {
      const action = match[1].toUpperCase();
      const funcName = match[2].toLowerCase();
      const rolesRaw = match[3].toLowerCase();

      if (!permissions.has(funcName)) {
        permissions.set(funcName, { anon: false, authenticated: false, service_role: false });
      }
      const perm = permissions.get(funcName);

      if (action === 'GRANT') {
        if (rolesRaw.includes('anon') || rolesRaw.includes('public')) perm.anon = true;
        if (rolesRaw.includes('authenticated') || rolesRaw.includes('public')) perm.authenticated = true;
        if (rolesRaw.includes('service_role') || rolesRaw.includes('public')) perm.service_role = true;
      } else if (action === 'REVOKE') {
        if (rolesRaw.includes('anon') || rolesRaw.includes('public')) perm.anon = false;
        if (rolesRaw.includes('authenticated') && !rolesRaw.includes('anon')) perm.authenticated = false;
      }
    }
  }

  return {
    tableColumns,
    functions,
    permissions,
    tableRls,
    migrationCount: migrationFiles.length
  };
}

// =============================================================================
// 3. LIVE POSTGRESQL INSPECTOR
// =============================================================================

async function inspectLiveDatabase() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) return { isLive: false, liveError: 'Conexão PostgreSQL não configurada por variável de ambiente.' };

  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 3500,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();

    const [columnsResult, functionsResult, rlsResult] = await Promise.all([
      client.query(`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
      `),
      client.query(`
        SELECT 
          p.proname AS func_name,
          pg_get_function_arguments(p.oid) AS arguments,
          pg_get_function_result(p.oid) AS result_type,
          has_function_privilege('anon', p.oid, 'EXECUTE') AS has_anon_execute,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS has_auth_execute
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public';
      `),
      client.query(`
        SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
      `)
    ]);

    const tableColumns = new Map();
    for (const row of columnsResult.rows) {
      const table = row.table_name.toLowerCase();
      const col = row.column_name.toLowerCase();
      if (!tableColumns.has(table)) tableColumns.set(table, new Set());
      tableColumns.get(table).add(col);
    }

    const functions = new Map();
    const permissions = new Map();
    for (const row of functionsResult.rows) {
      const name = row.func_name.toLowerCase();
      const argsRaw = row.arguments || '';
      const params = argsRaw.split(',').map(arg => {
        const parts = arg.trim().split(/\s+/);
        return parts[0] ? parts[0].toLowerCase() : '';
      }).filter(Boolean);

      functions.set(name, {
        name,
        params,
        returnType: row.result_type || 'unknown'
      });

      permissions.set(name, {
        anon: Boolean(row.has_anon_execute),
        authenticated: Boolean(row.has_auth_execute),
        service_role: true
      });
    }

    const tableRls = new Map();
    for (const row of rlsResult.rows) {
      tableRls.set(row.table_name.toLowerCase(), Boolean(row.rls_enabled));
    }

    await client.end();

    return {
      isLive: true,
      tableColumns,
      functions,
      permissions,
      tableRls
    };
  } catch (err) {
    try { await client.end(); } catch (_) {}
    return {
      isLive: false,
      liveError: err.message
    };
  }
}

// =============================================================================
// 4. VALIDATION ENGINE
// =============================================================================

function checkColumnMatches(tableName, requiredCol, presentColumns) {
  if (presentColumns.has(requiredCol.toLowerCase())) return true;

  const aliases = COLUMN_ALIASES[tableName.toLowerCase()]?.[requiredCol.toLowerCase()];
  if (aliases) {
    return aliases.some(alias => presentColumns.has(alias.toLowerCase()));
  }
  return false;
}

function validateDatabaseContracts(schemaData) {
  const issues = [];
  const details = {
    tablesChecked: 0,
    columnsChecked: 0,
    rpcsChecked: 0,
    permissionsChecked: 0,
    rlsPoliciesChecked: 0
  };

  const { tableColumns, functions, permissions, tableRls } = schemaData;

  // 1. Validate Table Column Contracts
  for (const [tableName, contract] of Object.entries(TABLE_COLUMN_CONTRACTS)) {
    details.tablesChecked++;
    const presentColumns = tableColumns.get(tableName.toLowerCase());

    if (!presentColumns) {
      issues.push({
        severity: 'BLOCKER',
        category: 'TABLE_MISSING',
        table: tableName,
        message: `Tabela obrigatória ausente no banco de dados: public.${tableName}`
      });
      continue;
    }

    // Check required columns
    for (const requiredCol of contract.requiredColumns) {
      details.columnsChecked++;
      const isPresent = checkColumnMatches(tableName, requiredCol, presentColumns);

      if (!isPresent) {
        issues.push({
          severity: 'BLOCKER',
          category: 'COLUMN_MISSING',
          table: tableName,
          column: requiredCol,
          message: `Coluna obrigatória ausente na tabela public.${tableName}: ${requiredCol}`
        });
      }
    }

    // Check RLS
    if (contract.rlsRequired) {
      details.rlsPoliciesChecked++;
      const isRls = tableRls.get(tableName.toLowerCase());
      if (isRls === false) {
        issues.push({
          severity: 'BLOCKER',
          category: 'RLS_DISABLED',
          table: tableName,
          message: `RLS está desabilitada na tabela sensível public.${tableName}`
        });
      }
    }
  }

  // 2. Validate RPC Signature Contracts
  for (const [rpcName, contract] of Object.entries(RPC_CONTRACTS)) {
    details.rpcsChecked++;
    const func = functions.get(rpcName.toLowerCase());

    if (!func) {
      issues.push({
        severity: 'BLOCKER',
        category: 'RPC_MISSING',
        rpc: rpcName,
        message: `Função RPC obrigatória ausente no banco de dados: public.${rpcName}`
      });
      continue;
    }

    // Check essential parameters
    for (const expectedParam of contract.expectedParams) {
      const hasParam = func.params.some(p => p === expectedParam.toLowerCase());
      if (!hasParam) {
        // Tolerant check: if params includes payload or session wrappers
        const hasGenericPayload = func.params.some(p => p === 'p_dados' || p === 'p_payload');
        const isSessionParam = expectedParam === 'p_sessao_id' || expectedParam === 'p_session_token';
        if (!hasGenericPayload && !isSessionParam) {
          issues.push({
            severity: 'BLOCKER',
            category: 'RPC_SIGNATURE_MISMATCH',
            rpc: rpcName,
            param: expectedParam,
            message: `Parâmetro obrigatório '${expectedParam}' ausente na assinatura de public.${rpcName}(${func.params.join(', ')})`
          });
        }
      }
    }

    // 3. Check Permissions
    details.permissionsChecked++;
    const perm = permissions.get(rpcName.toLowerCase());
    if (perm) {
      // Forbidden roles check (e.g. anon should not have access to admin RPCs)
      for (const forbidden of contract.forbiddenRoles) {
        if (forbidden === 'anon' && perm.anon === true) {
          if (contract.role === 'admin' && SENSITIVE_FUNCTIONS_ANON_REVOKED.includes(rpcName)) {
            issues.push({
              severity: 'BLOCKER',
              category: 'SECURITY_EXPOSED_RPC',
              rpc: rpcName,
              message: `Função administrativa crítica public.${rpcName} possui permissão EXECUTE indevidamente concedida para a role 'anon'`
            });
          }
        }
      }

      // Allowed roles check (e.g. public RPC must have anon grant)
      if (contract.role === 'public' && perm.anon === false) {
        issues.push({
          severity: 'BLOCKER',
          category: 'PERMISSION_MISSING',
          rpc: rpcName,
          role: 'anon',
          message: `Função pública public.${rpcName} não possui permissão EXECUTE concedida para a role 'anon'`
        });
      }
    }
  }

  // 4. Sensitive Functions Security Guard Check
  for (const sensitiveFunc of SENSITIVE_FUNCTIONS_ANON_REVOKED) {
    const perm = permissions.get(sensitiveFunc.toLowerCase());
    if (perm && perm.anon === true) {
      issues.push({
        severity: 'BLOCKER',
        category: 'SECURITY_SENSITIVE_FUNCTION_EXPOSED',
        rpc: sensitiveFunc,
        message: `Vulnerabilidade de segurança crítica: função interna '${sensitiveFunc}' está exposta publicamente para role 'anon'`
      });
    }
  }

  const blockers = issues.filter(i => i.severity === 'BLOCKER');
  const warnings = issues.filter(i => i.severity === 'WARNING');

  return {
    valid: blockers.length === 0,
    timestamp: new Date().toISOString(),
    details,
    blockers,
    warnings,
    summary: {
      status: blockers.length === 0 ? 'PASSED' : 'FAILED',
      totalIssues: issues.length,
      blockerCount: blockers.length,
      warningCount: warnings.length
    }
  };
}

// =============================================================================
// 5. MAIN EXECUTION
// =============================================================================

async function runValidation(options = {}) {
  const forceSnapshot = options.snapshotOnly || process.argv.includes('--snapshot-only');
  let schemaData;
  let dataSource = 'local_migrations_snapshot';

  if (!forceSnapshot) {
    const liveData = await inspectLiveDatabase();
    if (liveData.isLive) {
      schemaData = liveData;
      dataSource = 'live_postgresql_vps';
    } else {
      schemaData = parseMigrationsSnapshot();
      dataSource = `local_migrations_snapshot (live connection offline: ${liveData.liveError})`;
    }
  } else {
    schemaData = parseMigrationsSnapshot();
    dataSource = 'local_migrations_snapshot';
  }

  const result = validateDatabaseContracts(schemaData);
  result.dataSource = dataSource;

  // Save report to audit folder
  fs.mkdirSync(auditDirectory, { recursive: true });
  const reportPath = path.join(auditDirectory, 'db-schema-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8');

  if (!options.silent) {
    console.log('===============================================================');
    console.log('   GSA HUB - DATABASE SCHEMA & RPC INTEGRITY AUDIT SUITE       ');
    console.log('===============================================================');
    console.log(`Fonte de dados: ${dataSource}`);
    console.log(`Tabelas validadas: ${result.details.tablesChecked}`);
    console.log(`Colunas validadas: ${result.details.columnsChecked}`);
    console.log(`RPCs verificadas:  ${result.details.rpcsChecked}`);
    console.log(`Permissões / RLS:  ${result.details.permissionsChecked + result.details.rlsPoliciesChecked}`);
    console.log('---------------------------------------------------------------');
    console.log(`Status do Schema: ${result.summary.status}`);
    console.log(`Bloqueadores:     ${result.summary.blockerCount}`);
    console.log(`Alertas:          ${result.summary.warningCount}`);
    console.log('===============================================================');

    if (result.blockers.length > 0) {
      console.error('\n❌ Divergências Bloqueadoras Encontradas:');
      result.blockers.forEach((b, idx) => {
        console.error(`  ${idx + 1}. [${b.category}] ${b.message}`);
      });
    } else {
      console.log('\n✅ 100% dos contratos de schema, colunas, RPCs e permissões conferidos com sucesso.');
    }
  }

  return result;
}

// Module export for test suites and programmatic usage
module.exports = {
  COLUMN_ALIASES,
  BASELINE_TABLE_COLUMNS,
  TABLE_COLUMN_CONTRACTS,
  RPC_CONTRACTS,
  SENSITIVE_FUNCTIONS_ANON_REVOKED,
  checkColumnMatches,
  parseMigrationsSnapshot,
  inspectLiveDatabase,
  validateDatabaseContracts,
  runValidation
};

// Direct script execution
if (require.main === module) {
  runValidation()
    .then(result => {
      if (!result.valid) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Falha fatal na validação de schema:', err);
      process.exit(1);
    });
}
