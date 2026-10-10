'use strict';

const configuredUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const baseUrl = configuredUrl && !/^https?:\/\//i.test(configuredUrl) ? `https://${configuredUrl}` : configuredUrl;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const targetBaseUrl = String(process.env.SCRAPING_ENGINE_BASE_URL || 'http://127.0.0.1:5680').replace(/\/$/, '');
const apply = process.argv.includes('--apply');
if (!baseUrl || !serviceKey) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const configs = await request('/rest/v1/automacao_scraping_configs?select=id,nome,tipo,n8n_webhook_url&order=created_at.asc');
  const changes = configs.map(config => ({
    id: config.id,
    nome: config.nome,
    current: config.n8n_webhook_url,
    target: `${targetBaseUrl}${config.tipo === 'viagens' ? '/webhook/gsa-viagens-scraping' : '/webhook/gsa-produtos-scraping'}`,
  })).filter(item => item.current !== item.target);

  if (apply) {
    await request('/rest/v1/system_settings?key=eq.n8n_base_url', {
      method: 'PATCH', body: JSON.stringify({ value: JSON.stringify(targetBaseUrl) }), headers: { Prefer: 'return=minimal' },
    });
    for (const change of changes) {
      await request(`/rest/v1/automacao_scraping_configs?id=eq.${encodeURIComponent(change.id)}`, {
        method: 'PATCH', body: JSON.stringify({ n8n_webhook_url: change.target }), headers: { Prefer: 'return=minimal' },
      });
    }
  }
  console.log(JSON.stringify({ applied: apply, targetBaseUrl, changed: changes.map(({ nome, target }) => ({ nome, target })) }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
