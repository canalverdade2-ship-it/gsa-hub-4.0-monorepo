// @ts-nocheck
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

export interface ParsedProduct {
  candidate_id?: string;
  nome: string | null;
  descricao: string | null;
  preco: number | null;
  moeda: string | null;
  nome_fornecedor: string | null;
  imagens: string[];
  origem_campos: Record<string, string>;
}

export function parseProductHtml(html: string, originalUrl: string): ParsedProduct {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) {
    throw new Error("Failed to parse HTML");
  }

  const result: ParsedProduct = {
    nome: null,
    descricao: null,
    preco: null,
    moeda: null,
    nome_fornecedor: null,
    imagens: [],
    origem_campos: {}
  };

  const getAbsoluteUrl = (relUrl: string) => {
    try {
      return new URL(relUrl, originalUrl).href;
    } catch {
      return relUrl;
    }
  };

  // 1. JSON-LD
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const content = script.textContent;
      if (!content) continue;
      let data = JSON.parse(content);
      
      const processJsonLd = (obj: any) => {
        if (!obj) return;
        if (Array.isArray(obj)) {
          obj.forEach(processJsonLd);
          return;
        }
        if (obj['@graph'] && Array.isArray(obj['@graph'])) {
          obj['@graph'].forEach(processJsonLd);
          return;
        }

        if (obj['@type'] === 'Product') {
          if (!result.nome && obj.name) {
            result.nome = typeof obj.name === 'string' ? obj.name : obj.name[0];
            result.origem_campos['nome'] = 'json_ld';
          }
          if (!result.descricao && obj.description) {
            result.descricao = typeof obj.description === 'string' ? obj.description : obj.description[0];
            result.origem_campos['descricao'] = 'json_ld';
          }
          if (obj.image) {
            const imgs = Array.isArray(obj.image) ? obj.image : [obj.image];
            imgs.forEach((img: any) => {
              if (typeof img === 'string') {
                if (!result.imagens.includes(getAbsoluteUrl(img))) {
                  result.imagens.push(getAbsoluteUrl(img));
                }
              } else if (img && img.url) {
                if (!result.imagens.includes(getAbsoluteUrl(img.url))) {
                  result.imagens.push(getAbsoluteUrl(img.url));
                }
              }
            });
            if (result.imagens.length > 0 && !result.origem_campos['imagens']) {
              result.origem_campos['imagens'] = 'json_ld';
            }
          }
          
          if (obj.brand && obj.brand.name && !result.nome_fornecedor) {
            result.nome_fornecedor = typeof obj.brand.name === 'string' ? obj.brand.name : null;
            if (result.nome_fornecedor) result.origem_campos['nome_fornecedor'] = 'json_ld';
          }

          const offers = obj.offers;
          if (offers && !result.preco) {
            const offerList = Array.isArray(offers) ? offers : [offers];
            for (const offer of offerList) {
              const price = offer.price || offer.lowPrice;
              if (price !== undefined && price !== null) {
                const numPrice = parseFloat(String(price).replace(/[^0-9.]/g, ''));
                if (!isNaN(numPrice) && numPrice > 0) {
                  result.preco = numPrice;
                  result.moeda = offer.priceCurrency || 'BRL';
                  result.origem_campos['preco'] = 'json_ld';
                  result.origem_campos['moeda'] = 'json_ld';
                  break;
                }
              }
            }
          }
        }
      };

      processJsonLd(data);
    } catch (e) {
      // ignore JSON parse errors
    }
  }

  // 2. Open Graph
  if (!result.nome) {
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      result.nome = ogTitle.getAttribute('content');
      result.origem_campos['nome'] = 'open_graph';
    }
  }

  if (!result.descricao) {
    const ogDesc = doc.querySelector('meta[property="og:description"]');
    if (ogDesc) {
      result.descricao = ogDesc.getAttribute('content');
      result.origem_campos['descricao'] = 'open_graph';
    }
  }

  if (result.imagens.length === 0) {
    const ogImage = doc.querySelector('meta[property="og:image"]');
    if (ogImage && ogImage.getAttribute('content')) {
      result.imagens.push(getAbsoluteUrl(ogImage.getAttribute('content')!));
      result.origem_campos['imagens'] = 'open_graph';
    }
  }

  if (!result.preco) {
    const ogPrice = doc.querySelector('meta[property="product:price:amount"]');
    const ogCurrency = doc.querySelector('meta[property="product:price:currency"]');
    if (ogPrice && ogPrice.getAttribute('content')) {
      const p = parseFloat(ogPrice.getAttribute('content')!.replace(/[^0-9.]/g, ''));
      if (!isNaN(p) && p > 0) {
        result.preco = p;
        result.origem_campos['preco'] = 'open_graph';
        if (ogCurrency && ogCurrency.getAttribute('content')) {
          result.moeda = ogCurrency.getAttribute('content');
          result.origem_campos['moeda'] = 'open_graph';
        } else {
          result.moeda = 'BRL';
        }
      }
    }
  }

  // 3. Meta / Itemprop fallback
  if (!result.nome) {
    const metaTitle = doc.querySelector('title');
    if (metaTitle && metaTitle.textContent) {
      result.nome = metaTitle.textContent;
      result.origem_campos['nome'] = 'title';
    }
  }

  if (!result.descricao) {
    const metaDesc = doc.querySelector('meta[name="description"]');
    if (metaDesc) {
      result.descricao = metaDesc.getAttribute('content');
      result.origem_campos['descricao'] = 'meta';
    }
  }
  
  if (!result.nome_fornecedor) {
    const ogSiteName = doc.querySelector('meta[property="og:site_name"]');
    if (ogSiteName) {
      result.nome_fornecedor = ogSiteName.getAttribute('content');
      result.origem_campos['nome_fornecedor'] = 'open_graph';
    } else {
       try {
         result.nome_fornecedor = new URL(originalUrl).hostname.replace('www.', '');
         result.origem_campos['nome_fornecedor'] = 'url';
       } catch {}
    }
  }

  // Normalize and decode HTML entities
  const decodeHtmlEntities = (text: string) => {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ');
  };

  if (result.descricao) {
    let decoded = decodeHtmlEntities(result.descricao);
    // Strip HTML tags if any sneaked in
    result.descricao = decoded.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  }
  if (result.nome) {
    let decoded = decodeHtmlEntities(result.nome);
    result.nome = decoded.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  }

  return result;
}

export function parseProductsHtml(html: string, originalUrl: string): ParsedProduct[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) {
    throw new Error("Failed to parse HTML");
  }

  const candidates: ParsedProduct[] = [];
  const getAbsoluteUrl = (relUrl: string) => {
    try {
      return new URL(relUrl, originalUrl).href;
    } catch {
      return relUrl;
    }
  };

  const decodeHtmlEntities = (text: string) => {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ');
  };

  const normalizeText = (text: string | null) => {
    if (!text) return null;
    let decoded = decodeHtmlEntities(text);
    return decoded.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() || null;
  };

  let candidateCount = 0;

  const addCandidate = (p: Partial<ParsedProduct>) => {
    if (candidates.length >= 100) return; // Limit to 100 candidates
    const nome = normalizeText(p.nome || null);
    if (!nome) return; // Name is required to be a valid candidate

    // Basic deduplication during parse
    const exists = candidates.find(c => c.nome === nome);
    if (exists) return;

    candidateCount++;
    candidates.push({
      candidate_id: `cand_${Date.now()}_${candidateCount}`,
      nome: nome,
      descricao: normalizeText(p.descricao || null),
      preco: p.preco || null,
      moeda: p.moeda || 'BRL',
      nome_fornecedor: p.nome_fornecedor || null,
      imagens: Array.isArray(p.imagens) ? p.imagens : [],
      origem_campos: p.origem_campos || {}
    });
  };

  // 1. Find ItemList or multiple Product objects in JSON-LD
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const content = script.textContent;
      if (!content) continue;
      let data = JSON.parse(content);

      const processJsonLd = (obj: any) => {
        if (!obj) return;
        if (Array.isArray(obj)) {
          obj.forEach(processJsonLd);
          return;
        }
        if (obj['@graph'] && Array.isArray(obj['@graph'])) {
          obj['@graph'].forEach(processJsonLd);
          return;
        }

        if (obj['@type'] === 'ItemList' && Array.isArray(obj.itemListElement)) {
          obj.itemListElement.forEach((item: any) => {
            if (item.item && item.item['@type'] === 'Product') {
              processJsonLd(item.item);
            } else if (item.url) {
              // We might just have a list of URLs, but we need product details
              // We can't do much with just a URL without fetching it, which we don't do here.
            }
          });
          return;
        }

        if (obj['@type'] === 'Product') {
          const p: Partial<ParsedProduct> = { origem_campos: { 'nome': 'json_ld' } };
          p.nome = typeof obj.name === 'string' ? obj.name : (obj.name?.[0] || null);
          if (obj.description) {
            p.descricao = typeof obj.description === 'string' ? obj.description : (obj.description?.[0] || null);
            p.origem_campos!['descricao'] = 'json_ld';
          }
          p.imagens = [];
          if (obj.image) {
            const imgs = Array.isArray(obj.image) ? obj.image : [obj.image];
            imgs.forEach((img: any) => {
              if (typeof img === 'string') {
                p.imagens!.push(getAbsoluteUrl(img));
              } else if (img && img.url) {
                p.imagens!.push(getAbsoluteUrl(img.url));
              }
            });
            if (p.imagens.length > 0) p.origem_campos!['imagens'] = 'json_ld';
          }

          if (obj.brand && obj.brand.name) {
            p.nome_fornecedor = typeof obj.brand.name === 'string' ? obj.brand.name : null;
            if (p.nome_fornecedor) p.origem_campos!['nome_fornecedor'] = 'json_ld';
          }

          const offers = obj.offers;
          if (offers) {
            const offerList = Array.isArray(offers) ? offers : [offers];
            for (const offer of offerList) {
              const price = offer.price || offer.lowPrice;
              if (price !== undefined && price !== null) {
                const numPrice = parseFloat(String(price).replace(/[^0-9.]/g, ''));
                if (!isNaN(numPrice) && numPrice > 0) {
                  p.preco = numPrice;
                  p.moeda = offer.priceCurrency || 'BRL';
                  p.origem_campos!['preco'] = 'json_ld';
                  p.origem_campos!['moeda'] = 'json_ld';
                  break;
                }
              }
            }
          }
          addCandidate(p);
        }
      };
      processJsonLd(data);
    } catch (e) {
      // ignore
    }
  }

  // 2. Microdata fallback (very basic)
  if (candidates.length === 0) {
    const products = doc.querySelectorAll('[itemtype*="Product"]');
    products.forEach(prod => {
      const p: Partial<ParsedProduct> = { origem_campos: { 'nome': 'microdata' }, imagens: [] };
      const nameEl = prod.querySelector('[itemprop="name"]');
      if (nameEl) p.nome = nameEl.textContent;
      
      const descEl = prod.querySelector('[itemprop="description"]');
      if (descEl) p.descricao = descEl.textContent;
      
      const priceEl = prod.querySelector('[itemprop="price"]');
      if (priceEl) {
         let content = priceEl.getAttribute('content') || priceEl.textContent;
         if (content) {
             const num = parseFloat(content.replace(/[^0-9.]/g, ''));
             if (!isNaN(num) && num > 0) p.preco = num;
         }
      }
      const imgEl = prod.querySelector('img[itemprop="image"]');
      if (imgEl && imgEl.getAttribute('src')) {
         p.imagens!.push(getAbsoluteUrl(imgEl.getAttribute('src')!));
      }
      
      if (p.nome) addCandidate(p);
    });
  }

  // Set provider name if missing
  let defaultProvider = null;
  const ogSiteName = doc.querySelector('meta[property="og:site_name"]');
  if (ogSiteName) {
    defaultProvider = ogSiteName.getAttribute('content');
  } else {
    try {
      defaultProvider = new URL(originalUrl).hostname.replace('www.', '');
    } catch {}
  }

  candidates.forEach(c => {
    if (!c.nome_fornecedor) {
      c.nome_fornecedor = defaultProvider;
      c.origem_campos['nome_fornecedor'] = ogSiteName ? 'open_graph' : 'url';
    }
  });

  return candidates;
}
