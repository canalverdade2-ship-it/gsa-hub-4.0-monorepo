import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
dotenv.config({ path: resolve(root, '.env') });
dotenv.config({ path: resolve(here, '.env.local'), override: true });

const API_URL = (process.env.GSA_API_URL || process.env.VITE_SUPABASE_URL || 'https://api.147-15-43-141.nip.io').replace(/\/$/, '');
const ANON_KEY = process.env.GSA_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const WORKER_TOKEN = process.env.SHOPEE_WORKER_TOKEN || '';
const PROFILE_DIR = process.env.SHOPEE_PROFILE_DIR
  || resolve(process.env.LOCALAPPDATA || root, 'GSAHub/ShopeeExecutor/profile');
const SETUP_ONLY = process.argv.includes('--setup');
const CHECK_ONLY = process.argv.includes('--check');
const POLL_MS = Math.max(10_000, Number(process.env.SHOPEE_POLL_MS || 20_000));

if (!ANON_KEY) throw new Error('Configure GSA_ANON_KEY no arquivo automation/shopee-executor/.env.local.');
if (!SETUP_ONLY && !WORKER_TOKEN) throw new Error('Configure SHOPEE_WORKER_TOKEN no arquivo automation/shopee-executor/.env.local.');

const rl = createInterface({ input, output });
let stopping = false;
let activeJobId = null;
let browserContext;

function log(message) {
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${message}`);
}

async function rpc(name, payload = {}) {
  const response = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data?.message || data?.hint || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function updateJob(status, patch = {}) {
  if (!activeJobId) return;
  return rpc('gsa_shopee_worker_update_job', {
    p_worker_token: WORKER_TOKEN,
    p_job_id: activeJobId,
    p_status: status,
    p_patch: patch,
  });
}

function variationText(variation) {
  if (!variation || typeof variation !== 'object') return 'Sem variação';
  const source = variation.opcoes || variation.combinacao || variation;
  const ignored = /(^id$|_id$|sku|codigo|imagem|url|estoque|valor|price)/i;
  const pairs = Object.entries(source)
    .filter(([key, value]) => !ignored.test(key) && ['string', 'number'].includes(typeof value))
    .map(([key, value]) => `${key}: ${value}`);
  return pairs.length ? pairs.join(' • ') : 'Confira a variação exibida no pedido';
}

async function waitForManualLogin(page) {
  while (!stopping) {
    const url = page.url();
    if (!/\/buyer\/login|\/verify\/ivs/i.test(url)) return;
    log('Aguardando você concluir o login manual no Chrome dedicado...');
    await page.waitForTimeout(5_000);
  }
}

async function processJob(job) {
  activeJobId = job.id;
  const page = browserContext.pages()[0] || await browserContext.newPage();
  try {
    await updateJob('validando');
    log(`Pedido ${job.order?.code}: ${job.items.length} item(ns).`);

    for (let index = 0; index < job.items.length; index += 1) {
      const item = job.items[index];
      log(`Abrindo item ${index + 1}/${job.items.length}: ${item.name}`);
      await page.goto(item.source_url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForTimeout(4_000);
      await waitForManualLogin(page);

      const bodyText = await page.locator('body').innerText().catch(() => '');
      if (/produto.*(indisponível|não existe)|esgotado/i.test(bodyText)) {
        await updateJob('divergencia', {
          divergences: [{ item_id: item.id, type: 'unavailable', message: 'Produto aparece indisponível na Shopee.' }],
        });
        log('Produto indisponível. A tarefa foi enviada para decisão no painel.');
        return;
      }

      await updateJob('preparando_carrinho');
      console.log('\n────────────────────────────────────────────────────────');
      console.log(`Produto: ${item.name}`);
      console.log(`Quantidade: ${item.quantity}`);
      console.log(`Variação: ${variationText(item.variation)}`);
      console.log('Confira preço/estoque, selecione a variação e clique em "Adicionar ao carrinho".');
      console.log('Não clique em "Comprar agora" nem efetue pagamento nesta etapa.');
      const answer = (await rl.question('ENTER = item adicionado | D = divergência | C = cancelar tarefa: ')).trim().toLowerCase();
      if (answer === 'd') {
        const note = await rl.question('Descreva a divergência sem informar dados pessoais: ');
        await updateJob('divergencia', {
          divergences: [{ item_id: item.id, type: 'manual_review', message: note.slice(0, 500) }],
        });
        return;
      }
      if (answer === 'c') {
        await updateJob('falha', { error_code: 'operator_cancelled', error_message: 'Operador interrompeu a preparação do carrinho.' });
        return;
      }
    }

    await updateJob('aguardando_pagamento', {
      checkout_snapshot: { prepared_at: new Date().toISOString(), item_count: job.items.length, mode: 'assisted' },
    });
    log(`Carrinho do pedido ${job.order?.code} preparado. A fila foi bloqueada até o pagamento humano.`);
    console.log('Finalize o pedido manualmente na Shopee. O executor nunca clicará no botão de pagamento.');
    const orderSn = (await rl.question('Depois de pagar, informe o número do pedido Shopee (ou ENTER para deixar pendente): ')).trim();
    if (orderSn) {
      await updateJob('comprado', { shopee_order_sn: orderSn, shopee_status: 'pedido_realizado' });
      log('Compra registrada. O acompanhamento poderá iniciar.');
    }
  } catch (error) {
    log(`Falha no pedido: ${error.message}`);
    await updateJob('falha', { error_code: 'executor_error', error_message: String(error.message).slice(0, 1000) }).catch(() => {});
  } finally {
    activeJobId = null;
  }
}

async function main() {
  if (CHECK_ONLY) {
    const result = await rpc('gsa_shopee_worker_heartbeat', {
      p_worker_token: WORKER_TOKEN,
      p_job_id: null,
      p_lease_minutes: 30,
    });
    log(`Conexão validada com a VPS. Executor ${result.worker_id} autorizado.`);
    return;
  }
  await mkdir(PROFILE_DIR, { recursive: true });
  browserContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'chrome' : undefined,
    headless: false,
    viewport: null,
    locale: 'pt-BR',
    args: ['--start-maximized'],
  });
  const page = browserContext.pages()[0] || await browserContext.newPage();
  await page.goto('https://shopee.com.br/', { waitUntil: 'domcontentloaded', timeout: 120_000 });

  if (SETUP_ONLY) {
    log('Modo de configuração. Faça login manualmente na Shopee neste Chrome dedicado.');
    await rl.question('Quando o login estiver concluído, pressione ENTER para salvar e fechar: ');
    return;
  }

  await waitForManualLogin(page);
  log('Executor conectado. Aguardando pedidos pagos na VPS.');
  const heartbeat = setInterval(() => {
    rpc('gsa_shopee_worker_heartbeat', {
      p_worker_token: WORKER_TOKEN,
      p_job_id: activeJobId,
      p_lease_minutes: 30,
    }).catch((error) => log(`Heartbeat pendente: ${error.message}`));
  }, 30_000);

  while (!stopping) {
    try {
      const result = await rpc('gsa_shopee_worker_claim', {
        p_worker_token: WORKER_TOKEN,
        p_lease_minutes: 30,
      });
      if (result?.job) await processJob(result.job);
      else if (result?.blocked_reason === 'active_cart_or_payment_pending') log('Existe um carrinho aguardando pagamento. Nenhum outro cliente será misturado.');
    } catch (error) {
      log(`Fila indisponível: ${error.message}`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_MS));
  }
  clearInterval(heartbeat);
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

try {
  await main();
} finally {
  await browserContext?.close().catch(() => {});
  rl.close();
}
