import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { logValidation, supabase } from './base';

type ValidationState = {
  cliente_id?: string;
  cliente_sessao_id?: string;
  cliente_session_token?: string;
  validacao_assinaturas?: Record<string, unknown>;
  [key: string]: unknown;
};

type RpcResult = {
  success?: boolean;
  already_exists?: boolean;
  already_processed?: boolean;
  status?: string;
  faturas_ids?: string[];
  meses?: number;
  faturas_futuras_canceladas?: number;
};

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);
const normalizeDateOnly = (value: unknown) => String(value || '').slice(0, 10);

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const addMonths = (date: Date, months: number) => {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
};

const requireValue = (value: string | undefined, name: string) => {
  if (!value?.trim()) {
    throw new Error(`Variável obrigatória não informada: ${name}.`);
  }
  return value.trim();
};

async function validateSubscriptions() {
  logValidation('INICIANDO VALIDAÇÃO: CICLO REAL DE ASSINATURAS');

  const statePath = resolve(process.cwd(), 'src/validation/state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as ValidationState;

  const supabaseUrl = requireValue(process.env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL');
  const serviceRoleKey = requireValue(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  const clienteId = requireValue(
    process.env.VALIDATION_CLIENT_ID || state.cliente_id,
    'VALIDATION_CLIENT_ID ou state.cliente_id',
  );
  const sessaoId = requireValue(
    process.env.VALIDATION_CLIENT_SESSION_ID || state.cliente_sessao_id,
    'VALIDATION_CLIENT_SESSION_ID ou state.cliente_sessao_id',
  );
  const sessionToken = requireValue(
    process.env.VALIDATION_CLIENT_SESSION_TOKEN || state.cliente_session_token,
    'VALIDATION_CLIENT_SESSION_TOKEN ou state.cliente_session_token',
  );

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  const planId = randomUUID();
  const orderId = randomUUID();
  const initialInvoiceId = randomUUID();
  const extensionRequestId = randomUUID();
  const cancellationRequestId = randomUUID();
  const requestIds = [extensionRequestId, cancellationRequestId];

  const today = new Date();
  const initialDueDate = toDateOnly(addMonths(today, 1));
  const cancellationDate = toDateOnly(addDays(today, 1));
  const monthlyValue = 79.9;

  let generatedInvoiceIds: string[] = [];
  let completed = false;

  try {
    logValidation('Criando plano, ordem ativa e fatura inicial isolados...');

    const { error: planError } = await service.from('assinaturas').insert({
      id: planId,
      codigo_assinatura: `ASS-VAL-${suffix}`,
      nome: `Plano Validação ${suffix}`,
      descricao: 'Registro temporário criado pela validação automatizada.',
      valor: monthlyValue,
      status: 'ativo',
      tipo_cliente: 'pf',
      visivel_na_loja: false,
      ocultar_valor: true,
    });
    if (planError) throw planError;

    const { error: orderError } = await service.from('ordens_assinatura').insert({
      id: orderId,
      codigo_ordem: `OA-VAL-${suffix}`,
      assinatura_id: planId,
      cliente_id: clienteId,
      status: 'concluido',
      prazo_meses: 1,
      data_inicio: toDateOnly(today),
      data_vencimento: initialDueDate,
    });
    if (orderError) throw orderError;

    const { error: initialInvoiceError } = await service.from('faturas').insert({
      id: initialInvoiceId,
      codigo_fatura: `FAT-VAL-${suffix}-00`,
      ordem_assinatura_id: orderId,
      cliente_id: clienteId,
      valor_total: monthlyValue,
      valor_pago: 0,
      valor_final_pendente: monthlyValue,
      status: 'pendente',
      tipo: 'assinatura',
      data_vencimento: initialDueDate,
      gerada_automaticamente: true,
      itens_faturados: [
        {
          id: `mensalidade-inicial-${suffix}`,
          codigo: `ASS-VAL-${suffix}`,
          descricao: 'Mensalidade inicial da validação automatizada',
          valor: monthlyValue,
          quantidade: 1,
        },
      ],
    });
    if (initialInvoiceError) throw initialInvoiceError;

    logValidation('Executando prorrogação de dois meses pela RPC do cliente...');
    const { data: extensionData, error: extensionError } = await supabase.rpc(
      'gsa_client_extend_subscription',
      {
        p_sessao_id: sessaoId,
        p_session_token: sessionToken,
        p_request_id: extensionRequestId,
        p_ordem_assinatura_id: orderId,
        p_meses: 2,
      },
    );
    if (extensionError) throw extensionError;

    const extension = extensionData as RpcResult;
    if (!extension?.success || extension.already_exists) {
      throw new Error('A primeira prorrogação não foi processada como nova operação.');
    }

    generatedInvoiceIds = Array.isArray(extension.faturas_ids) ? extension.faturas_ids : [];
    if (generatedInvoiceIds.length !== 2) {
      throw new Error(`Esperadas 2 faturas de prorrogação; recebidas ${generatedInvoiceIds.length}.`);
    }

    logValidation('Repetindo a prorrogação com o mesmo request_id para validar idempotência...');
    const { data: repeatedExtensionData, error: repeatedExtensionError } = await supabase.rpc(
      'gsa_client_extend_subscription',
      {
        p_sessao_id: sessaoId,
        p_session_token: sessionToken,
        p_request_id: extensionRequestId,
        p_ordem_assinatura_id: orderId,
        p_meses: 10,
      },
    );
    if (repeatedExtensionError) throw repeatedExtensionError;

    const repeatedExtension = repeatedExtensionData as RpcResult;
    if (!repeatedExtension?.success || repeatedExtension.already_exists !== true) {
      throw new Error('A prorrogação repetida não foi reconhecida como idempotente.');
    }

    const { data: extendedOrder, error: extendedOrderError } = await service
      .from('ordens_assinatura')
      .select('status, prazo_meses, data_vencimento')
      .eq('id', orderId)
      .single();
    if (extendedOrderError) throw extendedOrderError;
    if (extendedOrder.status !== 'concluido' || Number(extendedOrder.prazo_meses) !== 3) {
      throw new Error('A ordem não permaneceu ativa com prazo total de 3 meses.');
    }

    const { data: invoicesAfterExtension, error: invoicesAfterExtensionError } = await service
      .from('faturas')
      .select('id, status, data_vencimento')
      .eq('ordem_assinatura_id', orderId)
      .order('data_vencimento', { ascending: true });
    if (invoicesAfterExtensionError) throw invoicesAfterExtensionError;
    if ((invoicesAfterExtension || []).length !== 3) {
      throw new Error(`Esperadas 3 faturas totais após a prorrogação; encontradas ${(invoicesAfterExtension || []).length}.`);
    }

    const paidInvoiceId = generatedInvoiceIds[0];
    const { error: paidInvoiceError } = await service
      .from('faturas')
      .update({
        status: 'pago',
        valor_pago: monthlyValue,
        valor_final_pendente: 0,
        data_pagamento: new Date().toISOString(),
      })
      .eq('id', paidInvoiceId);
    if (paidInvoiceError) throw paidInvoiceError;

    logValidation('Executando cancelamento futuro pela RPC do cliente...');
    const { data: cancellationData, error: cancellationError } = await supabase.rpc(
      'gsa_client_cancel_subscription',
      {
        p_sessao_id: sessaoId,
        p_session_token: sessionToken,
        p_request_id: cancellationRequestId,
        p_ordem_assinatura_id: orderId,
        p_data_cancelamento: cancellationDate,
      },
    );
    if (cancellationError) throw cancellationError;

    const cancellation = cancellationData as RpcResult;
    if (!cancellation?.success || cancellation.status !== 'em_cancelamento') {
      throw new Error('O cancelamento futuro não deixou a assinatura em cancelamento agendado.');
    }

    logValidation('Repetindo o cancelamento com o mesmo request_id para validar idempotência...');
    const { data: repeatedCancellationData, error: repeatedCancellationError } = await supabase.rpc(
      'gsa_client_cancel_subscription',
      {
        p_sessao_id: sessaoId,
        p_session_token: sessionToken,
        p_request_id: cancellationRequestId,
        p_ordem_assinatura_id: orderId,
        p_data_cancelamento: toDateOnly(addDays(today, 15)),
      },
    );
    if (repeatedCancellationError) throw repeatedCancellationError;

    const repeatedCancellation = repeatedCancellationData as RpcResult;
    if (!repeatedCancellation?.success || repeatedCancellation.already_exists !== true) {
      throw new Error('O cancelamento repetido não foi reconhecido como idempotente.');
    }

    const { data: cancelledOrder, error: cancelledOrderError } = await service
      .from('ordens_assinatura')
      .select('status, data_cancelamento, valor_proporcional_cancelamento')
      .eq('id', orderId)
      .single();
    if (cancelledOrderError) throw cancelledOrderError;
    if (cancelledOrder.status !== 'em_cancelamento') {
      throw new Error(`Status final inesperado da ordem: ${cancelledOrder.status}.`);
    }
    if (normalizeDateOnly(cancelledOrder.data_cancelamento) !== cancellationDate) {
      throw new Error('A repetição do cancelamento alterou a data original da operação.');
    }
    if (cancelledOrder.valor_proporcional_cancelamento !== null) {
      throw new Error('Foi criado valor proporcional automático, contrariando a regra financeira definida.');
    }

    const { data: invoicesAfterCancellation, error: invoicesAfterCancellationError } = await service
      .from('faturas')
      .select('id, status, data_vencimento, valor_final_pendente')
      .eq('ordem_assinatura_id', orderId);
    if (invoicesAfterCancellationError) throw invoicesAfterCancellationError;

    const paidInvoice = (invoicesAfterCancellation || []).find(invoice => invoice.id === paidInvoiceId);
    if (!paidInvoice || paidInvoice.status !== 'pago') {
      throw new Error('A fatura paga não foi preservada durante o cancelamento.');
    }

    const unpaidFutureInvoices = (invoicesAfterCancellation || []).filter(
      invoice => invoice.id !== paidInvoiceId && normalizeDateOnly(invoice.data_vencimento) > cancellationDate,
    );
    if (unpaidFutureInvoices.length === 0) {
      throw new Error('A validação não encontrou cobranças futuras não pagas para conferir.');
    }
    if (unpaidFutureInvoices.some(invoice => invoice.status !== 'cancelado' || Number(invoice.valor_final_pendente) !== 0)) {
      throw new Error('Nem todas as cobranças futuras não pagas foram canceladas corretamente.');
    }

    state.validacao_assinaturas = {
      executada_em: new Date().toISOString(),
      status: 'sucesso',
      prorrogacao_idempotente: true,
      cancelamento_idempotente: true,
      faturas_geradas_na_prorrogacao: generatedInvoiceIds.length,
      fatura_paga_preservada: true,
      faturas_futuras_canceladas: unpaidFutureInvoices.length,
      estorno_proporcional_automatico: false,
    };
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    completed = true;
    logValidation('VALIDAÇÃO DO CICLO DE ASSINATURAS CONCLUÍDA COM SUCESSO', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logValidation(`ERRO NA VALIDAÇÃO DE ASSINATURAS: ${message}`, 'error');
    throw error;
  } finally {
    logValidation('Removendo dados temporários da validação...');

    const cleanupErrors: string[] = [];
    const cleanup = async (label: string, operation: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await operation;
      if (error) cleanupErrors.push(`${label}: ${error.message}`);
    };

    await cleanup('notificações', service.from('notificacoes').delete().eq('item_id', orderId));
    await cleanup('requisições idempotentes', service.from('gsa_client_operation_requests').delete().in('request_id', requestIds));
    await cleanup('faturas', service.from('faturas').delete().eq('ordem_assinatura_id', orderId));
    await cleanup('ordem de assinatura', service.from('ordens_assinatura').delete().eq('id', orderId));
    await cleanup('plano de assinatura', service.from('assinaturas').delete().eq('id', planId));

    if (cleanupErrors.length > 0) {
      logValidation(`Limpeza incompleta: ${cleanupErrors.join(' | ')}`, 'warning');
      if (completed) {
        throw new Error(`A validação passou, mas a limpeza falhou: ${cleanupErrors.join(' | ')}`);
      }
    } else {
      logValidation('Dados temporários removidos.', 'success');
    }
  }
}

validateSubscriptions().catch(() => {
  process.exitCode = 1;
});
