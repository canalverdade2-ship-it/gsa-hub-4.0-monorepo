import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import { registerInfinitePay } from './infinitepay.mjs';

import {
  db,
  dataDir,
  all,
  get,
  put,
  remove,
  next,
  uid,
  now,
  transaction,
  verify,
  hash,
  addUser,
  hasAdminPermission,
  permissionsForAdminRole,
  publicUser,
  audit,
  notice,
  company
} from './store.mjs';

import { fail, text, cents, date, today, taxValid, commercial, installments } from './domain.mjs';

// Server-only secrets are loaded outside Vite's client bundle so provider
// credentials are never sent to the browser. In production the runtime file
// lives under the persistent data directory and can be updated by the
// authenticated financial-settings route without making the code directory
// writable.
const runtimeEnvFile = process.env.GSA_RUNTIME_ENV_FILE || '.env.local';
const loadEnvFile = (fileName, { override = false } = {}) => {
  try {
    const file = path.isAbsolute(fileName) ? fileName : path.resolve(process.cwd(), fileName);
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && (override || process.env[key] === undefined)) process.env[key] = value;
    }
  } catch {
    // Environment variables supplied by the process remain the source of truth.
  }
};

loadEnvFile(runtimeEnvFile, { override: Boolean(process.env.GSA_RUNTIME_ENV_FILE) });
loadEnvFile('.env');

const publicBasePath = String(
  process.env.GSA_PUBLIC_BASE_PATH || (process.env.NODE_ENV === 'production' ? '/gsa3' : '')
).replace(/\/$/, '');

const updateLocalEnv = (entries) => {
  const file = path.isAbsolute(runtimeEnvFile) ? runtimeEnvFile : path.resolve(process.cwd(), runtimeEnvFile);
  let lines = [];
  try {
    lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  } catch {
    lines = ['# Local-only InfinitePay credentials. Never commit this file.'];
  }
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue;
    const nextLine = `${key}=${String(value).replace(/[\r\n]/g, '')}`;
    const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));
    if (index >= 0) lines[index] = nextLine;
    else lines.push(nextLine);
  }
  fs.writeFileSync(file, `${lines.filter((line, index, allLines) => index < allLines.length - 1 || line.trim()).join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const proposalRevisionSnapshot = (proposal, fallbackDate = now()) => ({
  subtotal: Number(proposal?.subtotal ?? (Number(proposal?.total || 0) + Number(proposal?.discount || 0))),
  total: Number(proposal?.total || 0),
  discount: Number(proposal?.discount || 0),
  discountInput: Number(proposal?.discountInput || 0),
  discountType: proposal?.discountType || 'fixed',
  status: proposal?.status || 'Aguardando aceite',
  date: proposal?.updated || proposal?.updatedAt || proposal?.createdAt || proposal?.created || fallbackDate,
  acceptedAt: proposal?.acceptedAt || null,
  acceptedBy: proposal?.acceptedBy || null
});

const proposalRevisionFromHistory = (proposal) => {
  const historyEntry = all('history').find((entry) =>
    entry.kind === 'proposals' &&
    String(entry.recordId) === String(proposal?.id) &&
    entry.before &&
    String(entry.message || '').toLowerCase().includes('revisada')
  );
  if (!historyEntry) return null;
  const revisedAt = historyEntry.after?.updated || historyEntry.after?.updatedAt || historyEntry.createdAt || now();
  return {
    previous: proposalRevisionSnapshot(historyEntry.before, historyEntry.before?.updatedAt || historyEntry.before?.createdAt || revisedAt),
    revisedAt
  };
};

const enrichProposalRevision = (proposal) => {
  if (!proposal?.revised) return proposal;
  const storedHistory = Array.isArray(proposal.revisionHistory) ? proposal.revisionHistory : [];
  const fallbackRevision = storedHistory.length ? storedHistory[storedHistory.length - 1] : proposalRevisionFromHistory(proposal);
  if (!fallbackRevision?.previous) return proposal;
  return {
    ...proposal,
    revised: true,
    revisedAt: proposal.revisedAt || fallbackRevision.revisedAt,
    previousVersion: proposal.previousVersion || fallbackRevision.previous,
    revisionHistory: storedHistory.length ? storedHistory : [fallbackRevision]
  };
};

const migrateProposalRevisionHistory = () => {
  transaction(() => {
    for (const proposal of all('proposals')) {
      if (!proposal.revised || (Array.isArray(proposal.revisionHistory) && proposal.revisionHistory.length)) continue;
      const revision = proposalRevisionFromHistory(proposal);
      if (!revision?.previous) continue;
      put('proposals', proposal.id, {
        ...proposal,
        revisedAt: proposal.revisedAt || revision.revisedAt,
        previousVersion: proposal.previousVersion || revision.previous,
        revisionHistory: [revision]
      });
    }
  });
};

const migrateProposalAcceptanceTimestamps = () => {
  const acceptanceHistory = all('history');
  transaction(() => {
    for (const proposal of all('proposals')) {
      if (proposal.acceptedAt || !['Aceita', 'Convertida'].includes(proposal.status)) continue;
      const acceptance = acceptanceHistory.find((entry) =>
        entry.kind === 'proposals' &&
        String(entry.recordId) === String(proposal.id) &&
        /proposta .* aceita/i.test(String(entry.message || ''))
      );
      if (!acceptance?.createdAt) continue;
      put('proposals', proposal.id, {
        ...proposal,
        acceptedAt: acceptance.createdAt,
        acceptedBy: acceptance.actor || undefined
      });
    }
  });
};

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Block non-localhost
app.use((req, res, next) => {
  const ip = req.socket.remoteAddress;
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

// Body parsing
app.use(express.json());

// Cookie parsing
app.use((req, res, next) => {
  req.cookies = {};
  const hdr = req.headers.cookie;
  if (hdr) {
    hdr.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      if (parts.length > 1) {
        req.cookies[parts.shift().trim()] = decodeURI(parts.join('='));
      }
    });
  }
  next();
});

// Uploads setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(dataDir, 'uploads')),
  filename: (req, file, cb) => cb(null, uid() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

// Uploaded files are served only through authenticated, resource-specific
// routes (tickets, contracts, documents). Do not expose the whole directory
// as a public static folder in production.

// Token helpers
const generateToken = () => crypto.randomBytes(32).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Gov.br's OAuth state is kept only long enough to complete one signing
// attempt. It binds the callback to the authenticated client and contract
// without ever putting an access token in the browser or in the URL.
const govbrSignatureRequests = new Map();
const GOVBR_SIGNATURE_STATE_TTL_MS = 10 * 60 * 1000;
const govbrSignatureConfig = () => ({
  clientId: String(process.env.GOVBR_SIGNATURE_CLIENT_ID || '').trim(),
  clientSecret: String(process.env.GOVBR_SIGNATURE_CLIENT_SECRET || '').trim(),
  redirectUri: String(process.env.GOVBR_SIGNATURE_REDIRECT_URI || '').trim(),
  authorizeUrl: String(process.env.GOVBR_SIGNATURE_AUTHORIZE_URL || 'https://cas.staging.iti.br/oauth2.0/authorize').trim(),
  tokenUrl: String(process.env.GOVBR_SIGNATURE_TOKEN_URL || 'https://cas.staging.iti.br/oauth2.0/token').trim(),
  apiBaseUrl: String(process.env.GOVBR_SIGNATURE_API_BASE_URL || 'https://assinatura-api.staging.iti.br').replace(/\/$/, ''),
  scope: String(process.env.GOVBR_SIGNATURE_SCOPE || 'sign govbr').trim()
});

const govbrSignatureConfigured = (config = govbrSignatureConfig()) => Boolean(
  config.clientId && config.clientSecret && config.redirectUri && config.authorizeUrl && config.tokenUrl && config.apiBaseUrl && config.scope
);

const cleanupGovbrSignatureRequests = () => {
  const cutoff = Date.now() - GOVBR_SIGNATURE_STATE_TTL_MS;
  for (const [state, request] of govbrSignatureRequests.entries()) {
    if (request.createdAt < cutoff) govbrSignatureRequests.delete(state);
  }
};
setInterval(cleanupGovbrSignatureRequests, 60 * 1000).unref?.();

// Rate limiting state
const loginAttempts = new Map();
const cleanupRateLimits = () => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [ip, data] of loginAttempts.entries()) {
    if (data.time < cutoff) loginAttempts.delete(ip);
  }
};
setInterval(cleanupRateLimits, 5 * 60 * 1000);

const loginLimiter = (req, res, next) => {
  const ip = req.socket.remoteAddress;
  const nowMs = Date.now();
  let data = loginAttempts.get(ip);
  if (!data || data.time < nowMs - 15 * 60 * 1000) {
    data = { count: 0, time: nowMs };
  }
  if (data.count >= 10) {
    return res.status(429).json({ error: 'Muitas tentativas de login. Tente novamente mais tarde.' });
  }
  next();
};

// Sessions cache
const sessions = new Map();
const localDemo = process.env.NODE_ENV !== 'production';
// Keep authenticated portal sessions persistent while the user remains active.
// The cookie is renewed on authenticated requests and is explicitly revoked by
// /api/logout, so normal refreshes and browser restarts do not log the user out.
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_TTL_MS,
  sameSite: 'strict'
};

// Auth Middleware
const auth = (req, res, next) => {
  const token = req.cookies.gsa_session;
  // The app's profile switcher is intentionally available only to the local
  // development build. It lets the two portals exercise the same database
  // without pretending that a production request is authenticated.
  if (!token && localDemo) {
    const requestedRole = String(req.headers['x-gsa-demo-role'] || req.query.demoRole || '').toLowerCase();
    if (requestedRole === 'admin' || requestedRole === 'client') {
      const user = requestedRole === 'admin'
        ? db.prepare("SELECT * FROM users WHERE role='admin' AND active=1 LIMIT 1").get()
        : db.prepare("SELECT * FROM users WHERE role='client' AND active=1 ORDER BY CAST(clientId AS INTEGER) LIMIT 1").get();
      if (user) {
        req.user = user;
        if (user.role === 'admin') enforceAdminModuleAccess(req);
        return next();
      }
    }
  }
  if (!token) throw fail('Não autorizado', 401);

  const tokenHash = hashToken(token);
  const cachedSession = sessions.get(tokenHash);
  const storedSession = cachedSession || db.prepare('SELECT userId, expires FROM sessions WHERE token = ?').get(tokenHash);
  const session = storedSession
    ? {
        userId: storedSession.userId,
        expiresAt: Number(storedSession.expiresAt ?? storedSession.expires)
      }
    : null;
  if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt < Date.now()) {
    sessions.delete(tokenHash);
    db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash);
    res.clearCookie('gsa_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
    throw fail('Sessão expirada', 401);
  }
  if (!cachedSession) sessions.set(tokenHash, session);

  // Slide the expiration window while the account is actively used. A user
  // who closes the browser can return with the persistent cookie; clicking
  // Sair still removes this token immediately.
  const refreshedExpiresAt = Date.now() + SESSION_TTL_MS;
  if (Number(session.expiresAt) < refreshedExpiresAt - (24 * 60 * 60 * 1000)) {
    sessions.set(tokenHash, { userId: session.userId, expiresAt: refreshedExpiresAt });
    db.prepare('UPDATE sessions SET expires = ? WHERE token = ?').run(refreshedExpiresAt, tokenHash);
    res.cookie('gsa_session', token, sessionCookieOptions);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId);
  if (!user || !user.active) throw fail('Usuário desativado', 401);

  req.user = user;
  if (user.role === 'admin') enforceAdminModuleAccess(req);
  next();
};

const adminModuleForRequest = (req) => {
  const route = String(req.path || req.originalUrl || '').split('?')[0];
  if (route === '/api/state') return 'dashboard';
  if (route.startsWith('/api/admin/users') || route === '/api/company' || route === '/api/infinitepay/config') return 'settings';
  if (route.startsWith('/api/wallet/')) return 'finance';
  if (route.startsWith('/api/clients') || route.startsWith('/api/account-deletion-requests')) return 'clients';
  if (route.startsWith('/api/services') || route.startsWith('/api/rps')) return 'catalogs';
  if (route.startsWith('/api/proposals')) return 'proposals';
  if (route.startsWith('/api/contracts')) return 'contracts';
  if (route.startsWith('/api/orders')) return 'orders';
  if (route.startsWith('/api/infinitepay/coupons')) return 'coupons';
  if (route.startsWith('/api/invoices') || route.startsWith('/api/infinitepay/')) return 'finance';
  if (route.startsWith('/api/tasks')) return 'tasks';
  if (route.startsWith('/api/calendar-events')) return 'calendar';
  if (route.startsWith('/api/tickets')) return 'support';
  if (route.startsWith('/api/documents')) return 'documents';
  if (route.startsWith('/api/personal-documents')) return 'clients';
  if (route.startsWith('/api/notifications')) return 'notices';
  return null;
};

const enforceAdminModuleAccess = (req) => {
  const module = adminModuleForRequest(req);
  if (module && !hasAdminPermission(req.user, module)) {
    throw fail(`Seu perfil não possui permissão para acessar o módulo ${module}.`, 403);
  }
};

const adminAuth = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') throw fail('Acesso exclusivo ao administrador', 403);
  enforceAdminModuleAccess(req);
  next();
};

// SSE connections. Events have ids and a short replay buffer so a mobile
// client that briefly loses connectivity can catch up as soon as it reconnects.
const sseClients = new Set();
let realtimeSequence = Date.now() * 1000;
const realtimeHistory = [];
const REALTIME_HISTORY_LIMIT = 500;
const writeSseMessage = (res, message) => {
  try {
    res.write(`id: ${message.id}\nevent: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`);
    return true;
  } catch {
    sseClients.delete(res);
    return false;
  }
};

export const broadcastEvent = (event, data = {}) => {
  const message = {
    id: String(++realtimeSequence),
    event,
    data,
    createdAt: now()
  };
  realtimeHistory.push(message);
  if (realtimeHistory.length > REALTIME_HISTORY_LIMIT) realtimeHistory.splice(0, realtimeHistory.length - REALTIME_HISTORY_LIMIT);
  for (const res of sseClients) writeSseMessage(res, message);
};

setInterval(() => {
  for (const res of sseClients) {
    try { res.write(': heartbeat\n\n'); } catch { sseClients.delete(res); }
  }
}, 25000);

app.get('/api/events', auth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sseClients.add(res);
  const lastEventId = Number(req.get('Last-Event-ID') || req.query.lastEventId || 0);
  if (Number.isFinite(lastEventId) && lastEventId > 0) {
    for (const message of realtimeHistory) {
      if (Number(message.id) > lastEventId) writeSseMessage(res, message);
    }
  } else {
    writeSseMessage(res, {
      id: String(realtimeSequence),
      event: 'ready',
      data: { connectedAt: now() }
    });
  }
  req.on('close', () => {
    sseClients.delete(res);
  });
});

const wrap = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ================= API ROUTES =================

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'online', timestamp: now() });
});

app.post(
  '/api/login',
  loginLimiter,
  wrap((req, res) => {
    const email = String(req.body?.email || '').trim();
    const login = String(req.body?.login || '').replace(/\D/g, '');
    const password = String(req.body?.password || '');
    if (!email && !login) throw fail('Informe seu login.', 400);
    if (!login && !password) throw fail('Informe seu e-mail e sua senha.', 400);

    let user;
    if (login) {
      if (!/^\d{5,6}$/.test(login)) throw fail('O login do cliente deve ter 6 dígitos para CPF ou 5 dígitos para CNPJ.', 400);
      const clients = all('clients');
      const matches = clients.filter((client) => {
        const taxDigits = normalizeClientDigits(client.tax);
        if (taxDigits.length === 11) return login.length === 6 && taxDigits.slice(0, 6) === login;
        if (taxDigits.length === 14) return login.length === 5 && taxDigits.slice(0, 5) === login;
        return false;
      });
      if (matches.length > 1) throw fail('Login de cliente duplicado. Entre em contato com o suporte.', 409);
      const client = matches[0];
      user = client
        ? db.prepare("SELECT * FROM users WHERE role='client' AND clientId=?").get(String(client.id))
        : undefined;
    } else {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    }
    if (user && !user.active) {
      throw fail('Esta conta foi excluída ou desativada. Entre em contato com o suporte.', 403);
    }
    if (!user || (!login && !verify(password, user.password))) {
      const ip = req.socket.remoteAddress;
      const data = loginAttempts.get(ip) || { count: 0, time: Date.now() };
      data.count++;
      loginAttempts.set(ip, data);
      throw fail('Credenciais inválidas', 401);
    }
    loginAttempts.delete(req.socket.remoteAddress);

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const sessionData = {
      userId: user.id,
      expiresAt
    };
    sessions.set(tokenHash, sessionData);
    db.prepare('INSERT OR REPLACE INTO sessions(token,userId,expires) VALUES(?,?,?)').run(tokenHash, user.id, expiresAt);

    res.cookie('gsa_session', token, sessionCookieOptions);

    try {
      audit({ id: user.id, name: user.name, role: user.role }, 'auth', { id: user.id, clientId: user.clientId || null }, 'Login realizado.');
    } catch (e) {}
    res.json(publicUser(user));
  })
);

app.post('/api/logout', (req, res) => {
  const token = req.cookies.gsa_session;
  if (token) {
    const tokenHash = hashToken(token);
    sessions.delete(tokenHash);
    db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash);
  }
  res.clearCookie('gsa_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json(publicUser(req.user));
});

app.patch('/api/me/password', auth, wrap((req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!currentPassword || !newPassword) throw fail('Informe a senha atual e a nova senha.', 400);
  if (newPassword.length < 10) throw fail('A nova senha deve ter pelo menos 10 caracteres.', 400);
  if (!verify(currentPassword, req.user.password)) throw fail('A senha atual não confere.', 400);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash(newPassword), req.user.id);
  audit({ id: req.user.id, name: req.user.name, role: req.user.role }, 'auth', { id: req.user.id, clientId: req.user.clientId || null }, 'Senha de acesso alterada.');
  res.json({ ok: true });
}));

// Administrative settings are persisted in the production database.
app.get('/api/admin/users', auth, adminAuth, wrap((req, res) => {
  const users = db.prepare("SELECT id,name,email,role,adminRole,permissions,clientId,active FROM users WHERE role='admin' ORDER BY name").all();
  res.json(users.map(publicUser));
}));

app.post('/api/admin/users', auth, adminAuth, wrap((req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const role = 'admin';
  const adminRole = String(body.adminRole || 'Administrador Geral').trim();
  const permissions = permissionsForAdminRole(adminRole, body.permissions);
  if (!name || !email) throw fail('Informe nome e e-mail.', 400);
  const generatedPassword = String(body.password || `${crypto.randomBytes(12).toString('base64url')}A1!`);
  if (!permissions.length) throw fail('Selecione ao menos um módulo para este usuário.', 400);
  const created = addUser({ name, email, password: generatedPassword, role, adminRole, permissions, clientId: null });
  audit(req.user, 'users', created, `Usuário ${created.email} convidado.`);
  res.status(201).json({ ...created, active: 1 });
}));

app.patch('/api/admin/users/:id/access', auth, adminAuth, wrap((req, res) => {
  const id = String(req.params.id);
  const target = db.prepare('SELECT id,name,email,role,adminRole,permissions,clientId,active FROM users WHERE id=?').get(id);
  if (!target) throw fail('Usuário não encontrado.', 404);
  if (target.role !== 'admin') throw fail('Somente usuários administrativos possuem permissões por módulo.', 400);
  const adminRole = String(req.body?.adminRole || target.adminRole || 'Administrador Geral').trim();
  const permissions = permissionsForAdminRole(adminRole, req.body?.permissions ?? target.permissions);
  if (!permissions.length) throw fail('Selecione ao menos um módulo para este usuário.', 400);
  db.prepare('UPDATE users SET adminRole=?, permissions=? WHERE id=?').run(adminRole, JSON.stringify(permissions), id);
  const updated = db.prepare('SELECT id,name,email,role,adminRole,permissions,clientId,active FROM users WHERE id=?').get(id);
  audit(req.user, 'users', updated, `Permissões do usuário ${updated.email} atualizadas.`);
  res.json(publicUser(updated));
}));

app.patch('/api/admin/users/:id/password', auth, adminAuth, wrap((req, res) => {
  const id = String(req.params.id);
  const newPassword = String(req.body?.password || '');
  if (newPassword.length < 10) throw fail('A senha deve ter pelo menos 10 caracteres.', 400);
  const target = db.prepare('SELECT id,name,email,role,clientId,active FROM users WHERE id=?').get(id);
  if (!target) throw fail('Usuário não encontrado.', 404);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hash(newPassword), id);
  audit(req.user, 'users', target, `Senha do usuário ${target.email} redefinida.`);
  res.json({ ok: true });
}));

app.patch('/api/company', auth, adminAuth, wrap((req, res) => {
  const current = company() || { id: 'company' };
  const body = req.body || {};
  const updated = put('company', 'company', {
    ...current,
    id: 'company',
    name: String(body.name ?? current.name ?? '').trim(),
    tradeName: String(body.tradeName ?? current.tradeName ?? '').trim(),
    tax: String(body.tax ?? current.tax ?? '').trim(),
    email: String(body.email ?? current.email ?? '').trim(),
    phone: String(body.phone ?? current.phone ?? '').trim(),
    address: String(body.address ?? current.address ?? '').trim()
  });
  audit(req.user, 'company', updated, 'Dados institucionais atualizados.');
  res.json(updated);
}));

// Admin global state
const adminStateAllows = (user, module) => hasAdminPermission(user, module);
const adminStateValue = (user, module, value, fallback = []) => adminStateAllows(user, module) ? value : fallback;
app.get(
  '/api/state',
  auth,
  adminAuth,
  wrap((req, res) => {
    res.json({
      user: publicUser(req.user),
      company: company(),
      clients: adminStateValue(req.user, 'clients', all('clients')),
      services: adminStateValue(req.user, 'catalogs', all('services')),
      rps: adminStateValue(req.user, 'catalogs', all('rps')),
      proposals: adminStateValue(req.user, 'proposals', all('proposals').map(enrichProposalRevision)),
      contracts: adminStateValue(req.user, 'contracts', all('contracts')),
      orders: adminStateValue(req.user, 'orders', all('orders')),
      invoices: adminStateValue(req.user, 'finance', all('invoices')),
      documents: adminStateValue(req.user, 'documents', all('documents')),
      personalDocuments: adminStateValue(req.user, 'clients', all('personal_documents')),
      tasks: adminStateValue(req.user, 'tasks', all('tasks')),
      calendarEvents: adminStateValue(req.user, 'calendar', all('calendar_events')),
      folders: adminStateValue(req.user, 'documents', all('folders')),
      files: adminStateValue(req.user, 'documents', all('files')),
      tickets: adminStateValue(req.user, 'support', all('tickets')),
      accountDeletionRequests: adminStateValue(req.user, 'clients', all('account_deletion_requests')),
      notifications: adminStateValue(req.user, 'notices', all('notifications')),
      history: adminStateValue(req.user, 'reports', all('history')),
      audit: adminStateValue(req.user, 'reports', all('audit'))
    });
  })
);

// Client isolated state
app.get(
  '/api/client-state',
  auth,
  wrap((req, res) => {
    const clientId = req.user.clientId;
    if (!clientId) throw fail('Usuário não é do perfil cliente', 403);

    const byClient = (arr) =>
      (Array.isArray(arr) ? arr : []).filter((r) => String(r.clientId) === String(clientId));

    const client = (() => {
      try {
        return get('clients', clientId);
      } catch (e) {
        return null;
      }
    })();

    res.json({
      user: publicUser(req.user),
      company: company(),
      clients: client ? [client] : [],
      proposals: byClient(all('proposals')).map(enrichProposalRevision),
      contracts: byClient(all('contracts')),
      orders: byClient(all('orders')).map((o) => ({
        ...o,
        clientName: client?.name || '',
        clientCode: client?.code || `CL${clientId}`,
        stages: (o.stages || []).map(({ internalNote, ...stg }) => stg)
      })),
      invoices: byClient(all('invoices')),
      documents: byClient(all('documents')).filter((d) => d.visible !== false),
      personalDocuments: byClient(all('personal_documents')).filter((d) => d.visible !== false),
      folders: byClient(all('folders')),
      files: byClient(all('files')),
      tickets: byClient(all('tickets')).map((t) => ({
        ...t,
        messages: (t.messages || []).filter((m) => !m.internal)
      })),
      accountDeletionRequests: byClient(all('account_deletion_requests')),
      notifications: byClient(all('notifications'))
    });
  })
);

// Administrative client wallet. Wallet entries are server records so launches
// and financial settlements remain available to the back office only.
const walletEntriesFor = (clientId) => all('wallet_entries').filter((entry) => String(entry.clientId) === String(clientId));
const walletBalanceFor = (clientId) => walletEntriesFor(clientId).reduce((balance, entry) => balance + (entry.type === 'Crédito' ? Number(entry.amount) : -Number(entry.amount)), 0);
const recordWalletEntry = (clientId, type, amount, description, at = now()) => {
  const value = Math.round(Number(amount));
  if (!Number.isSafeInteger(value) || value <= 0) throw fail('Valor da carteira inválido.', 400);
  if (!['Crédito', 'Débito'].includes(type)) throw fail('Tipo de lançamento inválido.', 400);
  return put('wallet_entries', {
    id: uid(),
    clientId: String(clientId),
    type,
    amount: value,
    description: String(description || 'Saldo da carteira'),
    date: at
  });
};

app.get(
  '/api/wallet/:clientId',
  auth,
  adminAuth,
  wrap((req, res) => {
    const clientId = String(req.params.clientId);
    get('clients', clientId);
    const entries = walletEntriesFor(clientId);
    res.json({ clientId, balance: walletBalanceFor(clientId), entries });
  })
);

app.post(
  '/api/wallet/:clientId',
  auth,
  adminAuth,
  wrap((req, res) => {
    const clientId = String(req.params.clientId);
    get('clients', clientId);
    const entry = recordWalletEntry(clientId, req.body?.type, cents(req.body?.amount), req.body?.description);
    audit(req.user, 'wallet', entry, `${entry.type} lançado na carteira do cliente ${clientId}`);
    broadcastEvent('reload');
    res.json({ ok: true, entry, balance: walletBalanceFor(clientId) });
  })
);

registerInfinitePay(app, { all, put, remove, transaction, now, auth, adminAuth, wrap, updateLocalEnv, broadcastEvent, audit });

// CEP
app.get(
  '/api/cep/:cep',
  auth,
  wrap(async (req, res) => {
    const cep = req.params.cep.replace(/\D/g, '');
    if (cep.length !== 8) throw fail('CEP inválido', 400);
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();
    res.json(data);
  })
);

// CNPJ lookup is proxied through the API so the provider key never reaches
// the browser. The provider returns public Receita Federal data in PascalCase.
app.get(
  '/api/cnpj/:cnpj',
  auth,
  adminAuth,
  wrap(async (req, res) => {
    const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14 || !taxValid(cnpj)) throw fail('CNPJ inválido.', 400);

    const token = String(process.env.CNPJAPI_API_KEY || '').trim();
    if (!token) throw fail('A consulta de CNPJ ainda não foi configurada no servidor.', 503);

    const response = await fetch(`https://api.cnpjapi.com.br/${cnpj}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = String(body?.message || body?.erro || '').trim();
      const messageByStatus = {
        401: 'A chave da consulta de CNPJ é inválida.',
        403: 'A consulta de CNPJ não está liberada para este plano.',
        404: 'CNPJ não encontrado na base pública.',
        429: 'Limite de consultas de CNPJ atingido. Tente novamente mais tarde.'
      };
      throw fail(messageByStatus[response.status] || providerMessage || 'Não foi possível consultar o CNPJ agora.', response.status >= 400 && response.status < 600 ? response.status : 502);
    }

    const address = body.Endereco || {};
    const contact = body.Contato || {};
    const phone = [contact.DDD1, contact.Telefone1].filter(Boolean).join(' ')
      || [contact.DDD2, contact.Telefone2].filter(Boolean).join(' ');
    const street = [address.TipoLogradouro, address.Logradouro].filter(Boolean).join(' ').trim();
    const city = typeof address.Municipio === 'string'
      ? address.Municipio
      : address.Municipio?.Nome || body.Municipio?.Nome || '';
    res.json({
      tax: body.CNPJ || cnpj,
      name: body.RazaoSocial || '',
      tradeName: body.NomeFantasia || body.RazaoSocial || '',
      email: contact.Email || '',
      phone,
      cep: address.CEP || '',
      street,
      number: address.Numero || '',
      extra: address.Complemento || '',
      district: address.Bairro || '',
      city,
      state: address.UF || '',
      status: body.SituacaoCadastral?.Descricao || '',
      statusCode: body.SituacaoCadastral?.Codigo || ''
    });
  })
);

// Clients
const normalizeClientDigits = (value) => String(value || '').replace(/\D/g, '');
const validateClientPayload = (data, { existingId = null, requirePassword = false } = {}) => {
  const payload = data || {};
  const type = String(payload.type || '').toUpperCase();
  if (!['PF', 'PJ'].includes(type)) throw fail('Tipo de cliente inválido.', 400);

  const name = String(payload.name || '').trim();
  if (!name) throw fail('Informe o nome ou razão social do cliente.', 400);

  const tax = String(payload.tax || '').trim();
  const taxDigits = normalizeClientDigits(tax);
  if (!taxValid(tax)) throw fail('CPF ou CNPJ inválido', 400);
  if ((type === 'PF' && taxDigits.length !== 11) || (type === 'PJ' && taxDigits.length !== 14)) {
    throw fail(`O documento informado não corresponde ao tipo ${type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}.`, 400);
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail('Informe um e-mail válido.', 400);
  const phoneDigits = normalizeClientDigits(payload.phone);
  if (phoneDigits.length < 10) throw fail('Informe um telefone válido com DDD.', 400);

  if (requirePassword && String(payload.initialPassword || '').length < 10) {
    throw fail('Defina uma senha inicial com pelo menos 10 caracteres.', 400);
  }

  const activeClients = all('clients').filter((item) => item.active !== false && String(item.id) !== String(existingId ?? ''));
  if (activeClients.some((item) => normalizeClientDigits(item.tax) === taxDigits)) {
    throw fail('Este CPF ou CNPJ já está cadastrado.', 409);
  }
  // Client login uses six CPF digits or five CNPJ digits, so active clients
  // must never share the prefix used as their login identifier.
  const loginPrefixLength = type === 'PF' ? 6 : 5;
  const loginPrefix = taxDigits.slice(0, loginPrefixLength);
  if (activeClients.some((item) => {
    const itemDigits = normalizeClientDigits(item.tax);
    const itemLength = itemDigits.length === 11 ? 6 : itemDigits.length === 14 ? 5 : 0;
    return itemLength === loginPrefixLength && itemDigits.slice(0, itemLength) === loginPrefix;
  })) {
    throw fail(`Os primeiros ${loginPrefixLength} dígitos do documento já estão em uso por outro cliente.`, 409);
  }

  return { ...payload, type, name, tax, email, phone: String(payload.phone).trim() };
};

app.post(
  '/api/clients',
  auth,
  adminAuth,
  wrap((req, res) => {
    const data = validateClientPayload(req.body || {});
    // Client access is identified by the CPF/CNPJ prefix. Keep a
    // random internal credential only for the users table and never expose it
    // in the client portal or registration response.
    const initialPassword = crypto.randomBytes(32).toString('base64url');

    const clientId = transaction(() => {
      const id = next('clients', 111);
      const client = { ...data, id: String(id) };
      delete client.initialPassword;
      client.code = client.code || `CL${id}`;
      client.active = true;
      client.created = now();
      put('clients', id, client);

      put('folders', { id: next('folders', 3010), clientId: String(id), name: 'Contratos', parentId: null });
      put('folders', { id: next('folders', 3011), clientId: String(id), name: 'Notas fiscais', parentId: null });

      addUser({ name: client.name, email: client.email, password: initialPassword, role: 'client', clientId: String(id) });
      return String(id);
    });

    audit(req.user, 'clients', { id: clientId }, `Cliente ${data.name} criado`);
    broadcastEvent('reload');
    res.json({ id: clientId });
  })
);

// Personal documents belong to the client's profile. They are deliberately
// stored in their own collection so service document requests from the global
// Documents module can never appear in the client's personal record.
app.get(
  '/api/clients/:clientId/personal-documents',
  auth,
  adminAuth,
  wrap((req, res) => {
    const clientId = String(req.params.clientId);
    get('clients', clientId);
    res.json({
      documents: all('personal_documents').filter((document) =>
        String(document.clientId) === clientId && document.visible !== false
      )
    });
  })
);

app.post(
  '/api/clients/:clientId/personal-documents',
  auth,
  adminAuth,
  wrap((req, res) => {
    const clientId = String(req.params.clientId);
    const client = get('clients', clientId);
    const title = text(req.body?.title, 'Nome do documento pessoal', 160);
    const category = req.body?.category == null || String(req.body.category).trim() === ''
      ? 'Cadastro pessoal'
      : text(req.body.category, 'Categoria do documento', 100);
    const document = put('personal_documents', {
      id: uid(),
      clientId,
      clientName: client.name,
      title,
      category,
      status: 'Aguardando envio',
      visible: true,
      versions: []
    });
    audit(req.user, 'personal_documents', document, `Documento pessoal solicitado: ${document.title}`);
    notice(req.user, 'documents', { ...document, personal: true }, `Documento pessoal solicitado: ${document.title}`);
    broadcastEvent('reload');
    res.json(document);
  })
);

app.post(
  '/api/personal-documents/:id/upload',
  auth,
  upload.single('file'),
  wrap((req, res) => {
    const document = get('personal_documents', req.params.id);
    if (!document) throw fail('Solicitação não encontrada', 404);
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(document.clientId)) {
      throw fail('Acesso negado', 403);
    }
    if (!req.file) throw fail('Arquivo obrigatório', 400);
    document.status = 'Em análise';
    document.versions = Array.isArray(document.versions) ? document.versions : [];
    document.versions.push({
      id: uid(),
      fileId: req.file.filename,
      fileName: req.file.originalname,
      date: now(),
      status: 'Em análise',
      userId: req.user.id
    });
    put('personal_documents', document.id, document);
    audit(req.user, 'personal_documents', document, `Documento pessoal ${document.title} enviado para análise`);
    notice(req.user, 'documents', { ...document, personal: true }, `Documento pessoal recebido: ${document.title}`);
    broadcastEvent('reload');
    res.json({ ok: true, fileId: req.file.filename, fileName: req.file.originalname, document });
  })
);

app.patch(
  '/api/personal-documents/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const document = get('personal_documents', req.params.id);
    const title = text(req.body?.title, 'Nome do documento pessoal', 160);
    const category = req.body?.category == null || String(req.body.category).trim() === ''
      ? 'Cadastro pessoal'
      : text(req.body.category, 'Categoria do documento', 100);
    const before = { ...document };
    document.title = title;
    document.category = category;
    if (document.status === 'Rejeitado') {
      document.status = 'Aguardando envio';
      delete document.rejectionReason;
    }
    put('personal_documents', document.id, document);
    audit(req.user, 'personal_documents', document, `Documento pessoal ${document.title} atualizado`, before);
    broadcastEvent('reload');
    res.json({ ok: true, document });
  })
);

app.delete(
  '/api/personal-documents/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const document = get('personal_documents', req.params.id);
    remove('personal_documents', document.id);
    audit(req.user, 'personal_documents', document, `Documento pessoal ${document.title} excluído`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.patch(
  '/api/personal-documents/:id/approve',
  auth,
  adminAuth,
  wrap((req, res) => {
    const document = get('personal_documents', req.params.id);
    document.status = 'Aprovado';
    put('personal_documents', document.id, document);
    audit(req.user, 'personal_documents', document, `Documento pessoal ${document.title} aprovado`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.patch(
  '/api/personal-documents/:id/reject',
  auth,
  adminAuth,
  wrap((req, res) => {
    const document = get('personal_documents', req.params.id);
    const reason = text(req.body?.reason, 'Motivo da reprovação', 1000);
    document.status = 'Rejeitado';
    document.rejectionReason = reason;
    put('personal_documents', document.id, document);
    audit(req.user, 'personal_documents', document, `Documento pessoal ${document.title} rejeitado`);
    notice(req.user, 'documents', { ...document, personal: true }, `Documento pessoal ${document.title} precisa ser reenviado.`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// Internal client information is restricted to the administrative client
// workspace. A personal document can be linked to an internal note without
// removing it from the client's personal-document area.
const defaultInternalFolderNames = ['Geral', 'Contratos internos'];
const internalFoldersForClient = (clientId) => {
  const normalizedClientId = String(clientId);
  let persisted = all('internal_folders').filter((folder) => String(folder.clientId) === normalizedClientId);
  const seedId = `client:${normalizedClientId}`;
  const alreadySeeded = all('internal_folder_meta').some((item) => String(item.id) === seedId);
  // Seed the standard folders only once for each client. The metadata record
  // is kept after the last folder is deleted so a later read cannot recreate
  // a folder the administrator intentionally removed.
  if (!alreadySeeded) {
    put('internal_folder_meta', { id: seedId, clientId: normalizedClientId, seededAt: now() });
  }
  if (!alreadySeeded && persisted.length === 0) {
    persisted = defaultInternalFolderNames.map((name) => put('internal_folders', {
      id: uid(),
      clientId: normalizedClientId,
      name,
      builtIn: true
    }));
  }
  return persisted;
};

app.get(
  '/api/clients/:clientId/internal-info',
  auth,
  adminAuth,
  wrap((req, res) => {
    const clientId = String(req.params.clientId);
    get('clients', clientId);
    res.json({
      folders: internalFoldersForClient(clientId),
      notes: all('internal_notes').filter((note) => String(note.clientId) === clientId)
    });
  })
);

app.post(
  '/api/clients/:clientId/internal-info/folders',
  auth,
  adminAuth,
  wrap((req, res) => {
    const clientId = String(req.params.clientId);
    get('clients', clientId);
    const name = text(req.body?.name, 'Nome da pasta interna', 120);
    const duplicate = all('internal_folders').find((folder) =>
      String(folder.clientId) === clientId && String(folder.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) return res.json(duplicate);
    const folder = put('internal_folders', { id: uid(), clientId, name });
    audit(req.user, 'internal_folders', folder, `Pasta interna ${folder.name} criada para o cliente ${clientId}.`);
    broadcastEvent('reload');
    res.status(201).json(folder);
  })
);

app.patch(
  '/api/clients/:clientId/internal-info/folders/:folderId',
  auth,
  adminAuth,
  wrap((req, res) => {
    const clientId = String(req.params.clientId);
    get('clients', clientId);
    const folder = get('internal_folders', req.params.folderId);
    if (String(folder.clientId) !== clientId) throw fail('Pasta não pertence a este cliente.', 403);
    const name = text(req.body?.name, 'Nome da pasta interna', 120);
    const duplicate = all('internal_folders').find((item) =>
      String(item.id) !== String(folder.id) && String(item.clientId) === clientId && String(item.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) throw fail('Já existe uma pasta com esse nome.', 409);
    const previousName = folder.name;
    folder.name = name;
    put('internal_folders', folder.id, folder);
    for (const note of all('internal_notes').filter((item) => String(item.clientId) === clientId && item.folder === previousName)) {
      put('internal_notes', note.id, { ...note, folder: name });
    }
    audit(req.user, 'internal_folders', folder, `Pasta interna renomeada para ${name}.`, { name: previousName });
    broadcastEvent('reload');
    res.json(folder);
  })
);

app.delete(
  '/api/clients/:clientId/internal-info/folders/:folderId',
  auth,
  adminAuth,
  wrap((req, res) => {
    const clientId = String(req.params.clientId);
    get('clients', clientId);
    const folder = get('internal_folders', req.params.folderId);
    if (String(folder.clientId) !== clientId) throw fail('Pasta não pertence a este cliente.', 403);
    const hasNotes = all('internal_notes').some((note) => String(note.clientId) === clientId && note.folder === folder.name);
    if (hasNotes) throw fail('Esvazie a pasta antes de excluí-la.', 409);
    remove('internal_folders', folder.id);
    audit(req.user, 'internal_folders', folder, `Pasta interna ${folder.name} excluída.`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.post(
  '/api/clients/:clientId/internal-info/notes',
  auth,
  adminAuth,
  wrap((req, res) => {
    const clientId = String(req.params.clientId);
    get('clients', clientId);
    const folder = text(req.body?.folder, 'Pasta interna', 120);
    const noteText = text(req.body?.text, 'Observação interna', 5000);
    const file = req.body?.file ? text(req.body.file, 'Nome do arquivo', 240) : undefined;
    let personalDocument = null;
    const personalDocumentId = req.body?.personalDocumentId ? String(req.body.personalDocumentId) : '';
    if (personalDocumentId) {
      const document = get('personal_documents', personalDocumentId);
      if (String(document.clientId) !== clientId) throw fail('Documento pessoal não pertence a este cliente.', 403);
      const versions = Array.isArray(document.versions) ? document.versions : [];
      const latest = versions[versions.length - 1] || null;
      personalDocument = {
        id: String(document.id),
        title: document.title || document.name || 'Documento pessoal',
        category: document.category || 'Cadastro pessoal',
        status: document.status || 'Aguardando envio',
        fileId: latest?.fileId || null,
        fileName: latest?.fileName || null
      };
    }
    const hasFolder = all('internal_folders').some((item) =>
      String(item.clientId) === clientId && String(item.name || '').trim().toLowerCase() === folder.toLowerCase()
    );
    if (!hasFolder && !defaultInternalFolderNames.some((name) => name.toLowerCase() === folder.toLowerCase())) {
      put('internal_folders', { id: uid(), clientId, name: folder });
    }
    const note = put('internal_notes', {
      id: uid(),
      clientId,
      folder,
      text: noteText,
      file,
      personalDocumentId: personalDocumentId || null,
      personalDocument,
      date: now()
    });
    audit(req.user, 'internal_notes', note, `Observação interna adicionada na pasta ${folder}.`);
    broadcastEvent('reload');
    res.status(201).json({ note });
  })
);

app.patch(
  '/api/clients/:clientId/internal-info/notes/:noteId',
  auth,
  adminAuth,
  wrap((req, res) => {
    const clientId = String(req.params.clientId);
    get('clients', clientId);
    const note = get('internal_notes', req.params.noteId);
    if (String(note.clientId) !== clientId) throw fail('Registro não pertence a este cliente.', 403);
    const textValue = req.body?.text === undefined ? note.text : text(req.body.text, 'Observação interna', 5000);
    const folder = req.body?.folder === undefined ? note.folder : text(req.body.folder, 'Pasta interna', 120);
    const before = { ...note };
    put('internal_notes', note.id, { ...note, text: textValue, folder });
    const updated = get('internal_notes', note.id);
    audit(req.user, 'internal_notes', updated, `Observação interna atualizada na pasta ${folder}.`, before);
    broadcastEvent('reload');
    res.json({ note: updated });
  })
);

app.delete(
  '/api/clients/:clientId/internal-info/notes/:noteId',
  auth,
  adminAuth,
  wrap((req, res) => {
    const clientId = String(req.params.clientId);
    get('clients', clientId);
    const note = get('internal_notes', req.params.noteId);
    if (String(note.clientId) !== clientId) throw fail('Registro não pertence a este cliente.', 403);
    remove('internal_notes', note.id);
    audit(req.user, 'internal_notes', note, `Observação interna excluída da pasta ${note.folder}.`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.patch(
  '/api/clients/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const client = get('clients', id);
    if (!client) throw fail('Cliente não encontrado', 404);
    const candidate = validateClientPayload({ ...client, ...(req.body || {}) }, { existingId: id });
    const editableFields = ['type', 'name', 'tradeName', 'tax', 'contact', 'email', 'phone', 'whatsapp', 'cep', 'street', 'number', 'extra', 'district', 'city', 'state'];
    for (const field of editableFields) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) client[field] = candidate[field];
    }
    put('clients', id, client);
    audit(req.user, 'clients', client, `Cliente ${client.name} atualizado`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.delete(
  '/api/clients/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const client = get('clients', id);
    if (!client) throw fail('Cliente não encontrado', 404);
    client.active = false;
    transaction(() => {
      put('clients', id, client);
      db.prepare('UPDATE users SET active = 0 WHERE clientId = ?').run(String(id));
      for (const request of all('account_deletion_requests').filter((item) => String(item.clientId) === String(id) && item.status === 'pending')) {
        put('account_deletion_requests', request.id, { ...request, status: 'approved', approvedAt: now(), approvedBy: req.user.id });
      }
    });
    audit(req.user, 'clients', client, `Cliente ${client.name} desativado`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// A definitive deletion is available only after the client has been deactivated.
// It removes the client's records and access while preserving the admin database
// for all other clients.
app.delete(
  '/api/clients/:id/permanent',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const client = get('clients', id);
    if (!client) throw fail('Cliente não encontrado', 404);
    if (client.active) throw fail('Desative o cadastro antes da exclusão definitiva.', 400);

    const uploadedFiles = new Set();
    transaction(() => {
      const kinds = db.prepare('SELECT DISTINCT kind FROM records').all().map((row) => String(row.kind));
      for (const kind of kinds) {
        for (const record of all(kind)) {
          if (kind === 'clients' && String(record.id) === String(id)) {
            remove(kind, record.id);
          } else if (String(record.clientId || '') === String(id)) {
            if (kind === 'tickets') {
              for (const message of record.messages || []) {
                for (const attachment of message.files || message.attachments || []) {
                  if (attachment?.fileId) uploadedFiles.add(String(attachment.fileId));
                }
              }
            }
            if (kind === 'files' && (record.fileId || record.path || record.name)) {
              uploadedFiles.add(String(record.fileId || record.path || record.name));
            }
            remove(kind, record.id);
          }
        }
      }
      const users = db.prepare('SELECT id FROM users WHERE clientId = ?').all(String(id));
      for (const user of users) {
        db.prepare('DELETE FROM sessions WHERE userId = ?').run(user.id);
      }
      db.prepare('DELETE FROM users WHERE clientId = ?').run(String(id));
    });

    const uploadsRoot = path.resolve(dataDir, 'uploads');
    for (const fileId of uploadedFiles) {
      const diskFile = path.resolve(uploadsRoot, path.basename(fileId));
      if (diskFile.startsWith(`${uploadsRoot}${path.sep}`) && fs.existsSync(diskFile)) {
        try { fs.unlinkSync(diskFile); } catch { /* Keep the database deletion complete if a file is already gone. */ }
      }
    }

    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// Client account deletion workflow. The request is kept as a record until an
// administrator approves it, so the client data remains available for review.
app.post(
  '/api/account-deletion-requests',
  auth,
  wrap((req, res) => {
    if (req.user.role !== 'client' || !req.user.clientId) throw fail('Acesso exclusivo ao cliente.', 403);
    const client = get('clients', req.user.clientId);
    if (!client.active) throw fail('Esta conta já está desativada.', 400);
    const reason = text(req.body?.reason, 'Motivo da exclusão', 1000);
    if (reason.length < 5) throw fail('Informe um motivo com pelo menos 5 caracteres.', 400);

    const existing = all('account_deletion_requests')
      .filter((item) => String(item.clientId) === String(client.id) && item.status === 'pending')
      .sort((a, b) => String(b.requestedAt || b.createdAt).localeCompare(String(a.requestedAt || a.createdAt)))[0];
    if (existing) return res.json({ request: existing, existing: true });

    const request = put('account_deletion_requests', {
      id: uid(),
      clientId: String(client.id),
      clientCode: client.code,
      clientName: client.name,
      reason,
      status: 'pending',
      requestedAt: now()
    });
    audit(req.user, 'account_deletion_requests', request, `Solicitação de exclusão da conta ${client.code} recebida.`);
    put('notifications', {
      id: uid(),
      clientId: String(client.id),
      kind: 'account_deletion',
      recordId: request.id,
      recordCode: client.code,
      target: { screen: 'clients', detail: client.code },
      message: `Solicitação de exclusão da conta recebida de ${client.name}.`,
      audience: 'admin',
      read: false,
      readBy: []
    });
    broadcastEvent('reload');
    res.status(201).json({ request });
  })
);

app.patch(
  '/api/account-deletion-requests/:id/approve',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = String(req.params.id);
    const request = get('account_deletion_requests', id);
    if (request.status !== 'pending') throw fail('Esta solicitação já foi processada.', 400);
    const client = get('clients', request.clientId);

    transaction(() => {
      client.active = false;
      put('clients', client.id, client);
      db.prepare('UPDATE users SET active = 0 WHERE clientId = ?').run(String(client.id));
      put('account_deletion_requests', id, {
        ...request,
        status: 'approved',
        approvedAt: now(),
        approvedBy: req.user.id
      });
      for (const notification of all('notifications').filter((item) => item.kind === 'account_deletion' && String(item.recordId) === id && item.audience === 'admin')) {
        put('notifications', notification.id, { ...notification, read: true });
      }
    });
    audit(req.user, 'clients', client, `Exclusão da conta ${client.code} aprovada pelo administrador.`);
    broadcastEvent('reload');
    res.json({ ok: true, client });
  })
);

// Services
app.post(
  '/api/services',
  auth,
  adminAuth,
  wrap((req, res) => {
    const data = req.body;
    const id = next('services', 103);
    data.id = id;
    data.code = `SRV${id}`;
    data.active = true;
    data.price = cents(data.price);
    put('services', id, data);
    audit(req.user, 'services', data, `Serviço ${data.name} criado`);
    broadcastEvent('reload');
    res.json({ id });
  })
);

app.patch(
  '/api/services/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const serv = get('services', id);
    if (!serv) throw fail('Serviço não encontrado', 404);
    if (req.body.price !== undefined) req.body.price = cents(req.body.price);
    Object.assign(serv, req.body);
    put('services', id, serv);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// RPS
app.post(
  '/api/rps',
  auth,
  adminAuth,
  wrap((req, res) => {
    const data = req.body;
    const id = next('rps', 101);
    data.id = id;
    data.code = `RPS${id}`;
    data.active = true;
    put('rps', id, data);
    broadcastEvent('reload');
    res.json({ id });
  })
);

app.patch(
  '/api/rps/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const rps = get('rps', id);
    if (!rps) throw fail('Responsável não encontrado', 404);
    Object.assign(rps, req.body || {});
    put('rps', id, rps);
    audit(req.user, 'rps', rps, `Responsável ${rps.name} atualizado`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// Proposals
app.get(
  '/api/proposals',
  auth,
  wrap((req, res) => {
    const proposals = all('proposals').filter((proposal) =>
      req.user.role === 'admin' || String(proposal.clientId) === String(req.user.clientId)
    );
    const clients = all('clients');
    res.json(proposals.map(enrichProposalRevision).map((proposal) => ({
      ...proposal,
      clientName: proposal.clientName || clients.find((client) => String(client.id) === String(proposal.clientId))?.name || ''
    })));
  })
);

app.post(
  '/api/proposals',
  auth,
  adminAuth,
  wrap((req, res) => {
    const data = req.body;
    const id = next('proposals', 16);
    data.id = id;
    data.code = `PROP-2026-${String(id).padStart(4, '0')}`;
    data.status = 'Aguardando aceite';
    data.created = now();

    const serv = get('services', data.serviceId);
    if (!serv) throw fail('Serviço não encontrado', 404);

    const cData = commercial(data, serv);
    Object.assign(data, cData);
    data.service = { ...serv };

    put('proposals', id, data);
    audit(req.user, 'proposals', data, `Proposta ${data.code} criada`);
    notice(req.user, 'proposals', data, `Nova proposta disponível: ${data.title || data.code}`);
    broadcastEvent('reload');
    res.json({ id });
  })
);

app.patch(
  '/api/proposals/:id/accept',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const p = get('proposals', id);
    if (!p) throw fail('Proposta não encontrada', 404);
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(p.clientId)) throw fail('Acesso negado', 403);
    const acceptedAt = p.acceptedAt || now();
    p.status = 'Aceita';
    p.acceptedAt = acceptedAt;
    p.acceptedBy = p.acceptedBy || req.user.name;
    put('proposals', id, p);
    audit(req.user, 'proposals', p, `Proposta ${p.code} aceita pelo cliente em ${acceptedAt}`);
    notice(req.user, 'proposals', p, `A proposta ${p.code} foi aceita pelo cliente.`);
    broadcastEvent('reload');
    res.json({ ok: true, acceptedAt, acceptedBy: p.acceptedBy });
  })
);

app.patch(
  '/api/proposals/:id/reject',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const p = get('proposals', id);
    if (!p) throw fail('Proposta não encontrada', 404);
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(p.clientId)) throw fail('Acesso negado', 403);
    const reason = text(req.body?.reason, 'Motivo da recusa', 1000);
    p.status = 'Recusada';
    p.rejectionReason = reason;
    put('proposals', id, p);
    audit(req.user, 'proposals', p, `Proposta ${p.code} recusada: ${reason}`);
    notice(req.user, 'proposals', p, `A proposta ${p.code} foi recusada pelo cliente.`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.patch(
  '/api/proposals/:id/counteroffer',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const p = get('proposals', id);
    if (!p) throw fail('Proposta não encontrada', 404);
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(p.clientId)) throw fail('Acesso negado', 403);

    const { description, proposedValue } = req.body;
    if (!description || !description.trim()) throw fail('Informe o motivo da contraproposta.', 400);

    const nVal = Number(proposedValue);
    if (!Number.isFinite(nVal) || nVal <= 0) throw fail('Informe um valor proposto válido.', 400);
    const proposedCents = Math.round(nVal * 100);

    p.status = 'Em análise';
    p.counteroffer = {
      description: description.trim(),
      proposedValue: proposedCents,
      submittedAt: now(),
      userId: req.user.id,
      userName: req.user.name
    };

    put('proposals', id, p);
    audit(req.user, 'proposals', p, `Contraproposta enviada: R$ ${(proposedCents / 100).toFixed(2)}`);
    notice(req.user, 'proposals', p, `Contraproposta recebida na Proposta ${p.code}`);
    broadcastEvent('reload');
    res.json({ ok: true, message: 'Contraproposta enviada com sucesso.' });
  })
);

app.patch(
  '/api/proposals/:id/convert',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const p = get('proposals', id);
    if (!p) throw fail('Proposta não encontrada', 404);
    if (p.status !== 'Aceita') throw fail('Apenas propostas aceitas podem gerar um contrato.', 400);

    const body = req.body || {};
    const rawTotal = Number(body.total);
    const total = Number.isFinite(rawTotal) ? Math.max(0, Math.round(rawTotal)) : p.total;
    const term = body.term === 'indefinite' ? 'indefinite' : body.term === 'fixed' ? 'fixed' : (p.term || 'fixed');
    const clientName = typeof body.clientName === 'string' && body.clientName.trim()
      ? body.clientName.trim().slice(0, 200)
      : p.clientName;
    const serviceTitle = typeof body.serviceTitle === 'string' && body.serviceTitle.trim()
      ? body.serviceTitle.trim().slice(0, 240)
      : p.service?.name || p.title || '';

    const cid = next('contracts', 158);
    const contract = {
      id: cid,
      code: `CONT-2026-${String(cid).padStart(5, '0')}`,
      proposalId: id,
      clientId: p.clientId,
      clientName,
      serviceId: p.serviceId,
      service: p.service,
      serviceTitle,
      rpsId: p.rpsId,
      rpsName: p.rpsName,
      status: 'Pendente',
      created: now(),
      total,
      term,
      start: typeof body.start === 'string' && body.start ? body.start : (p.start || today()),
      end: term === 'indefinite' ? '' : (typeof body.end === 'string' ? body.end : (p.end || ''))
    };
    put('contracts', cid, contract);
    p.status = 'Convertida';
    put('proposals', id, p);

    audit(req.user, 'proposals', p, `Proposta ${p.code} convertida em Contrato ${contract.code}`);
    notice(req.user, 'proposals', p, `A proposta ${p.code} foi convertida em contrato ${contract.code}.`);
    broadcastEvent('reload');
    res.json({ id: cid });
  })
);

app.patch(
  '/api/proposals/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const proposal = get('proposals', id);
    if (!proposal) throw fail('Proposta não encontrada', 404);
    const body = req.body || {};
    const clientId = Number(body.clientId ?? proposal.clientId);
    const serviceId = Number(body.serviceId ?? proposal.serviceId);
    const client = get('clients', clientId);
    const service = get('services', serviceId);
    if (!client || !service) throw fail('Cliente ou serviço não encontrado', 404);

    const previous = { ...proposal };
    const revisionAt = now();
    const previousVersion = proposalRevisionSnapshot(previous, revisionAt);
    const revisionHistory = [
      ...(Array.isArray(proposal.revisionHistory) ? proposal.revisionHistory : []),
      { previous: previousVersion, revisedAt: revisionAt }
    ];
    const previousExtra = Number(proposal.extra || 0);
    const requestedExtra = body.extra ?? (previousExtra / 100);
    const requestedExtraCents = cents(requestedExtra);
    const revisionBase = body.base !== undefined
      ? body.base
      : Math.max(0, Number(proposal.total || 0) + requestedExtraCents - previousExtra);
    const commercialData = commercial({
      base: revisionBase / 100,
      extra: requestedExtra,
      extraName: body.extraName ?? proposal.extraName,
      discount: body.discount ?? body.discountInput ?? 0,
      discountType: body.discountType || proposal.discountType || 'fixed'
    }, service);
    Object.assign(proposal, commercialData, {
      clientId,
      serviceId,
      clientName: client.name,
      service: { ...service },
      title: String(body.title || service.name),
      description: String(body.description || service.description || ''),
      pdfFileName: body.pdfFileName || proposal.pdfFileName || '',
      status: 'Aguardando aceite',
      revised: true,
      revisedAt: revisionAt,
      previousVersion,
      revisionHistory,
      acceptedAt: null,
      acceptedBy: null,
      updated: revisionAt
    });
    put('proposals', id, proposal);
    audit(req.user, 'proposals', proposal, `Proposta ${proposal.code} revisada`, previous);
    notice(req.user, 'proposals', proposal, `A proposta ${proposal.code} foi revisada e está disponível para aceite.`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.patch(
  '/api/proposals/:id/cancel',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const proposal = get('proposals', id);
    if (!proposal) throw fail('Proposta não encontrada', 404);
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw fail('Informe o motivo do cancelamento.', 400);
    proposal.status = 'Cancelada';
    proposal.cancellationReason = reason;
    put('proposals', id, proposal);
    audit(req.user, 'proposals', proposal, `Proposta ${proposal.code} cancelada`);
    notice(req.user, 'proposals', proposal, `A proposta ${proposal.code} foi cancelada.`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.delete(
  '/api/proposals/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const proposal = get('proposals', id);
    if (!proposal) throw fail('Proposta não encontrada', 404);
    notice(req.user, 'proposals', proposal, `A proposta ${proposal.code} foi removida do sistema.`);
    audit(req.user, 'proposals', proposal, `Proposta ${proposal.code} excluída`);
    remove('proposals', id);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// Gov.br signature integration
const uploadsRoot = path.resolve(dataDir, 'uploads');

const uploadPathFor = (fileId) => {
  if (!fileId) return null;
  const candidate = path.resolve(uploadsRoot, path.basename(String(fileId)));
  return candidate.startsWith(`${uploadsRoot}${path.sep}`) ? candidate : null;
};

function sendDocumentVersion(req, res, version) {
  const diskFile = uploadPathFor(version.fileId);
  if (!diskFile || !fs.existsSync(diskFile)) throw fail('Arquivo não encontrado', 404);
  const fileName = String(version.fileName || path.basename(diskFile)).replace(/[\r\n"]/g, '');
  const extension = path.extname(fileName).toLowerCase();
  const contentType = extension === '.pdf' ? 'application/pdf'
    : extension === '.png' ? 'image/png'
      : ['.jpg', '.jpeg'].includes(extension) ? 'image/jpeg'
        : 'application/octet-stream';
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.sendFile(diskFile, (error) => {
    if (error && !res.headersSent) res.status(error.statusCode || 500).json({ error: 'Não foi possível visualizar o documento.' });
  });
}

const saveUploadBuffer = (buffer, extension) => {
  const fileName = `${uid()}${extension}`;
  fs.writeFileSync(path.join(uploadsRoot, fileName), buffer);
  return fileName;
};

// Proposal PDFs are stored as authenticated resources. Keeping the file id
// beside the proposal means the original PDF can be rendered later instead
// of being replaced by the generated summary preview.
app.post(
  '/api/proposals/:id/pdf',
  auth,
  adminAuth,
  upload.single('file'),
  wrap((req, res) => {
    if (!req.file) throw fail('Arquivo PDF obrigatório', 400);
    const id = Number(req.params.id);
    const proposal = get('proposals', id);
    const mime = String(req.file.mimetype || '').toLowerCase();
    const extension = path.extname(req.file.originalname || '').toLowerCase();
    if (mime !== 'application/pdf' && extension !== '.pdf') {
      fs.rmSync(req.file.path, { force: true });
      throw fail('O anexo da proposta deve ser um PDF.', 400);
    }

    const previousPath = uploadPathFor(proposal.pdfFileId);
    if (previousPath && previousPath !== req.file.path) fs.rmSync(previousPath, { force: true });
    proposal.pdfFileId = req.file.filename;
    proposal.pdfFileName = req.file.originalname || `${proposal.code || 'proposta'}.pdf`;
    proposal.pdfMimeType = 'application/pdf';
    proposal.pdfSize = req.file.size;
    proposal.pdfUpdatedAt = now();
    put('proposals', id, proposal);
    audit(req.user, 'proposals', proposal, `PDF anexado à proposta ${proposal.code}`);
    broadcastEvent('reload');
    res.json({ ok: true, fileId: proposal.pdfFileId, fileName: proposal.pdfFileName });
  })
);

app.get(
  '/api/proposals/:id/pdf',
  auth,
  wrap((req, res) => {
    const proposal = get('proposals', Number(req.params.id));
    if (req.user.role !== 'admin' && String(proposal.clientId) !== String(req.user.clientId)) {
      throw fail('Acesso negado', 403);
    }
    const diskFile = uploadPathFor(proposal.pdfFileId);
    if (!diskFile || !fs.existsSync(diskFile)) throw fail('PDF anexado não encontrado.', 404);
    const fileName = String(proposal.pdfFileName || `${proposal.code || 'proposta'}.pdf`).replace(/[\r\n"]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(diskFile);
  })
);

const generatedContractPdf = (contract) => new Promise((resolve, reject) => {
  const document = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks = [];
  document.on('data', (chunk) => chunks.push(chunk));
  document.on('end', () => resolve(Buffer.concat(chunks)));
  document.on('error', reject);
  document.fontSize(20).fillColor('#2563eb').text('GSA HUB', { align: 'center' });
  document.moveDown(0.4);
  document.fontSize(16).fillColor('#0f172a').text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', { align: 'center' });
  document.moveDown(1.5);
  document.fontSize(11).fillColor('#334155');
  document.text(`Contrato: ${contract.code || '—'}`);
  document.text(`Cliente: ${contract.clientName || contract.client?.name || '—'}`);
  document.text(`Serviço: ${contract.service?.name || contract.serviceTitle || '—'}`);
  document.text(`Início: ${contract.start || '—'}`);
  document.text(`Término: ${contract.end || 'Indeterminado'}`);
  document.text(`Valor contratado: R$ ${(Number(contract.total || 0) / 100).toFixed(2).replace('.', ',')}`);
  document.moveDown(1.5);
  document.fontSize(12).fillColor('#0f172a').text('Condições contratuais');
  document.moveDown(0.5);
  document.fontSize(10).fillColor('#475569').text(
    'Este documento representa o contrato emitido pelo GSA HUB. A assinatura eletrônica será aplicada ao hash SHA-256 deste arquivo pela API oficial de Assinatura Eletrônica Gov.br.'
  );
  document.moveDown(2);
  document.fontSize(10).fillColor('#64748b').text('Documento gerado eletronicamente pelo GSA HUB.', { align: 'center' });
  document.end();
});

const contractPdfForSignature = async (contract) => {
  const existingPath = uploadPathFor(contract.fileId);
  if (existingPath && fs.existsSync(existingPath)) {
    return {
      buffer: fs.readFileSync(existingPath),
      fileId: path.basename(existingPath),
      fileName: contract.fileName || `${contract.code}.pdf`
    };
  }
  const buffer = await generatedContractPdf(contract);
  return {
    buffer,
    fileId: saveUploadBuffer(buffer, '.pdf'),
    fileName: contract.fileName || `${contract.code}.pdf`
  };
};

const govbrContractRedirect = (contractCode, result) => {
  const pathName = contractCode
    ? `${publicBasePath}/cliente/contratos/${encodeURIComponent(String(contractCode))}`
    : `${publicBasePath}/cliente/contratos`;
  return `${pathName}?govbr_signature=${encodeURIComponent(result)}`;
};

const readResponsePayload = async (response) => {
  const raw = await response.text();
  try {
    return { data: raw ? JSON.parse(raw) : {}, raw };
  } catch {
    return { data: {}, raw };
  }
};

app.get(
  '/api/contracts/:id/pdf',
  auth,
  wrap(async (req, res) => {
    const contract = get('contracts', Number(req.params.id));
    if (req.user.role !== 'admin' && String(contract.clientId) !== String(req.user.clientId)) throw fail('Acesso negado', 403);
    const sourcePdf = await contractPdfForSignature(contract);
    if (contract.fileId !== sourcePdf.fileId || contract.fileName !== sourcePdf.fileName) {
      contract.fileId = sourcePdf.fileId;
      contract.fileName = sourcePdf.fileName;
      put('contracts', contract.id, contract);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${String(contract.code || 'contrato').replace(/[^a-zA-Z0-9_.-]/g, '_')}.pdf"`);
    res.send(sourcePdf.buffer);
  })
);

app.get(
  '/api/govbr/signature/start/:contractId',
  auth,
  wrap((req, res) => {
    if (req.user.role !== 'client') throw fail('A assinatura Gov.br deve ser iniciada pelo cliente.', 403);
    const config = govbrSignatureConfig();
    if (!govbrSignatureConfigured(config)) {
      throw fail('A integração Gov.br ainda não foi configurada no servidor. Informe as credenciais e a URL de retorno cadastrada.', 503);
    }

    const contract = get('contracts', Number(req.params.contractId));
    if (String(contract.clientId) !== String(req.user.clientId)) throw fail('Acesso negado', 403);
    if (contract.status === 'Assinado' && contract.signatureMethod === 'gov.br') {
      throw fail('Este contrato já foi assinado digitalmente.', 409);
    }

    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(24).toString('hex');
    govbrSignatureRequests.set(state, {
      createdAt: Date.now(),
      nonce,
      userId: req.user.id,
      userName: req.user.name,
      clientId: req.user.clientId,
      contractId: contract.id,
      contractCode: contract.code
    });

    const authorizationUrl = new URL(config.authorizeUrl);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', config.clientId);
    authorizationUrl.searchParams.set('scope', config.scope);
    authorizationUrl.searchParams.set('redirect_uri', config.redirectUri);
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('nonce', nonce);

    res.json({ authorizationUrl: authorizationUrl.toString() });
  })
);

app.get(
  '/api/govbr/signature/callback',
  wrap(async (req, res) => {
    const state = String(req.query.state || '');
    const pending = state ? govbrSignatureRequests.get(state) : null;
    if (state) govbrSignatureRequests.delete(state);
    if (!pending) return res.redirect(govbrContractRedirect('', 'error'));

    const successRedirect = govbrContractRedirect(pending.contractCode, 'success');

    try {
      if (req.query.error) throw new Error('A autorização Gov.br foi cancelada.');
      const code = String(req.query.code || '');
      if (!code) throw new Error('O retorno da autorização Gov.br não trouxe um código.');

      const config = govbrSignatureConfig();
      if (!govbrSignatureConfigured(config)) throw new Error('Integração Gov.br não configurada.');

      const tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri
        })
      });
      const tokenPayload = await readResponsePayload(tokenResponse);
      if (!tokenResponse.ok || !tokenPayload.data?.access_token) {
        console.error(`[Gov.br] token exchange failed with HTTP ${tokenResponse.status}`);
        throw new Error('Não foi possível obter a autorização de assinatura Gov.br.');
      }

      // Follow the official flow by obtaining the user's public certificate
      // before requesting the PKCS#7 package. The certificate is public, but
      // it is not persisted here because the returned package already carries
      // the certificate needed for detached-signature validation.
      const certificateResponse = await fetch(`${config.apiBaseUrl}/externo/v2/certificadoPublico`, {
        headers: { Authorization: `Bearer ${tokenPayload.data.access_token}`, Accept: 'application/x-pem-file,text/plain' }
      });
      const certificateBody = await certificateResponse.text();
      if (!certificateResponse.ok || !certificateBody.trim()) {
        console.error(`[Gov.br] public certificate failed with HTTP ${certificateResponse.status}`);
        const certificateError = new Error('A API Gov.br não liberou o certificado para assinatura.');
        if (certificateResponse.status === 403 && /(bronze|prata|ouro)/i.test(certificateBody)) certificateError.redirectResult = 'upgrade';
        throw certificateError;
      }

      const contract = get('contracts', Number(pending.contractId));
      if (String(contract.clientId) !== String(pending.clientId)) throw new Error('Contrato não pertence ao cliente autorizado.');

      const sourcePdf = await contractPdfForSignature(contract);
      const hashBase64 = crypto.createHash('sha256').update(sourcePdf.buffer).digest('base64');
      const signatureResponse = await fetch(`${config.apiBaseUrl}/externo/v2/assinarPKCS7`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenPayload.data.access_token}`,
          'Content-Type': 'application/json',
          Accept: 'application/octet-stream'
        },
        body: JSON.stringify({ hashBase64 })
      });
      const signatureRaw = Buffer.from(await signatureResponse.arrayBuffer());
      if (!signatureResponse.ok || !signatureRaw.length) {
        console.error(`[Gov.br] PKCS#7 signing failed with HTTP ${signatureResponse.status}`);
        const providerMessage = signatureRaw.toString('utf8').toLowerCase();
        const signatureError = new Error('A API Gov.br não concluiu a assinatura do contrato.');
        if (signatureResponse.status === 403 && /(bronze|prata|ouro)/i.test(providerMessage)) signatureError.redirectResult = 'upgrade';
        throw signatureError;
      }

      let signatureBuffer = signatureRaw;
      const contentType = String(signatureResponse.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        try {
          const payload = JSON.parse(signatureRaw.toString('utf8'));
          const encoded = payload.signatureBase64 || payload.pkcs7Base64 || payload.data;
          if (encoded) signatureBuffer = Buffer.from(String(encoded), 'base64');
        } catch {
          // The documented response is binary PKCS#7; preserve it as returned.
        }
      }
      if (!signatureBuffer.length) throw new Error('A resposta de assinatura Gov.br veio vazia.');

      const signatureFileId = saveUploadBuffer(signatureBuffer, '.p7s');
      const actor = { id: pending.userId, name: pending.userName || 'Cliente', role: 'client' };
      Object.assign(contract, {
        fileId: sourcePdf.fileId,
        fileName: sourcePdf.fileName,
        signedFileId: sourcePdf.fileId,
        signedFileName: sourcePdf.fileName,
        signedSignatureFileId: signatureFileId,
        signedSignatureFileName: `${contract.code}.p7s`,
        signatureMethod: 'gov.br',
        signatureType: 'detached',
        signatureHashAlgorithm: 'SHA-256',
        signatureHashBase64: hashBase64,
        signedAt: now(),
        status: 'Assinado'
      });
      put('contracts', contract.id, contract);
      audit(actor, 'contracts', contract, `Contrato ${contract.code} assinado digitalmente via Gov.br`);
      notice(actor, 'contracts', contract, `O contrato ${contract.code} foi assinado digitalmente via Gov.br.`);
      broadcastEvent('reload');
      return res.redirect(successRedirect);
    } catch (error) {
      console.error('[Gov.br] signature callback failed:', error?.message || error);
      return res.redirect(govbrContractRedirect(pending.contractCode, error?.redirectResult || 'error'));
    }
  })
);

// Contracts
app.get(
  '/api/contracts',
  auth,
  wrap((req, res) => {
    const cons = all('contracts');
    const visible = req.user.role === 'admin'
      ? cons
      : cons.filter((c) => String(c.clientId) === String(req.user.clientId));
    const clients = all('clients');
    const services = all('services');
    res.json(visible.map((contract) => ({
      ...contract,
      client: contract.client || clients.find((client) => String(client.id) === String(contract.clientId)) || null,
      service: contract.service || services.find((service) => String(service.id) === String(contract.serviceId)) || null
    })));
  })
);

app.post(
  '/api/contracts',
  auth,
  adminAuth,
  wrap((req, res) => {
    const data = req.body;
    const proposalId = Number(data?.proposalId);
    const proposal = Number.isFinite(proposalId) ? get('proposals', proposalId) : null;
    if (!proposal || proposal.status !== 'Aceita') {
      throw fail('Apenas propostas aceitas podem gerar um contrato.', 400);
    }
    if (all('contracts').some((contract) => String(contract.proposalId) === String(proposal.id))) {
      throw fail('Esta proposta já foi convertida em contrato.', 409);
    }
    const id = next('contracts', 158);
    data.id = id;
    data.code = `CONT-2026-${String(id).padStart(5, '0')}`;
    data.created = now();
    data.status = data.status || 'Pendente';
    put('contracts', id, data);
    audit(req.user, 'contracts', data, `Contrato ${data.code} criado`);
    broadcastEvent('reload');
    res.json({ id });
  })
);

app.patch(
  '/api/contracts/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const contract = get('contracts', id);
    if (!contract) throw fail('Contrato não encontrado', 404);
    Object.assign(contract, req.body || {});
    put('contracts', id, contract);
    audit(req.user, 'contracts', contract, `Contrato ${contract.code} atualizado`);
    broadcastEvent('reload');
    res.json({ ok: true, contract });
  })
);

app.delete(
  '/api/contracts/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const contract = get('contracts', id);
    if (!contract) throw fail('Contrato não encontrado', 404);
    const proposal = contract.proposalId ? get('proposals', Number(contract.proposalId)) : null;
    audit(req.user, 'contracts', contract, `Contrato ${contract.code} excluído`);
    remove('contracts', id);
    if (proposal && proposal.status === 'Convertida') {
      proposal.status = 'Aceita';
      put('proposals', proposal.id, proposal);
      audit(req.user, 'proposals', proposal, `Proposta ${proposal.code} liberada novamente após a exclusão do contrato ${contract.code}`);
    }
    broadcastEvent('reload');
    res.json({ ok: true, proposalId: proposal?.id || null, proposalStatus: proposal?.status || null });
  })
);

app.patch(
  '/api/contracts/:id/sign',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const c = get('contracts', id);
    if (!c) throw fail('Contrato não encontrado', 404);
    c.status = 'Assinado';
    put('contracts', id, c);
    audit(req.user, 'contracts', c, `Contrato ${c.code} marcado como assinado`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.post(
  '/api/contracts/:id/upload',
  auth,
  upload.single('file'),
  wrap((req, res) => {
    if (!req.file) throw fail('Arquivo obrigatório', 400);
    const id = Number(req.params.id);
    const c = get('contracts', id);
    if (!c) throw fail('Contrato não encontrado', 404);
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(c.clientId)) throw fail('Acesso negado', 403);

    c.signedFileId = req.file.filename;
    c.signedFileName = req.file.originalname;
    c.status = req.user.role === 'admin' ? 'Assinado' : 'Em análise';
    c.signedAt = now();
    put('contracts', id, c);
    audit(req.user, 'contracts', c, `Contrato assinado enviado`);
    broadcastEvent('reload');
    res.json({ ok: true, fileId: req.file.filename });
  })
);

// Orders (OS)
app.post(
  '/api/orders',
  auth,
  adminAuth,
  wrap((req, res) => {
    const data = req.body;
    const id = next('orders', 106);
    data.id = id;
    data.code = `OS${id}`;
    data.created = now();
    data.status = data.status || 'Em andamento';
    data.stages = data.stages || [];
    put('orders', id, data);
    audit(req.user, 'orders', data, `Ordem de Serviço ${data.code} criada`);
    notice(req.user, 'orders', data, `Nova Ordem de Serviço criada: ${data.code}`);
    broadcastEvent('reload');
    res.json({ id });
  })
);

app.patch(
  '/api/orders/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const o = get('orders', id);
    if (!o) throw fail('Ordem de Serviço não encontrada', 404);
    Object.assign(o, req.body);
    put('orders', id, o);
    audit(req.user, 'orders', o, `Ordem de Serviço ${o.code} atualizada`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.patch(
  '/api/orders/:id/stages',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const o = get('orders', id);
    if (!o) throw fail('Ordem de Serviço não encontrada', 404);
    o.stages = req.body.stages || [];
    put('orders', id, o);
    audit(req.user, 'orders', o, `Fluxo de etapas da ${o.code} atualizado`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// Invoices
app.post(
  '/api/invoices',
  auth,
  adminAuth,
  wrap((req, res) => {
    const { clientId, orderId, title, total, installments: count, first } = req.body;
    const totalCents = cents(total);
    const insts = installments(totalCents, count || 1, first || today());

    const id = next('invoices', 202);
    const invoice = {
      id,
      code: `FAT${id}`,
      clientId,
      orderId,
      title: title || 'Fatura de serviços',
      total: totalCents,
      originalTotal: totalCents,
      created: now(),
      status: 'Pendente',
      installments: insts.map((inst, i) => ({
        id: i + 1,
        number: inst.number,
        due: inst.due,
        amount: inst.amount,
        status: 'Pendente'
      })),
      payments: [],
      changes: []
    };

    put('invoices', id, invoice);
    audit(req.user, 'invoices', invoice, `Fatura ${invoice.code} emitida`);
    broadcastEvent('reload');
    res.json({ id });
  })
);

app.patch(
  '/api/invoices/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const invoice = get('invoices', id);
    if (!invoice) throw fail('Fatura não encontrada', 404);
    const body = req.body || {};
    for (const field of ['title', 'due', 'total', 'originalTotal', 'status', 'installments', 'discountHistory', 'surchargeHistory', 'renegotiationHistory', 'changes']) {
      if (body[field] !== undefined) invoice[field] = body[field];
    }
    put('invoices', id, invoice);
    audit(req.user, 'invoices', invoice, `Fatura ${invoice.code} atualizada`);
    broadcastEvent('reload');
    res.json({ ok: true, invoice });
  })
);

app.delete(
  '/api/invoices/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const invoice = get('invoices', id);
    if (!invoice) throw fail('Fatura não encontrada', 404);
    audit(req.user, 'invoices', invoice, `Fatura ${invoice.code} excluída`);
    remove('invoices', id);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.patch(
  '/api/invoices/:id/pay/:installment',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const instId = Number(req.params.installment);
    const inv = get('invoices', id);
    if (!inv) throw fail('Fatura não encontrada', 404);

    const inst = inv.installments?.find((i) => Number(i.id) === instId);
    if (!inst) throw fail('Parcela não encontrada', 404);

    const target = Math.max(0, Number(inst.amount) - Number(inst.paidAmount || 0));
    if (!target) throw fail('Esta parcela já foi quitada.', 409);
    const body = req.body || {};
    const externalAmount = body.amount === undefined ? target : Math.round(Number(body.amount));
    const availableWallet = Math.max(0, walletBalanceFor(inv.clientId));
    const requestedWallet = Math.max(0, Math.round(Number(body.walletAmount || 0)));
    const walletAmount = Math.min(requestedWallet, availableWallet);
    const received = externalAmount + walletAmount;
    if (!Number.isSafeInteger(externalAmount) || externalAmount < 0 || !Number.isSafeInteger(received) || received <= 0) throw fail('Valor recebido inválido.', 400);

    const at = body.date && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date))
      ? `${body.date}T${new Date().toTimeString().slice(0, 8)}`
      : now();
    const applied = Math.min(target, received);
    const remaining = target - applied;
    const credit = Math.max(0, received - target);
    const payment = {
      at,
      amount: received,
      method: String(body.method || 'Pix'),
      installments: Math.max(1, Number(body.installments) || 1),
      installment: instId,
      walletAmount,
      credit
    };
    inst.paidAmount = Number(inst.paidAmount || 0) + applied;
    inst.paidAt = at;
    inst.paymentMethod = payment.method;
    inst.paymentInstallments = payment.installments;
    inst.status = inst.paidAmount >= Number(inst.amount) ? 'Pago' : 'Pendente';
    inv.payments = [...(inv.payments || []), payment];
    inv.paymentHistory = [...(inv.paymentHistory || []), payment];
    inv.status = inv.installments.every((item) => item.status === 'Pago')
      ? 'Pago'
      : inv.installments.some((item) => Number(item.paidAmount || 0) > 0) ? 'Parcial' : 'Pendente';

    if (walletAmount > 0) {
      recordWalletEntry(inv.clientId, 'Débito', walletAmount, `Saldo da carteira — abatimento da baixa da fatura ${inv.code}`, at);
    }
    if (credit > 0) {
      recordWalletEntry(inv.clientId, 'Crédito', credit, `Saldo da carteira — crédito excedente da baixa da fatura ${inv.code}`, at);
    }
    if (remaining > 0 && body.walletRemainder === 'debit') {
      recordWalletEntry(inv.clientId, 'Débito', remaining, `Saldo da carteira — débito referente ao saldo restante da fatura ${inv.code}`, at);
    }

    put('invoices', id, inv);
    audit(req.user, 'invoices', inv, `Baixa da parcela ${instId} da ${inv.code}; recebido ${received} centavos`);
    notice(req.user, 'invoices', inv, `Pagamento registrado na fatura ${inv.code}.`);
    broadcastEvent('reload');
    res.json({ ok: true, invoice: inv, remaining, credit, walletAmount });
  })
);

app.post(
  '/api/invoices/:id/renegotiate',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const { interest, penalty, discount, due } = req.body;
    const inv = get('invoices', id);
    if (!inv) throw fail('Fatura não encontrada', 404);

    const nInterest = cents(interest || 0);
    const nPenalty = cents(penalty || 0);
    const nDiscount = cents(discount || 0);
    const baseTotal = inv.originalTotal || inv.total;

    const newTotal = baseTotal + nInterest + nPenalty - nDiscount;
    inv.total = newTotal;
    inv.status = 'Pendente';
    inv.installments = [
      {
        id: 1,
        number: 1,
        due: date(due),
        amount: newTotal,
        status: 'Pendente'
      }
    ];

    inv.changes = inv.changes || [];
    inv.changes.push({
      date: now(),
      type: 'Renegociação',
      previous: baseTotal,
      current: newTotal,
      interest: nInterest,
      penalty: nPenalty,
      discount: nDiscount
    });

    put('invoices', id, inv);
    audit(req.user, 'invoices', inv, `Fatura ${inv.code} renegociada para vencimento em ${due}`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// Operational tasks
app.get(
  '/api/tasks',
  auth,
  adminAuth,
  wrap((req, res) => res.json(all('tasks')))
);

app.post(
  '/api/tasks',
  auth,
  adminAuth,
  wrap((req, res) => {
    const body = req.body || {};
    const task = put('tasks', {
      id: next('tasks', 1),
      title: text(body.title, 'Tarefa operacional'),
      orderId: body.orderId ? Number(body.orderId) : null,
      orderCode: text(body.orderCode, ''),
      clientId: body.clientId ? Number(body.clientId) : null,
      clientName: text(body.clientName, ''),
      assignee: text(body.assignee, ''),
      priority: ['Alta', 'Normal', 'Urgente'].includes(body.priority) ? body.priority : 'Normal',
      status: ['todo', 'in_progress', 'done'].includes(body.status) ? body.status : 'todo',
      deadline: text(body.deadline, ''),
      observations: String(body.observations || '').trim().slice(0, 500)
    });
    audit(req.user, 'tasks', task, `Tarefa ${task.id} criada.`);
    broadcastEvent('reload');
    res.json(task);
  })
);

app.patch(
  '/api/tasks/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = String(req.params.id);
    const task = get('tasks', id);
    const body = req.body || {};
    const nextStatus = body.status === undefined ? task.status : body.status;
    if (!['todo', 'in_progress', 'done'].includes(nextStatus)) throw fail('Status de tarefa inválido', 400);
    const updated = put('tasks', id, {
      ...task,
      ...body,
      id,
      status: nextStatus,
      title: text(body.title ?? task.title, 'Tarefa operacional'),
      priority: ['Alta', 'Normal', 'Urgente'].includes(body.priority ?? task.priority) ? (body.priority ?? task.priority) : 'Normal'
    });
    audit(req.user, 'tasks', updated, `Tarefa ${updated.id} atualizada.`);
    broadcastEvent('reload');
    res.json(updated);
  })
);

app.delete(
  '/api/tasks/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = String(req.params.id);
    const task = get('tasks', id);
    remove('tasks', id);
    audit(req.user, 'tasks', task, `Tarefa ${task.id} excluída.`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// Calendar events are persisted operational records in production. System
// events can be derived from orders while manual agenda entries use this API.
app.get(
  '/api/calendar-events',
  auth,
  adminAuth,
  wrap((req, res) => res.json(all('calendar_events')))
);

app.post(
  '/api/calendar-events',
  auth,
  adminAuth,
  wrap((req, res) => {
    const body = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))) throw fail('Informe uma data válida.', 400);
    const event = put('calendar_events', {
      id: next('calendar_events', 1),
      orderCode: text(body.orderCode, 'AGENDA'),
      clientName: text(body.clientName, 'Sem cliente'),
      title: text(body.title, 'Novo agendamento'),
      date: String(body.date),
      time: String(body.time || '').trim().slice(0, 5),
      rps: text(body.rps, 'Administrativo'),
      type: ['stage_deadline', 'recurrent_agenda', 'client_meeting'].includes(body.type) ? body.type : 'client_meeting',
      status: ['pending', 'completed', 'critical'].includes(body.status) ? body.status : 'pending',
      source: 'manual',
      description: String(body.description || '').trim().slice(0, 500)
    });
    audit(req.user, 'calendar_events', event, `Evento ${event.id} criado.`);
    broadcastEvent('reload');
    res.json(event);
  })
);

app.patch(
  '/api/calendar-events/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = String(req.params.id);
    const event = get('calendar_events', id);
    const body = req.body || {};
    const dateValue = body.date ?? event.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))) throw fail('Informe uma data válida.', 400);
    const updated = put('calendar_events', id, {
      ...event,
      ...body,
      id,
      date: String(dateValue),
      title: text(body.title ?? event.title, 'Novo agendamento'),
      status: ['pending', 'completed', 'critical'].includes(body.status ?? event.status) ? (body.status ?? event.status) : event.status,
      description: String(body.description ?? event.description ?? '').trim().slice(0, 500)
    });
    audit(req.user, 'calendar_events', updated, `Evento ${updated.id} atualizado.`);
    broadcastEvent('reload');
    res.json(updated);
  })
);

app.delete(
  '/api/calendar-events/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = String(req.params.id);
    const event = get('calendar_events', id);
    remove('calendar_events', id);
    audit(req.user, 'calendar_events', event, `Evento ${event.id} excluído.`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// Tickets
app.post(
  '/api/tickets',
  auth,
  wrap((req, res) => {
    const data = req.body;
    const id = next('tickets', 501);
    const ticket = {
      id,
      code: `TCK${id}`,
      clientId: req.user.role === 'admin' ? data.clientId : req.user.clientId,
      orderId: data.orderId || null,
      title: text(data.title, 'Título do chamado'),
      status: 'Aberto',
      created: now(),
      messages: [
        {
          id: Date.now(),
          author: req.user.name,
          role: req.user.role,
          text: req.body.initialMessage || 'Chamado aberto.',
          files: [],
          internal: false,
          at: now()
        }
      ]
    };
    put('tickets', id, ticket);
    notice(req.user, 'tickets', ticket, `Novo chamado ${ticket.code} recebido: ${ticket.title}`);
    broadcastEvent('reload');
    res.json({ id });
  })
);

app.post(
  '/api/tickets/:id/message',
  auth,
  upload.array('attachments', 5),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const t = get('tickets', id);
    if (!t) throw fail('Chamado não encontrado', 404);
    t.code = t.code || `TCK${id}`;
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(t.clientId)) throw fail('Acesso negado', 403);
    const isInternal = req.body.internal === true || req.body.internal === 'true' || req.body.internal === '1';
    if (isInternal && req.user.role !== 'admin') throw fail('Notas internas são restritas à administração', 403);

    const legacyFiles = Array.isArray(req.body.files)
      ? req.body.files
      : req.body.files
        ? [req.body.files]
        : [];
    const uploadedFiles = (req.files || []).map((file) => ({
      id: file.filename,
      fileId: file.filename,
      name: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: `/api/tickets/${id}/attachments/${encodeURIComponent(file.filename)}`,
      viewUrl: `/api/tickets/${id}/attachments/${encodeURIComponent(file.filename)}/view`
    }));
    const attachments = [
      ...legacyFiles.map((file) => typeof file === 'string' ? { name: file } : file),
      ...uploadedFiles
    ];

    const msg = {
      id: Date.now(),
      author: req.user.name,
      role: req.user.role,
      text: String(req.body.text || ''),
      files: attachments,
      internal: isInternal,
      at: now()
    };
    t.messages = t.messages || [];
    t.messages.push(msg);
    put('tickets', id, t);
    // Internal notes stay inside the administrative workspace. Every regular
    // message creates a notification for the other side of the conversation.
    if (!msg.internal && (msg.text.trim() || attachments.length)) {
      notice(req.user, 'tickets', t, `${req.user.role === 'admin' ? 'Nova resposta no chamado' : 'Nova mensagem do cliente no chamado'} ${t.code}`);
    }
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.get(
  '/api/tickets/:id/attachments/:fileId/view',
  auth,
  wrap((req, res) => {
    const ticket = get('tickets', Number(req.params.id));
    if (!ticket) throw fail('Chamado não encontrado', 404);
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(ticket.clientId)) throw fail('Acesso negado', 403);

    const requestedFileId = String(req.params.fileId || '');
    const attachment = (ticket.messages || [])
      .flatMap((message) => Array.isArray(message.files) ? message.files : [])
      .find((file) => String(file?.fileId || file?.id || '') === requestedFileId);
    if (!attachment) throw fail('Anexo não encontrado', 404);

    const uploadsRoot = path.resolve(dataDir, 'uploads');
    const diskFile = path.resolve(uploadsRoot, path.basename(requestedFileId));
    if (!diskFile.startsWith(`${uploadsRoot}${path.sep}`) || !fs.existsSync(diskFile)) {
      throw fail('Arquivo não encontrado', 404);
    }

    const fileName = String(attachment.name || requestedFileId).replace(/[\r\n"]/g, '');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.sendFile(diskFile, (error) => {
      if (error && !res.headersSent) res.status(error.statusCode || 500).json({ error: 'Não foi possível visualizar o anexo.' });
    });
  })
);

app.get(
  '/api/tickets/:id/attachments/:fileId',
  auth,
  wrap((req, res) => {
    const ticket = get('tickets', Number(req.params.id));
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(ticket.clientId)) throw fail('Acesso negado', 403);
    const requestedFileId = String(req.params.fileId || '');
    const attachment = (ticket.messages || [])
      .flatMap((message) => Array.isArray(message.files) ? message.files : [])
      .find((file) => String(file?.fileId || file?.id || '') === requestedFileId);
    if (!attachment) throw fail('Anexo não encontrado', 404);

    const uploadsRoot = path.resolve(dataDir, 'uploads');
    const diskFile = path.resolve(uploadsRoot, path.basename(requestedFileId));
    if (!diskFile.startsWith(`${uploadsRoot}${path.sep}`) || !fs.existsSync(diskFile)) {
      throw fail('Arquivo não encontrado', 404);
    }
    res.download(diskFile, String(attachment.name || requestedFileId), (error) => {
      if (error && !res.headersSent) res.status(error.statusCode || 500).json({ error: 'Não foi possível abrir o anexo.' });
    });
  })
);

app.patch(
  '/api/tickets/:id',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const ticket = get('tickets', id);
    const allowedStatuses = ['Aberto', 'Em atendimento', 'Resolvido'];
    if (!allowedStatuses.includes(req.body.status)) throw fail('Status de chamado inválido', 400);
    const previousStatus = ticket.status;
    ticket.status = req.body.status;
    put('tickets', id, ticket);
    audit(req.user, 'tickets', ticket, `Chamado ${ticket.code || id} atualizado para ${ticket.status}`, { status: previousStatus });
    if (previousStatus !== ticket.status) {
      notice(req.user, 'tickets', ticket, `Atualização do chamado ${ticket.code || id}: ${ticket.status}`);
    }
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// Documents & Versions
app.post(
  '/api/documents',
  auth,
  adminAuth,
  wrap((req, res) => {
    const data = req.body;
    const id = next('documents', 401);
    data.id = id;
    data.created = now();
    data.status = 'Aguardando envio';
    data.versions = [];
    put('documents', id, data);
    notice(req.user, 'documents', data, `Documento solicitado: ${data.title}`);
    broadcastEvent('reload');
    res.json({ id });
  })
);

app.post(
  '/api/documents/:id/upload',
  auth,
  upload.single('file'),
  wrap((req, res) => {
    if (!req.file) throw fail('Arquivo obrigatório', 400);
    const id = Number(req.params.id);
    const doc = get('documents', id);
    if (!doc) throw fail('Documento não encontrado', 404);
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(doc.clientId)) {
      throw fail('Acesso negado', 403);
    }

    doc.status = 'Em análise';
    doc.versions = doc.versions || [];
    doc.versions.push({
      id: Date.now(),
      fileId: req.file.filename,
      fileName: req.file.originalname,
      date: now(),
      status: 'Em análise',
      userId: req.user.id
    });

    put('documents', id, doc);
    audit(req.user, 'documents', doc, `Documento ${doc.title} enviado para análise`);
    broadcastEvent('reload');
    res.json({ ok: true, fileId: req.file.filename, fileName: req.file.originalname });
  })
);

app.get(
  '/api/documents/:id/files/:fileId/view',
  auth,
  wrap((req, res) => {
    const document = get('documents', Number(req.params.id));
    if (!document) throw fail('Solicitação não encontrada', 404);
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(document.clientId)) throw fail('Acesso negado', 403);
    const version = (document.versions || []).find((item) => String(item.fileId) === String(req.params.fileId));
    if (!version) throw fail('Arquivo não encontrado', 404);
    sendDocumentVersion(req, res, version);
  })
);

app.get(
  '/api/personal-documents/:id/files/:fileId/view',
  auth,
  wrap((req, res) => {
    const document = get('personal_documents', req.params.id);
    if (!document) throw fail('Solicitação não encontrada', 404);
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(document.clientId)) throw fail('Acesso negado', 403);
    const version = (document.versions || []).find((item) => String(item.fileId) === String(req.params.fileId));
    if (!version) throw fail('Arquivo não encontrado', 404);
    sendDocumentVersion(req, res, version);
  })
);

app.patch(
  '/api/documents/:id/approve',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const doc = get('documents', id);
    if (!doc) throw fail('Documento não encontrado', 404);
    doc.status = 'Aprovado';
    put('documents', id, doc);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

app.patch(
  '/api/documents/:id/reject',
  auth,
  adminAuth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const doc = get('documents', id);
    if (!doc) throw fail('Documento não encontrado', 404);
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw fail('Informe o motivo da reprovação.', 400);
    doc.status = 'Rejeitado';
    doc.rejectionReason = reason;
    put('documents', id, doc);
    audit(req.user, 'documents', doc, `Documento ${doc.title} rejeitado`);
    notice(req.user, 'documents', doc, `Documento ${doc.title} precisa ser reenviado.`);
    broadcastEvent('reload');
    res.json({ ok: true });
  })
);

// Notifications
const notificationTarget = (notification) => {
  if (notification?.target?.screen) return notification.target;
  const screen = {
    proposals: 'proposals',
    contracts: 'contracts',
    orders: 'orders',
    documents: 'documents',
    invoices: 'finance',
    payments: 'finance',
    finance: 'finance',
    tickets: 'support',
    support: 'support'
  }[notification?.kind];
  if (!screen) return null;
  const recordId = notification?.recordId == null ? '' : String(notification.recordId);
  return {
    screen,
    detail: notification?.recordCode || notification?.code || (notification.kind === 'orders' && recordId ? `OS${recordId}` : ['tickets', 'support'].includes(notification?.kind) && recordId ? `TCK${recordId}` : recordId || null)
  };
};

app.get(
  '/api/notifications',
  auth,
  wrap((req, res) => {
    if (req.user.role === 'admin' && !hasAdminPermission(req.user, 'notices')) throw fail('Seu perfil não possui permissão para acessar as notificações.', 403);
    const notifs = all('notifications').filter((n) =>
      req.user.role === 'admin'
        ? n.audience === 'admin' || !n.audience
        : String(n.clientId) === String(req.user.clientId) && n.audience !== 'admin'
    );
    res.json(notifs.map((notification) => ({ ...notification, target: notificationTarget(notification) })));
  })
);

app.patch(
  '/api/notifications/:id/read',
  auth,
  wrap((req, res) => {
    if (req.user.role === 'admin' && !hasAdminPermission(req.user, 'notices')) throw fail('Seu perfil não possui permissão para acessar as notificações.', 403);
    const id = req.params.id;
    const n = get('notifications', id);
    const canRead = n && (req.user.role === 'admin'
      ? (n.audience === 'admin' || !n.audience)
      : String(n.clientId) === String(req.user.clientId) && n.audience !== 'admin');
    if (canRead) {
      n.read = true;
      put('notifications', id, n);
      broadcastEvent('reload');
    }
    res.json({ ok: true });
  })
);

// PDF generation
app.get(
  '/api/orders/:id/pdf',
  auth,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const o = get('orders', id);
    if (!o) throw fail('Ordem de Serviço não encontrada', 404);
    if (req.user.role !== 'admin' && String(req.user.clientId) !== String(o.clientId)) throw fail('Acesso negado', 403);

    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${o.code}.pdf"`);
    doc.pipe(res);

    doc.fontSize(22).fillColor('#2563eb').text('GSA HUB — Soluções Administrativas', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).fillColor('#0f172a').text(`Relatório da Ordem de Serviço ${o.code}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).fillColor('#334155').text(`Serviço: ${o.title}`);
    doc.text(`Prioridade: ${o.priority}`);
    doc.text(`Status: ${o.status}`);
    doc.text(`Responsável: ${o.rpsName || '—'}`);
    doc.moveDown();
    doc.fontSize(14).fillColor('#0f172a').text('Etapas Operacionais:');
    doc.moveDown(0.5);

    o.stages?.forEach((stg, i) => {
      doc.fontSize(11).fillColor('#334155').text(`${i + 1}. ${stg.name} — [${stg.status}]`);
      if (stg.description) doc.fontSize(10).fillColor('#64748b').text(`   ${stg.description}`);
    });

    doc.end();
  })
);

// Error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo excede o limite máximo de 15MB.' });
  }
  const status = err.status || 500;
  const message = err.message || 'Erro interno no servidor.';
  res.status(status).json({ error: message });
});

migrateProposalRevisionHistory();
migrateProposalAcceptanceTimestamps();

const PORT = Number(process.env.GSA_PORT || 4180);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`GSA HUB 3.0 Server online em http://127.0.0.1:${PORT}`);
});
