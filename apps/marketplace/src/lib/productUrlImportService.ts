import { supabase } from './supabase';
import { sessionService } from './sessionService';
import type { ProductVariationsPayload } from '../types/productVariations';

export interface ParsedProductData {
  candidate_id?: string;
  nome: string | null;
  descricao: string | null;
  preco: number | null;
  moeda: string | null;
  nome_fornecedor: string | null;
  imagens: string[];
  sku?: string | null;
  variacoes: ProductVariationsPayload;
  url_original: string;
  url_final: string;
  origem_campos: Record<string, string>;
  avisos: string[];
}

export const productUrlImportService = {
  async analyzeProductUrl(url: string): Promise<ParsedProductData> {
    const session = sessionService.getCurrentSession();
    if (!session?.sessaoId || !session?.sessionToken) {
      throw new Error('Sessão administrativa não encontrada');
    }

    const { data, error } = await supabase.functions.invoke('gsa-product-import', {
      body: {
        sessaoId: session.sessaoId,
        sessionToken: session.sessionToken,
        url,
        action: 'analyze'
      }
    });

    if (error) {
      throw new Error(error.message || 'Erro ao analisar a URL');
    }

    if (data?.error) {
       throw new Error(data.error);
    }

    if (!data?.success || !data?.data) {
       throw new Error('Resposta inesperada da função de análise');
    }

    return data.data as ParsedProductData;
  },

  async importProductImages(images: string[]): Promise<{
    uploaded: string[];
    failed: string[];
    mappings: Array<{ original: string; uploaded: string }>;
  }> {
    const session = sessionService.getCurrentSession();
    if (!session?.sessaoId || !session?.sessionToken) {
      throw new Error('Sessão administrativa não encontrada');
    }

    const { data, error } = await supabase.functions.invoke('gsa-product-import', {
      body: {
        sessaoId: session.sessaoId,
        sessionToken: session.sessionToken,
        images,
        action: 'copy_images'
      }
    });

    if (error) {
      throw new Error(error.message || 'Erro ao copiar as imagens');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return {
      uploaded: data?.data?.uploaded || [],
      failed: data?.data?.failed || [],
      mappings: data?.data?.mappings || [],
    };
  },

  async discoverProducts(url: string): Promise<{ candidates: ParsedProductData[], total: number }> {
    const session = sessionService.getCurrentSession();
    if (!session?.sessaoId || !session?.sessionToken) throw new Error('Sessão administrativa não encontrada');

    const { data, error } = await supabase.functions.invoke('gsa-product-import', {
      body: { sessaoId: session.sessaoId, sessionToken: session.sessionToken, url, action: 'discover_products' }
    });

    if (error) throw new Error(error.message || 'Erro ao descobrir produtos na página');
    if (data?.error) throw new Error(data.error);

    return data.data;
  },

  async analyzeProductsBatch(urls: string[]): Promise<any[]> {
    const session = sessionService.getCurrentSession();
    if (!session?.sessaoId || !session?.sessionToken) throw new Error('Sessão administrativa não encontrada');

    const { data, error } = await supabase.functions.invoke('gsa-product-import', {
      body: { sessaoId: session.sessaoId, sessionToken: session.sessionToken, urls, action: 'analyze_products' }
    });

    if (error) throw new Error(error.message || 'Erro ao analisar lote de produtos');
    if (data?.error) throw new Error(data.error);

    return data.data;
  },

  async copyProductImagesBatch(batchId: string, products: any[]): Promise<any[]> {
    const session = sessionService.getCurrentSession();
    if (!session?.sessaoId || !session?.sessionToken) throw new Error('Sessão administrativa não encontrada');

    const { data, error } = await supabase.functions.invoke('gsa-product-import', {
      body: { sessaoId: session.sessaoId, sessionToken: session.sessionToken, batchId, products, action: 'copy_product_images' }
    });

    if (error) throw new Error(error.message || 'Erro ao copiar imagens em lote');
    if (data?.error) throw new Error(data.error);

    return data.data;
  }
};
