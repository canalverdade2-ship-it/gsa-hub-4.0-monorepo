import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseProductHtml, parseProductsHtml } from "../_shared/html_parser.ts";
import {
  extractShopeeProductFromHtml,
  extractShopeeProductIds,
  parseShopeeProductPayload,
  type ShopeeProductData,
} from "../_shared/product_variation_parser.ts";
import { assertUrlResolvesPublic } from "../_shared/ssrf_validator.ts";
import { storageUpload } from "../_shared/storage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36 GSA-Product-Importer/2.0';
const MAX_HTML_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

type RequestBody = Record<string, any>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function authorizeRequest(req: Request, body: RequestBody): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const sessionId = body.sessaoId || body.sessao_id;
  const sessionToken = body.sessionToken || body.session_token;

  if (sessionId && sessionToken) {
    const { data, error } = await admin.rpc('gsa_admin_session_actor', {
      p_sessao_id: sessionId,
      p_session_token: sessionToken,
    });
    if (!error && (Array.isArray(data) ? data.length > 0 : Boolean(data))) return true;
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return false;
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  return !error && Boolean(user);
}

async function safeFetch(
  urlValue: string,
  init: RequestInit = {},
  maxBytes = MAX_HTML_BYTES,
): Promise<{ response: Response; finalUrl: string }> {
  let current = (await assertUrlResolvesPublic(urlValue)).href;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const fetched = await fetch(current, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
        ...(init.headers || {}),
      },
    });
    if ([301, 302, 303, 307, 308].includes(fetched.status)) {
      const location = fetched.headers.get('location');
      if (!location) throw new Error('Redirecionamento sem destino.');
      current = (await assertUrlResolvesPublic(new URL(location, current).href)).href;
      continue;
    }
    const contentLength = Number(fetched.headers.get('content-length') || 0);
    if (contentLength > maxBytes) throw new Error('Conteudo remoto excede o limite permitido.');
    return { response: fetched, finalUrl: current };
  }
  throw new Error('Quantidade maxima de redirecionamentos excedida.');
}

async function fetchHtml(urlValue: string): Promise<{ html: string; finalUrl: string }> {
  const fetched = await safeFetch(urlValue, {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!fetched.response.ok) {
    throw new Error(`A pagina do fornecedor respondeu com HTTP ${fetched.response.status}.`);
  }
  const contentType = fetched.response.headers.get('content-type') || '';
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error('O link informado nao aponta para uma pagina HTML.');
  }
  const bytes = new Uint8Array(await fetched.response.arrayBuffer());
  if (bytes.byteLength > MAX_HTML_BYTES) throw new Error('Pagina muito grande para importacao.');
  return { html: new TextDecoder().decode(bytes), finalUrl: fetched.finalUrl };
}

async function fetchShopeeApi(finalUrl: string): Promise<ShopeeProductData | null> {
  const ids = extractShopeeProductIds(finalUrl);
  if (!ids) return null;
  const apiUrl = `https://shopee.com.br/api/v4/item/get?itemid=${encodeURIComponent(ids.itemId)}&shopid=${encodeURIComponent(ids.shopId)}`;
  try {
    const fetched = await safeFetch(apiUrl, {
      headers: {
        Accept: 'application/json',
        Referer: finalUrl,
        'x-api-source': 'pc',
      },
    });
    if (!fetched.response.ok) return null;
    const payload = await fetched.response.json();
    if (!payload?.data) return null;
    return parseShopeeProductPayload(payload);
  } catch {
    return null;
  }
}

async function analyzeOne(urlValue: string): Promise<any> {
  const initialUrl = await assertUrlResolvesPublic(urlValue);
  const initialHost = initialUrl.hostname.toLowerCase();
  if ((initialHost === 'shopee.com.br' || initialHost.endsWith('.shopee.com.br'))
      && extractShopeeProductIds(initialUrl.href)) {
    const directShopee = await fetchShopeeApi(initialUrl.href);
    if (directShopee) {
      return {
        candidate_id: crypto.randomUUID(),
        nome: directShopee.nome,
        descricao: directShopee.descricao,
        preco: directShopee.preco,
        moeda: directShopee.moeda,
        nome_fornecedor: directShopee.nome_fornecedor,
        imagens: directShopee.imagens,
        sku: directShopee.sku,
        variacoes: directShopee.variacoes,
        url_original: urlValue,
        url_final: initialUrl.href,
        origem_campos: { produto: 'shopee_api', variacoes: 'shopee_api', estoque_variacoes: 'shopee_api' },
        avisos: [],
      };
    }
  }

  const { html, finalUrl } = await fetchHtml(urlValue);
  const hostname = new URL(finalUrl).hostname.toLowerCase();
  let shopee: ShopeeProductData | null = null;
  if (hostname === 'shopee.com.br' || hostname.endsWith('.shopee.com.br')) {
    shopee = await fetchShopeeApi(finalUrl) || extractShopeeProductFromHtml(html);
  }

  const generic = parseProductHtml(html, finalUrl);
  const variations = shopee?.variacoes || { grupos: [], variantes: [] };
  const warnings: string[] = [];
  if (hostname.includes('shopee') && variations.grupos.length === 0) {
    warnings.push('A Shopee nao disponibilizou a grade de variacoes nesta resposta. Tente novamente ou confira se o anuncio possui opcoes ativas.');
  }

  return {
    candidate_id: crypto.randomUUID(),
    nome: shopee?.nome || generic.nome,
    descricao: shopee?.descricao || generic.descricao,
    preco: shopee?.preco ?? generic.preco,
    moeda: shopee?.moeda || generic.moeda || 'BRL',
    nome_fornecedor: shopee?.nome_fornecedor || generic.nome_fornecedor,
    imagens: Array.from(new Set([...(shopee?.imagens || []), ...(generic.imagens || [])])).slice(0, 30),
    sku: shopee?.sku || null,
    variacoes: variations,
    url_original: urlValue,
    url_final: finalUrl,
    origem_campos: {
      ...generic.origem_campos,
      ...(shopee ? { variacoes: 'shopee_api', estoque_variacoes: 'shopee_api' } : {}),
    },
    avisos: warnings,
  };
}

async function discoverProducts(urlValue: string): Promise<any[]> {
  if (extractShopeeProductIds(urlValue)) return [await analyzeOne(urlValue)];
  const { html, finalUrl } = await fetchHtml(urlValue);
  const ids = extractShopeeProductIds(finalUrl);
  if (ids) return [await analyzeOne(finalUrl)];

  const candidates = parseProductsHtml(html, finalUrl);
  if (candidates.length === 0) return [await analyzeOne(finalUrl)];
  return candidates.map((candidate) => ({
    ...candidate,
    url_original: urlValue,
    url_final: finalUrl,
    variacoes: { grupos: [], variantes: [] },
    avisos: [],
  }));
}

function extensionForContentType(contentType: string): string {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  return extensions[normalized] || 'jpg';
}

async function copyImage(imageUrl: string, prefix: string): Promise<string> {
  const fetched = await safeFetch(imageUrl, { headers: { Accept: 'image/*' } }, MAX_IMAGE_BYTES);
  if (!fetched.response.ok) throw new Error(`Imagem respondeu com HTTP ${fetched.response.status}.`);
  const contentType = (fetched.response.headers.get('content-type') || '').split(';')[0];
  if (!contentType.startsWith('image/')) throw new Error('O endereco nao retornou uma imagem.');
  const bytes = new Uint8Array(await fetched.response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Imagem excede 12 MB.');
  const key = `public/store-images/${prefix}/${crypto.randomUUID()}.${extensionForContentType(contentType)}`;
  const uploaded = await storageUpload(key, bytes, contentType);
  return uploaded.publicUrl;
}

async function copyImages(images: string[], prefix: string) {
  const uploaded: string[] = [];
  const failed: string[] = [];
  const mappings: Array<{ original: string; uploaded: string }> = [];
  for (const imageUrl of images.slice(0, 50)) {
    try {
      const copied = await copyImage(imageUrl, prefix);
      uploaded.push(copied);
      mappings.push({ original: imageUrl, uploaded: copied });
    } catch {
      failed.push(imageUrl);
    }
  }
  return { uploaded, failed, mappings };
}

async function handleUrlAction(body: RequestBody): Promise<Response> {
  const action = String(body.action || '');
  if (action === 'analyze') {
    const urlValue = body.url || body.product_url;
    if (!urlValue) return response({ error: 'URL e obrigatoria.' }, 400);
    return response({ success: true, data: await analyzeOne(String(urlValue)) });
  }

  if (action === 'discover_products') {
    if (!body.url) return response({ error: 'URL e obrigatoria.' }, 400);
    const candidates = await discoverProducts(String(body.url));
    return response({ success: true, data: { candidates, total: candidates.length } });
  }

  if (action === 'analyze_products') {
    if (!Array.isArray(body.urls)) return response({ error: 'urls deve ser uma lista.' }, 400);
    const results = [];
    for (const urlValue of body.urls.slice(0, 50)) {
      try {
        results.push({ url: urlValue, success: true, data: await analyzeOne(String(urlValue)) });
      } catch (error) {
        results.push({ url: urlValue, success: false, error: errorMessage(error) });
      }
    }
    return response({ success: true, data: results });
  }

  if (action === 'copy_images') {
    const images = body.images || body.image_urls;
    if (!Array.isArray(images)) return response({ error: 'images deve ser uma lista.' }, 400);
    const result = await copyImages(images.map(String), `single-${Date.now()}`);
    return response({ success: true, data: result });
  }

  if (action === 'copy_product_images') {
    if (!Array.isArray(body.products)) return response({ error: 'products deve ser uma lista.' }, 400);
    const batchId = String(body.batchId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '');
    const results = [];
    for (const product of body.products.slice(0, 50)) {
      const result = await copyImages(Array.isArray(product.images) ? product.images.map(String) : [], batchId);
      results.push({ client_id: product.client_id, ...result });
    }
    return response({ success: true, data: results });
  }

  return response({ error: `Acao '${action}' nao reconhecida.` }, 400);
}

async function handleFileAction(body: RequestBody): Promise<Response> {
  const admin = getSupabaseAdmin();
  if (body.action === 'create_upload') {
    if (!body.file_content || !body.file_name) return response({ error: 'file_content e file_name sao obrigatorios.' }, 400);
    const importId = crypto.randomUUID();
    const safeName = String(body.file_name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150);
    const key = `private/product-imports/${importId}/${safeName}`;
    await storageUpload(key, new TextEncoder().encode(String(body.file_content)), 'text/plain');
    return response({ success: true, import_id: importId, r2_key: key });
  }

  if (body.action === 'analyze_media') {
    const { data, error } = await admin.rpc('gsa_process_product_import', {
      p_import_id: body.import_id,
      p_user_id: body.user_id || null,
    });
    if (error) return response({ error: error.message }, 500);
    return response({ success: true, data });
  }

  return response({ error: `Acao '${body.action}' nao reconhecida.` }, 400);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'Metodo nao permitido.' }, 405);

  try {
    const body = await req.json() as RequestBody;
    if (!(await authorizeRequest(req, body))) return response({ error: 'Nao autorizado.' }, 401);
    if (['create_upload', 'analyze_media'].includes(String(body.action))) return await handleFileAction(body);
    return await handleUrlAction(body);
  } catch (error) {
    return response({ error: errorMessage(error) }, 500);
  }
});
