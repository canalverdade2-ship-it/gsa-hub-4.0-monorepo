import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface PixDiscountSettings {
  ativo: boolean;
  porcentagem: number;
  tipoAplicacao: 'todos' | 'categorias' | 'produtos';
  categorias: string[];
  produtos: string[];
  permitirPontos: boolean;
  permitirSaldoCarteira: boolean;
}

let cachedPixDiscount: PixDiscountSettings | null = null;
let fetchPromise: Promise<PixDiscountSettings> | null = null;

const DEFAULT_STATE: PixDiscountSettings = {
  ativo: false,
  porcentagem: 5,
  tipoAplicacao: 'todos',
  categorias: [],
  produtos: [],
  permitirPontos: false,
  permitirSaldoCarteira: false,
};

export function usePixDiscount() {
  const [pixDiscount, setPixDiscount] = useState<PixDiscountSettings>(DEFAULT_STATE);

  useEffect(() => {
    let mounted = true;

    if (cachedPixDiscount !== null) {
      setPixDiscount(cachedPixDiscount);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = (async (): Promise<PixDiscountSettings> => {
        try {
          const { data, error } = await supabase
            .from('system_settings')
            .select('key, value')
            .in('key', [
              'loja_pix_desconto_ativo',
              'loja_pix_desconto_porcentagem',
              'loja_pix_desconto_tipo_aplicacao',
              'loja_pix_desconto_categorias',
              'loja_pix_desconto_produtos',
              'loja_pix_desconto_permitir_pontos',
              'loja_pix_desconto_permitir_saldo_carteira',
            ]);

          if (error || !data || data.length === 0) {
            fetchPromise = null;
            return DEFAULT_STATE;
          }

          const ativo = data.find((s) => s.key === 'loja_pix_desconto_ativo')?.value === 'true';
          const porcentagem = Number(data.find((s) => s.key === 'loja_pix_desconto_porcentagem')?.value) || 5;
          const tipoAplicacao = (data.find((s) => s.key === 'loja_pix_desconto_tipo_aplicacao')?.value as 'todos' | 'categorias' | 'produtos') || 'todos';

          const catsStr = data.find((s) => s.key === 'loja_pix_desconto_categorias')?.value || '';
          const categorias = catsStr.split(',').map((s) => s.trim()).filter(Boolean);

          const prodsStr = data.find((s) => s.key === 'loja_pix_desconto_produtos')?.value || '';
          const produtos = prodsStr.split(',').map((s) => s.trim()).filter(Boolean);

          const permitirPontos = data.find((s) => s.key === 'loja_pix_desconto_permitir_pontos')?.value === 'true';
          const permitirSaldoCarteira = data.find((s) => s.key === 'loja_pix_desconto_permitir_saldo_carteira')?.value === 'true';

          const result: PixDiscountSettings = {
            ativo,
            porcentagem,
            tipoAplicacao,
            categorias,
            produtos,
            permitirPontos,
            permitirSaldoCarteira,
          };

          cachedPixDiscount = result;
          return result;
        } catch {
          fetchPromise = null;
          return DEFAULT_STATE;
        }
      })();
    }

    fetchPromise.then((result) => {
      if (mounted) setPixDiscount(result);
    });

    return () => {
      mounted = false;
    };
  }, []);

  return pixDiscount;
}

export function checkPixDiscountApplies(
  item: any,
  pixSettings: {
    ativo: boolean;
    tipoAplicacao: 'todos' | 'categorias' | 'produtos';
    categorias: string[];
    produtos: string[];
  }
): boolean {
  if (!pixSettings.ativo) return false;
  if (pixSettings.tipoAplicacao === 'todos') return true;

  if (pixSettings.tipoAplicacao === 'produtos') {
    return pixSettings.produtos.includes(String(item?.id || item?.produto_id));
  }

  if (pixSettings.tipoAplicacao === 'categorias') {
    const catName =
      typeof item?.categoria === 'string'
        ? item.categoria
        : typeof item?.categorias?.nome === 'string'
        ? item.categorias.nome
        : typeof item?.categoria_nome === 'string'
        ? item.categoria_nome
        : '';

    return pixSettings.categorias.some((c) => c.toLowerCase() === catName.toLowerCase());
  }

  return false;
}
