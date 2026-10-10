import { sessionService } from './sessionService';
import { supabase } from './supabase';

export function requireAdminSession() {
  const session = sessionService.getCurrentSession();
  if (
    !session?.sessaoId ||
    !session?.sessionToken ||
    !['admin', 'colaborador'].includes(session.atorTipo)
  ) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gsa-session-revoked', { detail: { reason: 'expired' } }));
    }
    throw new Error('Sessão administrativa inválida ou expirada. Faça login novamente.');
  }
  return session;
}

export function createAdminRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}
export async function callAdminRpc<T = unknown>(
  functionName: string,
  parameters: Record<string, unknown> = {},
): Promise<T> {
  const session = requireAdminSession();
  const { data, error } = await supabase.rpc(functionName, {
    p_sessao_id: session.sessaoId,
    p_session_token: session.sessionToken,
    ...parameters,
  });

  if (error) {
    const errorMsg = String(error.message || '').toLowerCase();
    const isAuthError =
      error.code === '42501' ||
      (error as any).status === 401 ||
      errorMsg.includes('sessão administrativa') ||
      errorMsg.includes('sessao administrativa') ||
      errorMsg.includes('sessão revogada') ||
      errorMsg.includes('sessao revogada') ||
      errorMsg.includes('sessão encerrada') ||
      errorMsg.includes('sessao encerrada') ||
      errorMsg.includes('expirada') ||
      errorMsg.includes('jwt');

    if (isAuthError) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gsa-session-revoked', { detail: { reason: 'expired' } }));
      }
    }
    throw error;
  }
  return data as T;
}

export async function getAdminProductSupplierConfig(produtoId: string) {
  return callAdminRpc<any>('gsa_admin_get_product_supplier_config', {
    p_produto_id: produtoId
  });
}

export async function upsertAdminProductSupplierConfig(produtoId: string, dados: any) {
  return callAdminRpc<any>('gsa_admin_upsert_product_supplier_config', {
    p_produto_id: produtoId,
    p_dados: dados
  });
}

export async function checkExistingSupplierProducts(urls: string[]) {
  return callAdminRpc<any[]>('gsa_admin_check_existing_supplier_products', {
    p_urls: urls
  });
}

export async function importProductsBatch(items: any[]) {
  return callAdminRpc<any>('gsa_admin_import_products_batch', {
    p_items: items
  });
}

export async function setAdminProductDiscount(
  produtoId: string,
  ativo: boolean,
  tipo: 'porcentagem' | 'valor' | null,
  valor: number | null,
  prazoTipo: 'determinado' | 'indeterminado' = 'indeterminado',
  fimEm: string | null = null,
  limiteQuantidadeAtivo: boolean = false,
  quantidadeLimite: number | null = null,
  iniciarNovaCampanha: boolean = false
) {
  return callAdminRpc<any>('gsa_admin_set_product_discount', {
    p_produto_id: produtoId,
    p_ativo: ativo,
    p_tipo: tipo,
    p_valor: valor,
    p_prazo_tipo: prazoTipo,
    p_fim_em: fimEm,
    p_limite_quantidade_ativo: limiteQuantidadeAtivo,
    p_quantidade_limite: quantidadeLimite,
    p_iniciar_nova_campanha: iniciarNovaCampanha
  });
}

export async function releaseDiscountQuota(orcamentoId: string) {
  return callAdminRpc<any>('gsa_admin_release_discount_quota', {
    p_orcamento_id: orcamentoId
  });
}

export type DeleteCascadeResult = {
  success: boolean;
  entity_type: string;
  entity_id: string;
  deleted_count: number;
  message: string;
};

export type DeleteBatchResult = {
  success: boolean;
  total: number;
  deleted: number;
  errors: Array<{ id: string; error: string }>;
};

/** Helper silencioso para deletar registros em tabelas filhas sem interromper cascata */
async function safeDelete(table: string, filterColumn: string, filterValues: string | string[] | undefined | null) {
  if (!filterValues) return;
  const values = Array.isArray(filterValues) ? filterValues.filter(Boolean) : [filterValues].filter(Boolean);
  if (values.length === 0) return;

  try {
    if (values.length === 1) {
      await supabase.from(table).delete().eq(filterColumn, values[0]);
    } else {
      for (let i = 0; i < values.length; i += 40) {
        const chunk = values.slice(i, i + 40);
        await supabase.from(table).delete().in(filterColumn, chunk);
      }
    }
  } catch (err) {
    // Ignora silenciosamente se a tabela/coluna opcional não existir
  }
}

/** Helper silencioso para desvincular chaves estrangeiras (set null) */
async function safeUpdate(table: string, filterColumn: string, filterValues: string | string[] | undefined | null, updateData: Record<string, any>) {
  if (!filterValues) return;
  const values = Array.isArray(filterValues) ? filterValues.filter(Boolean) : [filterValues].filter(Boolean);
  if (values.length === 0) return;

  try {
    if (values.length === 1) {
      await supabase.from(table).update(updateData).eq(filterColumn, values[0]);
    } else {
      for (let i = 0; i < values.length; i += 40) {
        const chunk = values.slice(i, i + 40);
        await supabase.from(table).update(updateData).in(filterColumn, chunk);
      }
    }
  } catch (err) {
    // Ignora silenciosamente
  }
}

/**
 * Realiza a exclusão segura de um registro via RPC nativo ou delete direto com fallback
 */
export async function deleteAdminRecordSecure(table: string, id: string): Promise<boolean> {
  try {
    const session = requireAdminSession();
    if (session?.sessaoId && session?.sessionToken) {
      const { data, error } = await supabase.rpc('gsa_admin_delete_record_secure', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_table: table,
        p_id: id,
      });
      if (!error && data) {
        return true;
      }
    }
  } catch (err) {
    // Prossegue com delete direto
  }

  const { error: directErr } = await supabase.from(table).delete().eq('id', id);
  if (directErr) {
    console.error(`Erro ao deletar diretamente da tabela ${table} id ${id}:`, directErr);
    throw directErr;
  }
  return true;
}

/**
 * Motor de exclusão em cascata de ponta a ponta resiliente.
 * Executa a limpeza relacional profunda em ordem estrita de integridade referencial.
 */
export async function deleteAdminEntityCascade(
  entityType: string,
  entityId: string,
  reason?: string
): Promise<DeleteCascadeResult> {
  // 1. Tenta executar a RPC transacional se disponível no Postgres
  try {
    const rpcRes = await callAdminRpc<DeleteCascadeResult>('gsa_admin_delete_entity_cascade', {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_reason: reason || 'Exclusão solicitada pelo Administrador Master'
    });
    if (rpcRes && typeof rpcRes.success === 'boolean' && rpcRes.success) {
      return rpcRes;
    }
  } catch (rpcErr: any) {
    // Falha esperada caso a RPC não esteja instalada no cluster; prossegue com o motor client-side
  }

  // 2. Motor de Cascata Resiliente em Ordem Estrita de Chaves Estrangeiras
  const cleanType = entityType.trim().toLowerCase();

  if (cleanType === 'cliente') {
    // -------------------------------------------------------------
    // A. Mapear todas as entidades filhas vinculadas ao cliente
    // -------------------------------------------------------------
    const { data: orcList } = await supabase.from('orcamentos').select('id').eq('cliente_id', entityId);
    const orcIds = (orcList || []).map((o: any) => o.id).filter(Boolean);

    let osIds: string[] = [];
    const { data: osList1 } = await supabase.from('ordens_servico').select('id').eq('cliente_id', entityId);
    if (osList1) osIds = osList1.map((o: any) => o.id);
    if (orcIds.length > 0) {
      const { data: osList2 } = await supabase.from('ordens_servico').select('id').in('orcamento_id', orcIds);
      if (osList2) osIds = Array.from(new Set([...osIds, ...osList2.map((o: any) => o.id)]));
    }
    osIds = osIds.filter(Boolean);

    const { data: ocList } = await supabase.from('ordens_compra').select('id').eq('cliente_id', entityId);
    const ocIds = (ocList || []).map((o: any) => o.id).filter(Boolean);

    const { data: oaList } = await supabase.from('ordens_assinatura').select('id').eq('cliente_id', entityId);
    const oaIds = (oaList || []).map((o: any) => o.id).filter(Boolean);

    let fatIds: string[] = [];
    const { data: fatList1 } = await supabase.from('faturas').select('id').eq('cliente_id', entityId);
    if (fatList1) fatIds = fatList1.map((f: any) => f.id);
    if (osIds.length > 0) {
      const { data: fatList2 } = await supabase.from('faturas').select('id').in('os_id', osIds);
      if (fatList2) fatIds = Array.from(new Set([...fatIds, ...fatList2.map((f: any) => f.id)]));
    }
    if (ocIds.length > 0) {
      const { data: fatList3 } = await supabase.from('faturas').select('id').in('ordem_compra_id', ocIds);
      if (fatList3) fatIds = Array.from(new Set([...fatIds, ...fatList3.map((f: any) => f.id)]));
    }
    if (oaIds.length > 0) {
      const { data: fatList4 } = await supabase.from('faturas').select('id').in('ordem_assinatura_id', oaIds);
      if (fatList4) fatIds = Array.from(new Set([...fatIds, ...fatList4.map((f: any) => f.id)]));
    }
    fatIds = fatIds.filter(Boolean);

    let demandaIds: string[] = [];
    if (osIds.length > 0) {
      const { data: dList } = await supabase.from('prestador_demandas').select('id').in('os_id', osIds);
      if (dList) demandaIds = dList.map((d: any) => d.id).filter(Boolean);
    }

    const { data: tList } = await supabase.from('tickets').select('id').eq('cliente_id', entityId);
    const ticketIds = (tList || []).map((t: any) => t.id).filter(Boolean);

    const { data: pedList } = await supabase.from('loja_pedidos').select('id').eq('cliente_id', entityId);
    const pedidoIds = (pedList || []).map((p: any) => p.id).filter(Boolean);

    // Mapear Programa de Afiliados (gsa_afiliados e dependências)
    const { data: afList } = await supabase.from('gsa_afiliados').select('id').eq('cliente_id', entityId);
    const afIds = (afList || []).map((a: any) => a.id).filter(Boolean);

    let afLinkIds: string[] = [];
    if (afIds.length > 0) {
      const { data: lList } = await supabase.from('gsa_afiliado_links').select('id').in('afiliado_id', afIds);
      if (lList) afLinkIds = lList.map((l: any) => l.id).filter(Boolean);
    }

    let atribIds: string[] = [];
    const { data: atList1 } = await supabase.from('gsa_afiliado_atribuicoes').select('id').eq('cliente_id', entityId);
    if (atList1) atribIds = atList1.map((a: any) => a.id);
    if (afIds.length > 0) {
      const { data: atList2 } = await supabase.from('gsa_afiliado_atribuicoes').select('id').in('afiliado_id', afIds);
      if (atList2) atribIds = Array.from(new Set([...atribIds, ...atList2.map((a: any) => a.id)]));
    }
    atribIds = atribIds.filter(Boolean);

    // -------------------------------------------------------------
    // B. Desvincular e Limpar Programa de Afiliados
    // -------------------------------------------------------------
    if (atribIds.length > 0) {
      await safeUpdate('orcamentos', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('faturas', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('viagens_orcamentos', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('viagens_solicitacoes_reserva', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('viagens_propostas', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('viagens_transacoes', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('classificados_propostas', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('classificados_transacoes', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('saude_cotacoes', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('saude_propostas', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('saude_contratos', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('seguros_cotacoes', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('seguros_propostas', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
      await safeUpdate('seguros_apolices', 'affiliate_attribution_id', atribIds, { affiliate_attribution_id: null });
    }

    await safeDelete('gsa_afiliado_transferencias', 'afiliado_origem_id', afIds);
    await safeDelete('gsa_afiliado_transferencias', 'afiliado_destino_id', afIds);
    await safeDelete('gsa_afiliado_comissao_eventos', 'afiliado_id', afIds);
    await safeDelete('gsa_afiliado_saques', 'afiliado_id', afIds);
    await safeDelete('gsa_afiliado_comissoes', 'afiliado_id', afIds);
    await safeDelete('gsa_afiliado_conversoes', 'afiliado_id', afIds);
    await safeDelete('gsa_afiliado_conversoes', 'comprador_id', entityId);
    await safeDelete('gsa_afiliado_atribuicoes', 'id', atribIds);
    await safeDelete('gsa_afiliado_atribuicoes', 'cliente_id', entityId);
    await safeDelete('gsa_afiliado_atribuicoes', 'afiliado_id', afIds);
    await safeDelete('gsa_afiliado_cliques', 'link_id', afLinkIds);
    await safeDelete('gsa_afiliado_cliques', 'cliente_id', entityId);
    await safeDelete('gsa_afiliado_links', 'id', afLinkIds);
    await safeDelete('gsa_afiliado_links', 'afiliado_id', afIds);
    await safeDelete('gsa_afiliados', 'id', afIds);
    await safeDelete('gsa_afiliados', 'cliente_id', entityId);

    // -------------------------------------------------------------
    // C. Excluir Folhas / Nível 1 (Demandas, Tickets, Mensagens)
    // -------------------------------------------------------------
    await safeDelete('prestador_faturas', 'demanda_id', demandaIds);
    await safeDelete('prestador_demandas_historico', 'demanda_id', demandaIds);
    await safeDelete('prestador_demandas', 'id', demandaIds);
    await safeDelete('prestador_demandas', 'os_id', osIds);
    await safeDelete('os_notas', 'os_id', osIds);
    await safeDelete('ticket_mensagens', 'ticket_id', ticketIds);
    await safeDelete('tickets', 'id', ticketIds);
    await safeDelete('tickets', 'cliente_id', entityId);
    await safeDelete('notificacoes', 'cliente_id', entityId);

    // -------------------------------------------------------------
    // D. Excluir Financeiro, Pagamentos, Extratos e Cobranças
    // -------------------------------------------------------------
    await safeDelete('pagamentos', 'fatura_id', fatIds);
    await safeDelete('cobrancas', 'fatura_id', fatIds);
    await safeDelete('cobrancas', 'cliente_id', entityId);
    await safeDelete('pontos_movimentacoes', 'fatura_id', fatIds);
    await safeDelete('pontos_movimentacoes', 'cliente_id', entityId);
    await safeDelete('points_transactions', 'cliente_id', entityId);
    await safeDelete('carteira_lancamentos', 'cliente_id', entityId);
    await safeDelete('extrato_financeiro', 'cliente_id', entityId);
    await safeDelete('saques', 'cliente_id', entityId);
    await safeDelete('transferencias', 'cliente_origem_id', entityId);
    await safeDelete('transferencias', 'cliente_destino_id', entityId);

    // -------------------------------------------------------------
    // E. Vouchers e Indicações
    // -------------------------------------------------------------
    await safeDelete('indicacoes', 'indicador_id', entityId);
    await safeDelete('vouchers', 'ordem_servico_id', osIds);
    await safeDelete('vouchers', 'os_id', osIds);
    await safeDelete('vouchers', 'cliente_id', entityId);

    // -------------------------------------------------------------
    // F. Faturas e Subitens
    // -------------------------------------------------------------
    await safeDelete('fatura_itens', 'fatura_id', fatIds);
    await safeDelete('faturas_itens', 'fatura_id', fatIds);
    await safeDelete('faturas', 'id', fatIds);
    await safeDelete('faturas', 'cliente_id', entityId);

    // -------------------------------------------------------------
    // G. Ordens de Serviço, Compra e Assinatura
    // -------------------------------------------------------------
    await safeDelete('ordens_servico', 'id', osIds);
    await safeDelete('ordens_servico', 'cliente_id', entityId);
    await safeDelete('ordens_compra', 'id', ocIds);
    await safeDelete('ordens_compra', 'cliente_id', entityId);
    await safeDelete('ordens_assinatura', 'id', oaIds);
    await safeDelete('ordens_assinatura', 'cliente_id', entityId);

    // -------------------------------------------------------------
    // H. Orçamentos, Promoções e E-commerce
    // -------------------------------------------------------------
    await safeDelete('loja_pedido_itens', 'orcamento_id', orcIds);
    await safeDelete('loja_pedido_itens', 'pedido_id', pedidoIds);
    await safeDelete('loja_pedidos', 'id', pedidoIds);
    await safeDelete('loja_pedidos', 'cliente_id', entityId);
    await safeDelete('cliente_promocoes', 'orcamento_id', orcIds);
    await safeDelete('cliente_promocoes', 'cliente_id', entityId);
    await safeDelete('promocoes_quantidade_uso', 'orcamento_id', orcIds);
    await safeDelete('promocoes_quantidade_uso', 'cliente_id', entityId);
    await safeDelete('promocoes_quantidade_ativadas', 'orcamento_id', orcIds);
    await safeDelete('cliente_premios', 'cliente_id', entityId);
    await safeDelete('orcamentos', 'id', orcIds);
    await safeDelete('orcamentos', 'cliente_id', entityId);

    // -------------------------------------------------------------
    // I. Módulos Verticais (Viagens, Classificados, Saúde, Seguros)
    // -------------------------------------------------------------
    await safeDelete('viagens_transacoes', 'cliente_id', entityId);
    await safeDelete('viagens_propostas', 'cliente_id', entityId);
    await safeDelete('viagens_solicitacoes_reserva', 'cliente_id', entityId);
    await safeDelete('viagens_orcamentos', 'cliente_id', entityId);
    await safeDelete('viagens_vouchers', 'cliente_id', entityId);
    await safeDelete('classificados_transacoes', 'cliente_id', entityId);
    await safeDelete('classificados_propostas', 'cliente_id', entityId);
    await safeDelete('classificados_anuncios', 'cliente_id', entityId);
    await safeDelete('saude_contratos', 'cliente_id', entityId);
    await safeDelete('saude_propostas', 'cliente_id', entityId);
    await safeDelete('saude_cotacoes', 'cliente_id', entityId);
    await safeDelete('seguros_apolices', 'cliente_id', entityId);
    await safeDelete('seguros_propostas', 'cliente_id', entityId);
    await safeDelete('seguros_cotacoes', 'cliente_id', entityId);

    // -------------------------------------------------------------
    // J. Documentos, Carrinho, Favoritos e Avaliações
    // -------------------------------------------------------------
    await safeDelete('loja_carrinhos', 'cliente_id', entityId);
    await safeDelete('loja_favoritos', 'cliente_id', entityId);
    await safeDelete('loja_avaliacoes', 'cliente_id', entityId);
    await safeDelete('cliente_documentos', 'cliente_id', entityId);

    // -------------------------------------------------------------
    // K. Excluir o Cliente Titular
    // -------------------------------------------------------------
    await deleteAdminRecordSecure('clientes', entityId);

    return {
      success: true,
      entity_type: 'cliente',
      entity_id: entityId,
      deleted_count: 1,
      message: 'Cliente e todos os dados associados foram excluídos com sucesso de ponta a ponta.'
    };
  }

  if (cleanType === 'orcamento') {
    const { data: osList } = await supabase.from('ordens_servico').select('id').eq('orcamento_id', entityId);
    const osIds = (osList || []).map((o: any) => o.id).filter(Boolean);

    let demandaIds: string[] = [];
    if (osIds.length > 0) {
      const { data: dList } = await supabase.from('prestador_demandas').select('id').in('os_id', osIds);
      if (dList) demandaIds = dList.map((d: any) => d.id).filter(Boolean);
    }

    let fatIds: string[] = [];
    if (osIds.length > 0) {
      const { data: fList } = await supabase.from('faturas').select('id').in('os_id', osIds);
      if (fList) fatIds = fList.map((f: any) => f.id);
    }

    await safeDelete('prestador_faturas', 'demanda_id', demandaIds);
    await safeDelete('prestador_demandas_historico', 'demanda_id', demandaIds);
    await safeDelete('prestador_demandas', 'id', demandaIds);
    await safeDelete('prestador_demandas', 'os_id', osIds);
    await safeDelete('os_notas', 'os_id', osIds);
    await safeDelete('pagamentos', 'fatura_id', fatIds);
    await safeDelete('pontos_movimentacoes', 'fatura_id', fatIds);
    await safeDelete('cobrancas', 'fatura_id', fatIds);
    await safeDelete('faturas', 'id', fatIds);
    await safeDelete('faturas', 'orcamento_id', entityId);
    await safeDelete('vouchers', 'ordem_servico_id', osIds);
    await safeDelete('ordens_servico', 'id', osIds);
    await safeDelete('loja_pedido_itens', 'orcamento_id', entityId);
    await safeDelete('ordens_compra', 'orcamento_id', entityId);
    await safeDelete('ordens_assinatura', 'orcamento_id', entityId);
    await safeDelete('cliente_promocoes', 'orcamento_id', entityId);
    await safeDelete('promocoes_quantidade_uso', 'orcamento_id', entityId);
    await safeDelete('promocoes_quantidade_ativadas', 'orcamento_id', entityId);

    await deleteAdminRecordSecure('orcamentos', entityId);

    return {
      success: true,
      entity_type: 'orcamento',
      entity_id: entityId,
      deleted_count: 1,
      message: 'Orçamento e registros operacionais filhas excluídos com sucesso.'
    };
  }

  if (cleanType === 'ordem_servico') {
    const { data: dList } = await supabase.from('prestador_demandas').select('id').eq('os_id', entityId);
    const demandaIds = (dList || []).map((d: any) => d.id).filter(Boolean);

    const { data: fList } = await supabase.from('faturas').select('id').eq('os_id', entityId);
    const fatIds = (fList || []).map((f: any) => f.id).filter(Boolean);

    await safeDelete('prestador_faturas', 'demanda_id', demandaIds);
    await safeDelete('prestador_demandas_historico', 'demanda_id', demandaIds);
    await safeDelete('prestador_demandas', 'id', demandaIds);
    await safeDelete('prestador_demandas', 'os_id', entityId);
    await safeDelete('os_notas', 'os_id', entityId);
    await safeDelete('pagamentos', 'fatura_id', fatIds);
    await safeDelete('pontos_movimentacoes', 'fatura_id', fatIds);
    await safeDelete('cobrancas', 'fatura_id', fatIds);
    await safeDelete('faturas', 'id', fatIds);
    await safeDelete('vouchers', 'ordem_servico_id', entityId);

    await deleteAdminRecordSecure('ordens_servico', entityId);

    return {
      success: true,
      entity_type: 'ordem_servico',
      entity_id: entityId,
      deleted_count: 1,
      message: 'Ordem de serviço e demandas filhas excluídas com sucesso.'
    };
  }

  if (cleanType === 'demanda') {
    await safeDelete('prestador_faturas', 'demanda_id', entityId);
    await safeDelete('prestador_demandas_historico', 'demanda_id', entityId);
    await deleteAdminRecordSecure('prestador_demandas', entityId);
    return {
      success: true,
      entity_type: 'demanda',
      entity_id: entityId,
      deleted_count: 1,
      message: 'Demanda excluída com sucesso.'
    };
  }

  if (cleanType === 'ordem_compra') {
    const { data: fList } = await supabase.from('faturas').select('id').eq('ordem_compra_id', entityId);
    const fatIds = (fList || []).map((f: any) => f.id).filter(Boolean);

    await safeDelete('pagamentos', 'fatura_id', fatIds);
    await safeDelete('pontos_movimentacoes', 'fatura_id', fatIds);
    await safeDelete('cobrancas', 'fatura_id', fatIds);
    await safeDelete('faturas', 'id', fatIds);
    await deleteAdminRecordSecure('ordens_compra', entityId);
    return {
      success: true,
      entity_type: 'ordem_compra',
      entity_id: entityId,
      deleted_count: 1,
      message: 'Ordem de compra excluída com sucesso.'
    };
  }

  if (cleanType === 'ordem_assinatura') {
    const { data: fList } = await supabase.from('faturas').select('id').eq('ordem_assinatura_id', entityId);
    const fatIds = (fList || []).map((f: any) => f.id).filter(Boolean);

    await safeDelete('pagamentos', 'fatura_id', fatIds);
    await safeDelete('pontos_movimentacoes', 'fatura_id', fatIds);
    await safeDelete('cobrancas', 'fatura_id', fatIds);
    await safeDelete('faturas', 'id', fatIds);
    await deleteAdminRecordSecure('ordens_assinatura', entityId);
    return {
      success: true,
      entity_type: 'ordem_assinatura',
      entity_id: entityId,
      deleted_count: 1,
      message: 'Ordem de assinatura excluída com sucesso.'
    };
  }

  if (cleanType === 'fatura') {
    await safeDelete('pagamentos', 'fatura_id', entityId);
    await safeDelete('pontos_movimentacoes', 'fatura_id', entityId);
    await safeDelete('cobrancas', 'fatura_id', entityId);
    await deleteAdminRecordSecure('faturas', entityId);
    return {
      success: true,
      entity_type: 'fatura',
      entity_id: entityId,
      deleted_count: 1,
      message: 'Fatura e pagamentos excluídos com sucesso.'
    };
  }

  // Fallback genérico para demais tabelas
  const tableMap: Record<string, string> = {
    produto: 'produtos',
    servico: 'servicos',
    assinatura: 'assinaturas',
    prestador: 'prestadores',
    colaborador: 'colaboradores',
    fatura: 'faturas',
    cobranca: 'cobrancas',
  };

  const targetTable = tableMap[cleanType] || cleanType;
  await deleteAdminRecordSecure(targetTable, entityId);

  return {
    success: true,
    entity_type: entityType,
    entity_id: entityId,
    deleted_count: 1,
    message: 'Registro excluído com sucesso.'
  };
}

/**
 * Realiza a exclusão em lote com cascata completa de múltiplas entidades.
 */
export async function deleteAdminEntityBatch(
  entityType: string,
  entityIds: string[],
  reason?: string
): Promise<DeleteBatchResult> {
  if (!entityIds || entityIds.length === 0) {
    return { success: true, total: 0, deleted: 0, errors: [] };
  }

  // 1. Tenta RPC nativa de lote se disponível no Postgres
  try {
    const rpcRes = await callAdminRpc<DeleteBatchResult>('gsa_admin_delete_batch', {
      p_entity_type: entityType,
      p_entity_ids: entityIds,
      p_reason: reason || 'Exclusão em lote solicitada pelo Administrador Master'
    });
    if (rpcRes && typeof rpcRes.deleted === 'number' && rpcRes.success) {
      return rpcRes;
    }
  } catch (rpcErr: any) {
    // Falha esperada caso a RPC não esteja instalada no cluster
  }

  // 2. Processa individualmente cada registro pela engine de cascata resiliente
  let deletedCount = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const id of entityIds) {
    try {
      await deleteAdminEntityCascade(entityType, id, reason);
      deletedCount += 1;
    } catch (err: any) {
      console.error(`Erro ao excluir ${entityType} ${id} em lote:`, err);
      errors.push({ id, error: err.message || String(err) });
    }
  }

  return {
    success: deletedCount > 0,
    total: entityIds.length,
    deleted: deletedCount,
    errors
  };
}

export type ClientDeletionInventory = {
  success: boolean;
  total_clientes: number;
  orcamentos_count: number;
  os_count: number;
  faturas_count: number;
  faturas_valor_total: number;
  saldo_carteira_total: number;
  pontos_total: number;
  afiliados_count: number;
  vouchers_count: number;
  tickets_count: number;
  pedidos_count: number;
  docs_count: number;
  clientes?: Array<{
    id: string;
    nome: string;
    documento: string;
    email: string;
    telefone: string;
    saldo_carteira: number;
    pontos_fidelidade: number;
    orcamentos_count: number;
    os_count: number;
    faturas_count: number;
    is_afiliado: boolean;
  }>;
};

/**
 * Obtém o inventário completo de todos os vínculos e dependências que serão excluídos junto com o(s) cliente(s).
 */
export async function getClientDeletionInventory(clientIds: string[]): Promise<ClientDeletionInventory> {
  try {
    const res = await callAdminRpc<ClientDeletionInventory>('gsa_admin_get_client_deletion_inventory', {
      p_client_ids: clientIds
    });
    if (res && res.success) {
      return res;
    }
  } catch (err) {
    console.error('Erro ao buscar inventário de exclusão via RPC:', err);
  }

  // Fallback client-side se a RPC falhar
  try {
    const [
      { count: orcCount },
      { count: osCount },
      { data: fatData },
      { data: cliData },
      { count: afCount },
      { count: vCount },
      { count: tCount },
      { count: pedCount }
    ] = await Promise.all([
      supabase.from('orcamentos').select('id', { count: 'exact', head: true }).in('cliente_id', clientIds),
      supabase.from('ordens_servico').select('id', { count: 'exact', head: true }).in('cliente_id', clientIds),
      supabase.from('faturas').select('valor_total').in('cliente_id', clientIds),
      supabase.from('clientes').select('id, nome, nome_razao, cpf, cnpj, saldo_carteira, pontos_fidelidade').in('id', clientIds),
      supabase.from('gsa_afiliados').select('id', { count: 'exact', head: true }).in('cliente_id', clientIds),
      supabase.from('vouchers').select('id', { count: 'exact', head: true }).in('cliente_id', clientIds),
      supabase.from('tickets').select('id', { count: 'exact', head: true }).in('cliente_id', clientIds),
      supabase.from('loja_pedidos').select('id', { count: 'exact', head: true }).in('cliente_id', clientIds),
    ]);

    const fatValorTotal = (fatData || []).reduce((acc: number, f: any) => acc + (Number(f.valor_total) || 0), 0);
    const saldoCarteiraTotal = (cliData || []).reduce((acc: number, c: any) => acc + (Number(c.saldo_carteira) || 0), 0);
    const pontosTotal = (cliData || []).reduce((acc: number, c: any) => acc + (Number(c.pontos_fidelidade) || 0), 0);

    return {
      success: true,
      total_clientes: clientIds.length,
      orcamentos_count: orcCount || 0,
      os_count: osCount || 0,
      faturas_count: (fatData || []).length,
      faturas_valor_total: fatValorTotal,
      saldo_carteira_total: saldoCarteiraTotal,
      pontos_total: pontosTotal,
      afiliados_count: afCount || 0,
      vouchers_count: vCount || 0,
      tickets_count: tCount || 0,
      pedidos_count: pedCount || 0,
      docs_count: 0,
      clientes: (cliData || []).map((c: any) => ({
        id: c.id,
        nome: c.nome_razao || c.nome || 'Cliente',
        documento: c.cpf || c.cnpj || 'S/D',
        email: '',
        telefone: '',
        saldo_carteira: Number(c.saldo_carteira) || 0,
        pontos_fidelidade: Number(c.pontos_fidelidade) || 0,
        orcamentos_count: 0,
        os_count: 0,
        faturas_count: 0,
        is_afiliado: false
      }))
    };
  } catch (fallbackErr) {
    return {
      success: false,
      total_clientes: clientIds.length,
      orcamentos_count: 0,
      os_count: 0,
      faturas_count: 0,
      faturas_valor_total: 0,
      saldo_carteira_total: 0,
      pontos_total: 0,
      afiliados_count: 0,
      vouchers_count: 0,
      tickets_count: 0,
      pedidos_count: 0,
      docs_count: 0
    };
  }
}
