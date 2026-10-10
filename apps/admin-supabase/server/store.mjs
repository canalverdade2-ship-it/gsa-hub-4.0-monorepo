import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './domain.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = resolve(process.env.GSA_DATA_DIR || resolve(root, 'data'));
mkdirSync(resolve(dataDir, 'uploads'), { recursive: true });

export const db = new DatabaseSync(resolve(dataDir, 'gsa3.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS records (id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(kind, id));
  CREATE INDEX IF NOT EXISTS records_kind ON records(kind);
  CREATE TABLE IF NOT EXISTS counters (kind TEXT PRIMARY KEY, value INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, clientId TEXT, active INTEGER DEFAULT 1);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY);
`);

// Older deployments used a global primary key for records. That lets a folder
// or another resource overwrite a client that happens to receive the same id.
// Migrate those databases to the correct per-resource key before any reads.
const recordsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='records'").get()?.sql || '';
if (!/PRIMARY KEY\s*\(\s*kind\s*,\s*id\s*\)/i.test(recordsSchema)) {
  db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE records_v2 (id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(kind, id));
    INSERT INTO records_v2(id, kind, payload) SELECT id, kind, payload FROM records;
    DROP TABLE records;
    ALTER TABLE records_v2 RENAME TO records;
    CREATE INDEX records_kind ON records(kind);
    COMMIT;
  `);
}

// Administrative identities keep their business role and module grants beside
// the authentication role.  The ALTER statements make the permission model
// safe to introduce on an existing production SQLite database.
const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
if (!userColumns.has('adminRole')) db.exec("ALTER TABLE users ADD COLUMN adminRole TEXT NOT NULL DEFAULT 'Administrador Geral'");
if (!userColumns.has('permissions')) db.exec("ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '[\"*\"]'");
db.prepare("UPDATE users SET adminRole='Cliente', permissions='[]' WHERE role='client' AND (adminRole IS NULL OR adminRole='Administrador Geral')").run();
db.prepare("UPDATE users SET adminRole='Administrador Geral', permissions='[\"*\"]' WHERE role='admin' AND (permissions IS NULL OR trim(permissions)='' OR permissions='[]')").run();

export const ADMIN_MODULES = Object.freeze([
  'dashboard', 'clients', 'proposals', 'contracts', 'orders', 'tasks',
  'calendar', 'finance', 'documents', 'coupons', 'support', 'reports',
  'catalogs', 'settings', 'notices'
]);

export const ADMIN_ROLE_TEMPLATES = Object.freeze({
  'Administrador Geral': ['*'],
  'Gestor Operacional': ['dashboard', 'clients', 'proposals', 'contracts', 'orders', 'tasks', 'calendar', 'documents', 'reports', 'notices'],
  'Operador / RPS': ['dashboard', 'orders', 'tasks', 'calendar', 'documents', 'notices'],
  'Financeiro': ['dashboard', 'clients', 'finance', 'coupons', 'reports', 'notices'],
  'Atendimento': ['dashboard', 'clients', 'documents', 'support', 'notices'],
  'Comercial': ['dashboard', 'clients', 'proposals', 'contracts', 'reports', 'notices'],
  Personalizado: []
});

export function normalizeAdminPermissions(value, role = 'admin') {
  if (role !== 'admin') return [];
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = []; }
  }
  if (!Array.isArray(parsed)) parsed = [];
  const normalized = [...new Set(parsed.map((item) => String(item)).filter(Boolean))];
  if (normalized.includes('*')) return ['*'];
  const filtered = normalized.filter((item) => ADMIN_MODULES.includes(item));
  return filtered.includes('dashboard') ? filtered : ['dashboard', ...filtered];
}

export function hasAdminPermission(user, module) {
  return user?.role === 'admin' && normalizeAdminPermissions(user.permissions, user.role).some((item) => item === '*' || item === module);
}

export function permissionsForAdminRole(role, requested) {
  const name = String(role || 'Personalizado').trim();
  const template = name === 'Personalizado'
    ? requested
    : Object.prototype.hasOwnProperty.call(ADMIN_ROLE_TEMPLATES, name)
    ? ADMIN_ROLE_TEMPLATES[name]
    : requested;
  return normalizeAdminPermissions(template, 'admin');
}

export function publicUser(user) {
  if (!user) return user;
  const { password: _password, permissions, ...safe } = user;
  return {
    ...safe,
    adminRole: user.role === 'admin' ? (user.adminRole || 'Administrador Geral') : 'Cliente',
    permissions: normalizeAdminPermissions(permissions, user.role)
  };
}

export const uid = () => randomUUID();
export const now = () => new Date().toISOString();

export const all = (kind) =>
  db
    .prepare('SELECT payload FROM records WHERE kind=? ORDER BY rowid DESC')
    .all(kind)
    .map((r) => JSON.parse(r.payload));

export const get = (kind, id) => {
  const r = db.prepare('SELECT payload FROM records WHERE kind=? AND id=?').get(kind, String(id || ''));
  if (!r) fail('Registro não encontrado.', 404);
  return JSON.parse(r.payload);
};

export function put(kind, arg2, arg3) {
  const data = arg3 !== undefined ? arg3 : arg2;
  const id = arg3 !== undefined ? arg2 : data.id;
  const r = {
    ...data,
    id: String(id || uid()),
    createdAt: data.createdAt || now(),
    updatedAt: now()
  };
  db.prepare(
    'INSERT INTO records(id,kind,payload) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload'
  ).run(r.id, kind, JSON.stringify(r));
  return r;
}

export function remove(kind, id) {
  db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, String(id));
}

export function next(kind, start = 1) {
  const startNum = Number.isFinite(start) ? start : 1;
  const v = db.prepare('SELECT value FROM counters WHERE kind=?').get(kind)?.value ?? (startNum - 1);
  db.prepare('INSERT INTO counters VALUES(?,?) ON CONFLICT(kind) DO UPDATE SET value=excluded.value').run(
    kind,
    v + 1
  );
  return v + 1;
}

export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function hash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verify(password, stored) {
  const [salt, key] = stored.split(':');
  const value = scryptSync(password, salt, 64);
  return timingSafeEqual(value, Buffer.from(key, 'hex'));
}

export function addUser({ name, email, password, role = 'client', clientId = null, adminRole, permissions }) {
  if (String(password).length < 10) fail('A senha deve ter pelo menos 10 caracteres.');
  const id = uid();
  const normalizedRole = role === 'admin' ? 'admin' : 'client';
  const proposedAdminRole = String(adminRole || 'Administrador Geral').trim();
  const normalizedAdminRole = normalizedRole === 'admin' && Object.prototype.hasOwnProperty.call(ADMIN_ROLE_TEMPLATES, proposedAdminRole)
    ? proposedAdminRole
    : normalizedRole === 'admin' ? 'Personalizado' : 'Cliente';
  const normalizedPermissions = normalizedRole === 'admin'
    ? permissionsForAdminRole(normalizedAdminRole, permissions === undefined ? ['*'] : permissions)
    : [];
  try {
    db.prepare('INSERT INTO users(id,name,email,password,role,clientId,adminRole,permissions) VALUES(?,?,?,?,?,?,?,?)').run(
      id,
      name,
      email.toLowerCase(),
      hash(password),
      normalizedRole,
      clientId,
      normalizedAdminRole,
      JSON.stringify(normalizedPermissions)
    );
  } catch (e) {
    if (e.message.includes('UNIQUE')) fail('Este e-mail já possui acesso.');
    throw e;
  }
  return { id, name, email, role: normalizedRole, adminRole: normalizedAdminRole, permissions: normalizedPermissions, clientId };
}

export function audit(user, kind, record, message, before = null) {
  const e = put('history', {
    clientId: record?.clientId || (kind === 'clients' ? record?.id : null),
    kind,
    recordId: record?.id,
    message,
    actor: user.name,
    actorId: user.id,
    before,
    after: record
  });
  put('audit', { ...e, id: uid() });
  return e;
}

export function notice(user, kind, record, message) {
  const targetScreen = {
    proposals: 'proposals',
    contracts: 'contracts',
    orders: 'orders',
    documents: 'documents',
    invoices: 'finance',
    payments: 'finance',
    finance: 'finance',
    tickets: 'support',
    support: 'support'
  }[kind];
  const recordId = record?.id == null ? '' : String(record.id);
  const recordCode = record?.code ? String(record.code) : '';
  return put('notifications', {
    clientId: record?.clientId || (kind === 'clients' ? record?.id : null),
    kind,
    recordId: record?.id,
    target: targetScreen ? {
      screen: targetScreen,
      detail: recordCode || (kind === 'orders' && recordId ? `OS${recordId}` : ['tickets', 'support'].includes(kind) && recordId ? `TCK${recordId}` : recordId || null)
    } : null,
    message,
    audience: user.role === 'admin' ? 'client' : 'admin',
    readBy: []
  });
}

export const company = () => all('company')[0];

export function cleanup() {
  const cutoff = Date.now() - 30 * 24 * 3600000;
  for (const e of all('audit')) {
    if (Date.parse(e.createdAt) < cutoff) remove('audit', e.id);
  }
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
}

function seed() {
  if (db.prepare('SELECT id FROM migrations WHERE id=?').get('v3-initial')) return;

  transaction(() => {
    if (process.env.NODE_ENV === 'production') {
      const adminName = String(process.env.GSA_BOOTSTRAP_ADMIN_NAME || '').trim();
      const adminEmail = String(process.env.GSA_BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
      const adminPassword = String(process.env.GSA_BOOTSTRAP_ADMIN_PASSWORD || '');
      if (!adminName || !adminEmail || adminPassword.length < 10) {
        throw new Error('Configure GSA_BOOTSTRAP_ADMIN_NAME, GSA_BOOTSTRAP_ADMIN_EMAIL e GSA_BOOTSTRAP_ADMIN_PASSWORD antes de iniciar em produção.');
      }

      put('company', {
        id: 'company',
        name: String(process.env.GSA_COMPANY_NAME || '').trim(),
        tax: String(process.env.GSA_COMPANY_TAX || '').trim(),
        email: String(process.env.GSA_COMPANY_EMAIL || '').trim(),
        phone: String(process.env.GSA_COMPANY_PHONE || '').trim(),
        description: String(process.env.GSA_COMPANY_DESCRIPTION || '').trim()
      });
      addUser({ name: adminName, email: adminEmail, password: adminPassword, role: 'admin' });
      db.prepare('INSERT INTO migrations VALUES(?)').run('v3-initial');
      return;
    }

    // 1. Empresa
    put('company', {
      id: 'company',
      name: 'GSA HUB',
      tax: '12.345.678/0001-90',
      email: 'contato@gsahub.com.br',
      phone: '(11) 98765-4321',
      description: 'SOLUÇÕES ADMINISTRATIVAS'
    });

    // 2. Administrador
    const admin = addUser({
      name: 'Mariana Souza',
      email: 'admin@gsa.local',
      password: 'GsaLocal@2026',
      role: 'admin'
    });

    // 3. RPS (Responsável pelo Serviço) - Exato do mockup
    const rps = put('rps', {
      id: next('rps', 100),
      code: 'RPS100',
      name: 'João Carlos da Silva',
      email: 'joao.silva@gsahub.com.br',
      active: true
    });

    // 4. Clientes - Exato dos mockups
    const alfa = put('clients', {
      id: next('clients', 108),
      code: 'CL108',
      type: 'PJ',
      name: 'Empresa Alfa Ltda',
      tradeName: 'Alfa Serviços',
      tax: '12.345.678/0001-90',
      contact: 'Roberto Alfa',
      email: 'alfa@gsa.local',
      phone: '(11) 97777-8888',
      whatsapp: '(11) 97777-8888',
      cep: '01414-001',
      street: 'Rua Haddock Lobo',
      number: '1307',
      extra: 'Conjunto 81',
      district: 'Cerqueira César',
      city: 'São Paulo',
      state: 'SP',
      active: true
    });

    const beta = put('clients', {
      id: next('clients', 109),
      code: 'CL102',
      type: 'PJ',
      name: 'Empresa Alfa Ltda',
      tradeName: 'Alfa Matriz',
      tax: '12.345.678/0001-90',
      contact: 'Marina Almeida',
      email: 'pj@gsa.local',
      phone: '(11) 99999-1111',
      whatsapp: '(11) 99999-1111',
      cep: '01310-100',
      street: 'Avenida Paulista',
      number: '1000',
      extra: 'Sala 12',
      district: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      active: true
    });

    const pf = put('clients', {
      id: next('clients', 110),
      code: 'CL103',
      type: 'PF',
      name: 'Mariana Costa',
      tax: '529.982.247-25',
      email: 'pf@gsa.local',
      phone: '(11) 98888-2222',
      whatsapp: '(11) 98888-2222',
      cep: '04538-132',
      street: 'Avenida Brigadeiro Faria Lima',
      number: '3477',
      extra: 'Apto 101',
      district: 'Itaim Bibi',
      city: 'São Paulo',
      state: 'SP',
      active: true
    });

    for (const c of [alfa, beta, pf]) {
      addUser({
        name: c.name,
        email: c.email,
        password: 'GsaLocal@2026',
        role: 'client',
        clientId: c.id
      });
      for (const fName of ['Contratos', 'Notas fiscais']) {
        put('folders', {
          id: next('folders', 3000),
          clientId: c.id,
          name: fName,
          parentId: null
        });
      }
      audit(admin, 'clients', c, `Cliente ${c.code} cadastrado no sistema.`);
    }

    // 5. Serviços do catálogo
    const srvAbertura = put('services', {
      id: next('services', 101),
      code: 'SRV101',
      name: 'Abertura de empresa',
      description: 'Constituição de empresa e registro nos órgãos competentes.',
      price: 150000, // R$ 1.500,00
      active: true
    });

    const srvAssessoria = put('services', {
      id: next('services', 102),
      code: 'SRV102',
      name: 'Assessoria administrativa mensal',
      description: 'Organização documental e acompanhamento das rotinas administrativas.',
      price: 125000, // R$ 1.250,00
      active: true
    });

    // 6. Proposta PROP-2024-0015 (Exata do mockup da imagem 2)
    const prop = put('proposals', {
      id: next('proposals', 15),
      code: 'PROP-2024-0015',
      clientId: beta.id,
      serviceId: srvAbertura.id,
      service: { ...srvAbertura },
      rpsId: rps.id,
      rpsName: rps.name,
      title: 'Abertura de empresa',
      description: srvAbertura.description,
      status: 'Aceita',
      base: 150000,
      extra: 20000,
      extraName: 'Taxa de certificado digital',
      subtotal: 170000,
      discount: 17000,
      discountInput: 10,
      discountType: 'percent',
      total: 153000, // R$ 1.530,00
      term: 'fixed',
      start: '2024-06-10',
      end: '2025-06-30'
    });

    // 7. Contrato (Exato da imagem 2 e 5)
    const contract = put('contracts', {
      id: next('contracts', 157),
      code: 'CONT-2024-00157',
      clientId: beta.id,
      proposalId: prop.id,
      serviceId: srvAbertura.id,
      service: { ...srvAbertura },
      rpsId: rps.id,
      rpsName: rps.name,
      start: '2024-06-10',
      end: '2025-06-30',
      term: 'fixed',
      status: 'Aguardando envio', // ou 'Assinado'
      total: 153000,
      fileName: 'contrato-srv101.pdf',
      fileId: 'mock-contrato-srv101.pdf',
      signedFileId: null
    });

    // 8. Ordem de Serviço OS105 (Exata dos mockups 1, 3 e 4!)
    const orderOS105 = put('orders', {
      id: next('orders', 105),
      code: 'OS105',
      clientId: alfa.id,
      serviceId: srvAbertura.id,
      service: { ...srvAbertura },
      rpsId: rps.id,
      rpsName: rps.name,
      title: 'Abertura de empresa',
      description: 'Serviço de abertura de empresa com acompanhamento completo até a entrega dos documentos finais.',
      term: 'fixed',
      type: 'OS Única',
      priority: 'Alta',
      status: 'Em andamento',
      start: '2026-10-01',
      end: '2026-10-30',
      total: 153000,
      stages: [
        {
          id: 'stg-1',
          name: 'Recebimento da documentação',
          description: 'Receber e verificar a documentação inicial enviada pelo cliente.',
          clientUpdate: 'Documentação inicial recebida e registrada no sistema.',
          internalNote: 'Verificar se todos os documentos estão legíveis.',
          deadlineDays: '2 dias',
          completedAt: '2026-10-02',
          status: 'Concluída'
        },
        {
          id: 'stg-2',
          name: 'Conferência dos documentos',
          description: 'Conferir a documentação e validar informações com os órgãos competentes.',
          clientUpdate: 'Documentos conferidos e validados conforme os requisitos.',
          internalNote: 'Validar pendências no checklist interno.',
          deadlineDays: '3 dias',
          completedAt: '2026-10-03',
          status: 'Concluída'
        },
        {
          id: 'stg-3',
          name: 'Protocolo no órgão responsável',
          description: 'Protocolar a solicitação junto ao órgão responsável (e.g. Junta Comercial, Prefeitura, Receita Federal).',
          clientUpdate: 'Protocolo em preparação para envio ao órgão responsável.',
          internalNote: 'Anexar o comprovante de protocolo ao processo.',
          deadlineDays: '5 dias',
          completedAt: null,
          status: 'Em andamento'
        },
        {
          id: 'stg-4',
          name: 'Acompanhamento do processo',
          description: 'Acompanhar o andamento e responder eventuais diligências.',
          clientUpdate: 'Aguardando protocolo para iniciar o acompanhamento no órgão.',
          internalNote: 'Monitorar diariamente e registrar todas as movimentações.',
          deadlineDays: '15 dias',
          completedAt: null,
          status: 'Não iniciada'
        },
        {
          id: 'stg-5',
          name: 'Emissão dos documentos finais',
          description: 'Receber e revisar os documentos finais emitidos pelo órgão competente.',
          clientUpdate: 'Documentos finais em emissão.',
          internalNote: 'Conferir dados da empresa antes de enviar ao cliente.',
          deadlineDays: '5 dias',
          completedAt: null,
          status: 'Não iniciada'
        },
        {
          id: 'stg-6',
          name: 'Serviço concluído',
          description: 'Entrega dos documentos ao cliente e encerramento da OS.',
          clientUpdate: 'Entrega dos documentos ao cliente e encerramento da OS.',
          internalNote: 'Confirmar recebimento com o cliente e arquivar processo.',
          deadlineDays: '3 dias',
          completedAt: null,
          status: 'Não iniciada'
        }
      ],
      updates: [
        { date: '2026-10-03', text: 'Conferência dos documentos concluída', details: 'Documentos conferidos e validados conforme os requisitos.' },
        { date: '2026-10-02', text: 'Documentação recebida', details: 'Documentação inicial recebida e registrada no sistema.' },
        { date: '2026-10-01', text: 'Ordem de Serviço criada', details: 'Sua OS foi registrada e está em processamento.' }
      ]
    });

    // 9. Faturas e parcelas
    put('invoices', {
      id: next('invoices', 200),
      code: 'FAT100',
      clientId: alfa.id,
      orderId: orderOS105.id,
      title: 'Abertura de empresa - Parcela 1/2',
      total: 76500,
      originalTotal: 76500,
      due: '2026-10-15',
      status: 'Pendente',
      installments: [
        { id: 1, number: 1, amount: 76500, due: '2026-10-15', status: 'Pendente' }
      ],
      payments: [],
      changes: []
    });

    put('invoices', {
      id: next('invoices', 201),
      code: 'FAT101',
      clientId: pf.id,
      title: 'Regularização cadastral',
      total: 85000,
      originalTotal: 85000,
      due: '2026-09-28',
      status: 'Vencido',
      installments: [
        { id: 1, number: 1, amount: 85000, due: '2026-09-28', status: 'Vencido' }
      ],
      payments: [],
      changes: []
    });

    // 10. Documentos solicitados
    put('documents', {
      id: next('documents', 400),
      clientId: alfa.id,
      orderId: orderOS105.id,
      stageId: 'stg-1',
      title: 'Contrato Social e Documento dos Sócios',
      description: 'Envie o contrato social consolidado e CNH/RG de todos os sócios administradores.',
      deadline: '2026-10-05',
      blocking: true,
      status: 'Aprovado',
      versions: [
        { id: 1, fileName: 'cnh_socios.pdf', date: '2026-10-02', status: 'Aprovado' }
      ],
      visible: true
    });

    // 11. Tickets
    put('tickets', {
      id: next('tickets', 500),
      clientId: alfa.id,
      orderId: orderOS105.id,
      title: 'Prazo estimado para o protocolo',
      status: 'Em atendimento',
      messages: [
        {
          id: 1,
          author: alfa.name,
          role: 'client',
          text: 'Boa tarde! O protocolo na Junta Comercial costuma demorar quantos dias?',
          files: [],
          internal: false,
          at: '2026-10-02T10:00:00Z'
        },
        {
          id: 2,
          author: 'Mariana Souza',
          role: 'admin',
          text: 'Olá! Geralmente leva entre 2 a 4 dias úteis após a conferência inicial. Já estamos finalizando a preparação dos autos!',
          files: [],
          internal: false,
          at: '2026-10-02T10:30:00Z'
        },
        {
          id: 3,
          author: 'Mariana Souza',
          role: 'admin',
          text: 'Junta comercial do estado de SP está com fila reduzida nesta semana.',
          files: [],
          internal: true,
          at: '2026-10-02T10:31:00Z'
        }
      ]
    });

    // 12. Notificações
    notice(admin, 'orders', orderOS105, 'OS105 — Abertura de empresa avançou para etapa Protocolo');

    db.prepare('INSERT INTO migrations VALUES(?)').run('v3-initial');
  });
}

seed();

// The local profile switcher opens the first seeded client (CL108). The
// original fixture linked its proposal and contract to the second client,
// which made the two portals look disconnected during local testing.
if (!db.prepare('SELECT id FROM migrations WHERE id=?').get('v3-demo-portal-link')) {
  transaction(() => {
    const proposal = all('proposals').find((item) => item.code === 'PROP-2024-0015');
    if (proposal && String(proposal.clientId) === '109') {
      proposal.clientId = '108';
      put('proposals', proposal.id, proposal);
    }
    const contract = all('contracts').find((item) => item.proposalId === proposal?.id || item.code === 'CONT-2024-00157');
    if (contract && String(contract.clientId) === '109') {
      contract.clientId = '108';
      put('contracts', contract.id, contract);
    }
    db.prepare('INSERT INTO migrations VALUES(?)').run('v3-demo-portal-link');
  });
}
cleanup();
