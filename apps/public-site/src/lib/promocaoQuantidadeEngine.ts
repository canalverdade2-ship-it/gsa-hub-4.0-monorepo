import { Cliente, LojaCategoria, Produto } from '../types';
import { getProductEffectivePrice } from './productPricing';

export interface CartItem {
  produto: Produto;
  quantidade: number;
  categoria_id?: string;
  is_brinde?: boolean; // Se true, foi inserido pelo sistema de promoções
}

export interface PromoResult {
  promocao_id: string;
  nome: string;
  tipo_promocao: string;
  escopo_gatilho: string;
  descricao_resumo: string;
  
  item_brinde?: {
    produto_id: string;
    produto_nome: string;
    produto_imagem_url?: string;
    quantidade: number;
    valor_unitario: number;
    valor_cobrado: number; // Será 0 para grátis
  };
  desconto_aplicado?: {
    valor_desconto: number;
    tipo: 'porcentagem' | 'valor';
    percentual_ou_valor: number;
    produto_id: string;
    produto_nome: string;
  };
  
  vezes_aplicada: number;
  economia_total: number;
  
  // Progresso
  progresso?: {
    quantidade_atual: number;
    quantidade_necessaria: number;
    percentual: number;
    faltam: number;
    faltam_valor?: number;
  };
  
  status: 'ativa' | 'progresso' | 'brinde_esgotado' | 'uso_esgotado' | 'nivel_bloqueado';
  nivel_aplicado?: number; // Para escalonadas
}

export async function avaliarPromocoes(
  cartItems: CartItem[],
  cliente: Cliente,
  promocoesAtivas: any[],
  usoCliente: any[]
): Promise<PromoResult[]> {
  const results: PromoResult[] = [];
  
  if (!cartItems || cartItems.length === 0 || !promocoesAtivas || promocoesAtivas.length === 0) {
    return results;
  }

  // Obter nível VIP do cliente
  const clientLevelId = cliente.nivel_manual_id || cliente.nivel_id; // Simples fallback

  // Avaliar cada promoção
  for (const promo of promocoesAtivas) {
    // 1. Verificação de Nível VIP (Bloqueio)
    if (promo.nivel_minimo_id && promo.nivel_minimo_id !== clientLevelId) {
       // Simplificação: se não tem o nível, bloqueia. Num cenário real, precisaríamos
       // comparar a hierarquia (pontos_minimos) para saber se ele tem nível "maior" ou não.
       results.push({
         promocao_id: promo.id,
         nome: promo.nome,
         tipo_promocao: promo.tipo_promocao,
         escopo_gatilho: promo.escopo_gatilho,
         descricao_resumo: promo.descricao || '',
         vezes_aplicada: 0,
         economia_total: 0,
         status: 'nivel_bloqueado'
       });
       continue;
    }

    // 2. Definir Quantidade Mínima (Olhando regra VIP ou Normal)
    let qtdMinima = promo.quantidade_minima;
    if (promo.niveis_vip && clientLevelId) {
       const regraVip = promo.niveis_vip.find((n: any) => n.nivel_id === clientLevelId);
       if (regraVip) qtdMinima = regraVip.quantidade_minima;
    }

    // 3. Contabilizar itens elegíveis no carrinho
    let qtdElegivel = 0;
    let valorElegivel = 0;
    let itensEnvolvidos: CartItem[] = [];

    cartItems.filter(item => !item.is_brinde).forEach(item => {
      let isElegivel = false;
      if (promo.escopo_gatilho === 'geral') isElegivel = true;
      else if (promo.escopo_gatilho === 'produto' && item.produto.id === promo.produto_gatilho_id) isElegivel = true;
      else if (promo.escopo_gatilho === 'categoria' && (item.categoria_id === promo.categoria_gatilho_id || item.produto.categoria_id === promo.categoria_gatilho_id)) isElegivel = true;
      else if (promo.escopo_gatilho === 'valor_minimo') isElegivel = true; // Para valor, soma tudo

      if (isElegivel) {
        qtdElegivel += item.quantidade;
        valorElegivel += (getProductEffectivePrice(item.produto) * item.quantidade);
        itensEnvolvidos.push(item);
      }
    });

    // Avaliação de Escopo de Valor
    if (promo.escopo_gatilho === 'valor_minimo') {
      const minValor = promo.valor_minimo_compra || 0;
      if (valorElegivel < minValor) {
        results.push({
          promocao_id: promo.id,
          nome: promo.nome,
          tipo_promocao: promo.tipo_promocao,
          escopo_gatilho: promo.escopo_gatilho,
          descricao_resumo: promo.descricao || '',
          vezes_aplicada: 0,
          economia_total: 0,
          progresso: {
            quantidade_atual: valorElegivel,
            quantidade_necessaria: minValor,
            percentual: Math.min(100, Math.round((valorElegivel / minValor) * 100)),
            faltam: 0,
            faltam_valor: minValor - valorElegivel
          },
          status: 'progresso'
        });
        continue;
      }
    } else {
      // Avaliação por Quantidade
      if (qtdElegivel < qtdMinima) {
         if (qtdElegivel > 0) {
            results.push({
              promocao_id: promo.id,
              nome: promo.nome,
              tipo_promocao: promo.tipo_promocao,
              escopo_gatilho: promo.escopo_gatilho,
              descricao_resumo: promo.descricao || '',
              vezes_aplicada: 0,
              economia_total: 0,
              progresso: {
                quantidade_atual: qtdElegivel,
                quantidade_necessaria: qtdMinima,
                percentual: Math.min(100, Math.round((qtdElegivel / qtdMinima) * 100)),
                faltam: qtdMinima - qtdElegivel
              },
              status: 'progresso'
            });
         }
         continue;
      }
    }

    // 4. Se passou, aplicar benefícios (Simples para Fase 2)
    qtdMinima = Math.max(1, qtdMinima); // Evita divisão por zero
    let vezesAplicada = Math.floor(qtdElegivel / qtdMinima);
    
    // Para "Desconto a partir de X unidades", o desconto aplica-se a todas as unidades extras (além do gatilho - 1)
    if (promo.tipo_promocao === 'desconto_proxima') {
       vezesAplicada = qtdElegivel - (qtdMinima - 1);
       if (vezesAplicada < 1) vezesAplicada = 1;
    }
    
    // Simular aplicação de brinde
    if (promo.tipo_promocao === 'ganhe_outro_produto' && promo.produto_brinde) {
       // Checagem de estoque do brinde aqui seria ideal
       const qtdBrinde = (promo.quantidade_brinde || 1) * vezesAplicada;
       
       results.push({
          promocao_id: promo.id,
          nome: promo.nome,
          tipo_promocao: promo.tipo_promocao,
          escopo_gatilho: promo.escopo_gatilho,
          descricao_resumo: promo.descricao || '',
          vezes_aplicada: vezesAplicada,
          economia_total: getProductEffectivePrice(promo.produto_brinde) * qtdBrinde,
          status: 'ativa',
          item_brinde: {
            produto_id: promo.produto_brinde.id,
            produto_nome: promo.produto_brinde.nome,
            produto_imagem_url: promo.produto_brinde.imagem_url,
            quantidade: qtdBrinde,
            valor_unitario: getProductEffectivePrice(promo.produto_brinde),
            valor_cobrado: 0
          }
       });
    } else if (promo.tipo_promocao === 'unidade_gratis') {
       // O item mais barato dentre os envolvidos fica de graça
       if (itensEnvolvidos.length > 0) {
          const itemMaisBarato = itensEnvolvidos.sort((a,b) => getProductEffectivePrice(a.produto) - getProductEffectivePrice(b.produto))[0];
          results.push({
            promocao_id: promo.id,
            nome: promo.nome,
            tipo_promocao: promo.tipo_promocao,
            escopo_gatilho: promo.escopo_gatilho,
            descricao_resumo: promo.descricao || '',
            vezes_aplicada: vezesAplicada,
            economia_total: getProductEffectivePrice(itemMaisBarato.produto) * vezesAplicada,
            status: 'ativa',
            item_brinde: {
              produto_id: itemMaisBarato.produto.id,
              produto_nome: itemMaisBarato.produto.nome,
              produto_imagem_url: itemMaisBarato.produto.imagem_url,
              quantidade: vezesAplicada,
              valor_unitario: getProductEffectivePrice(itemMaisBarato.produto),
              valor_cobrado: 0
            }
         });
       }
    } else if (promo.tipo_promocao === 'desconto_proxima') {
       // O item mais barato dentre os envolvidos recebe o desconto definido
       if (itensEnvolvidos.length > 0) {
          const itemMaisBarato = itensEnvolvidos.sort((a,b) => getProductEffectivePrice(a.produto) - getProductEffectivePrice(b.produto))[0];
          const valorOriginal = getProductEffectivePrice(itemMaisBarato.produto);
          let valorDesconto = 0;
          if (promo.desconto_tipo === 'porcentagem') {
             valorDesconto = Number((valorOriginal * (promo.desconto_valor / 100)).toFixed(2));
          } else {
             valorDesconto = Number(Number(promo.desconto_valor).toFixed(2));
          }
          if (valorDesconto > valorOriginal) valorDesconto = valorOriginal; // Não pode ser negativo

          results.push({
            promocao_id: promo.id,
            nome: promo.nome,
            tipo_promocao: promo.tipo_promocao,
            escopo_gatilho: promo.escopo_gatilho,
            descricao_resumo: promo.descricao || '',
            vezes_aplicada: vezesAplicada,
            economia_total: Number((valorDesconto * vezesAplicada).toFixed(2)),
            status: 'ativa',
            desconto_aplicado: {
               valor_desconto: Number((valorDesconto * vezesAplicada).toFixed(2)),
               tipo: promo.desconto_tipo,
               percentual_ou_valor: promo.desconto_valor,
               produto_id: itemMaisBarato.produto.id,
               produto_nome: itemMaisBarato.produto.nome
            }
          });
       }
    }
  }

  // Ordenar por prioridade (se for implementado depois)
  return results;
}
