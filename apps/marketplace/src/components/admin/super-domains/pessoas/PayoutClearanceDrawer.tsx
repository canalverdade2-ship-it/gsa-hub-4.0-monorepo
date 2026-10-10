import React, { useState, useEffect } from 'react';
import { 
  DollarSign, CheckCircle, XCircle, Clock, AlertTriangle, 
  Copy, Check, FileText, Upload, Calendar, ArrowRight, 
  Building2, User, Phone, Mail, ShieldCheck, CreditCard, Sparkles, ExternalLink
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { CommandSlideOver, StatusBadge } from '../shared';
import { formatCurrency, formatDate, formatDateTime, copyToClipboard, maskCPF, maskCNPJ, maskPhone } from '../../../../lib/utils';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { notificationService } from '../../../../lib/notificationService';
import { logService } from '../../../../lib/logService';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

export interface UnifiedSaqueItem {
  id: string;
  tipo_solicitante: 'prestador' | 'cliente';
  prestador_id?: string;
  cliente_id?: string;
  nome_titular: string;
  documento_titular?: string;
  email_titular?: string;
  telefone_titular?: string;
  valor: number;
  status: 'pendente' | 'pago' | 'rejeitado' | 'cancelado' | string;
  pix_tipo?: string | null;
  pix_chave?: string | null;
  banco_nome?: string | null;
  agencia?: string | null;
  conta?: string | null;
  conta_tipo?: string | null;
  motivo_recusa?: string | null;
  data_pagamento?: string | null;
  comprovante_url?: string | null;
  created_at: string;
  raw_data?: any;
}

export interface PayoutClearanceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  saque: UnifiedSaqueItem | null;
  onSuccess: () => void;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
}

export function PayoutClearanceDrawer({
  isOpen,
  onClose,
  saque,
  onSuccess,
  colaboradorId,
  colaboradorNome
}: PayoutClearanceDrawerProps) {
  const [activeTab, setActiveTab] = useState<'clearance' | 'titular' | 'historico'>('clearance');
  const [decisionMode, setDecisionMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState(false);
  useRealtimeSubscription([
    { table: 'prestador_saques', enabled: isOpen },
    { table: 'saques', enabled: isOpen }
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (saque) {
      setDecisionMode('idle');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setRejectReason('');
      setActiveTab('clearance');
      setCopiedKey(false);
    }
  }, [saque]);

  if (!saque) return null;

  const handleCopyPix = () => {
    const key = saque.pix_chave || saque.documento_titular || '';
    if (!key) return;
    copyToClipboard(key);
    setCopiedKey(true);
    toast.success('Chave PIX copiada com sucesso!');
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleExecuteApproval = async () => {
    if (!paymentDate) {
      toast.error('Selecione a data efetiva do pagamento.');
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading('Processando liberação e liquidação do repasse...');

    try {
      if (saque.tipo_solicitante === 'prestador') {
        const result = await callAdminRpc<any>('gsa_admin_processar_saque_prestador', {
          p_saque_id: saque.id,
          p_acao: 'aprovar',
          p_motivo: null,
          p_data_pagamento: paymentDate
        });

        if (result && !result.already_processed) {
          if (saque.prestador_id) {
            await notificationService.notifyProvider(
              saque.prestador_id,
              '💰 Repasse Realizado com Sucesso!',
              `Seu saque/repasse no valor de ${formatCurrency(saque.valor)} foi creditado em sua conta.`,
              'financeiro',
              'prestador_saque_pago',
              { itemId: saque.id, tab: 'historico' }
            );
          }
        }

        await logService.logAction({
          ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
          ator_id: colaboradorId || 'admin',
          ator_nome: colaboradorNome || 'Administrador',
          acao: 'APROVAR_SAQUE_PRESTADOR',
          detalhes: `Aprovou repasse de ${formatCurrency(saque.valor)} para o prestador ${saque.nome_titular} (Ref: #${saque.id.slice(0, 8)})`
        });
      } else {
        // Cliente
        const result = await callAdminRpc<any>('gsa_admin_processar_saque', {
          p_saque_id: saque.id,
          p_acao: 'aprovar',
          p_motivo: null,
          p_data_pagamento: paymentDate
        });

        if (saque.cliente_id) {
          await notificationService.notifyClient(
            saque.cliente_id,
            '💰 Saque Concluído com Sucesso!',
            `Seu resgate de ${formatCurrency(saque.valor)} foi pago e enviado via PIX.`,
            'financeiro',
            'saque_pago',
            { prioridade: 'alta', contexto: { saque_id: saque.id, valor: saque.valor } }
          );
        }

        await logService.logAction({
          ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
          ator_id: colaboradorId || 'admin',
          ator_nome: colaboradorNome || 'Administrador',
          acao: 'APROVAR_SAQUE_CLIENTE',
          detalhes: `Aprovou saque de ${formatCurrency(saque.valor)} para o cliente ${saque.nome_titular} (Ref: #${saque.id.slice(0, 8)})`
        });
      }

      toast.success('Repasse liquidado com sucesso!', { id: toastId });
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao aprovar repasse:', err);
      toast.error(`Falha ao liquidar repasse: ${err.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteRejection = async () => {
    if (!rejectReason.trim()) {
      toast.error('Informe a justificativa/motivo da recusa do repasse.');
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading('Processando recusa e estorno de saldo...');

    try {
      if (saque.tipo_solicitante === 'prestador') {
        await callAdminRpc<any>('gsa_admin_processar_saque_prestador', {
          p_saque_id: saque.id,
          p_acao: 'rejeitar',
          p_motivo: rejectReason.trim(),
          p_data_pagamento: null
        });

        if (saque.prestador_id) {
          await notificationService.notifyProvider(
            saque.prestador_id,
            '⚠️ Repasse Recusado',
            `Sua solicitação de saque no valor de ${formatCurrency(saque.valor)} foi recusada. Motivo: ${rejectReason.trim()}`,
            'financeiro',
            'prestador_saque_recusado',
            { itemId: saque.id, tab: 'historico' }
          );
        }

        await logService.logAction({
          ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
          ator_id: colaboradorId || 'admin',
          ator_nome: colaboradorNome || 'Administrador',
          acao: 'REJEITAR_SAQUE_PRESTADOR',
          detalhes: `Recusou repasse de ${formatCurrency(saque.valor)} para ${saque.nome_titular}. Motivo: ${rejectReason.trim()}`
        });
      } else {
        // Cliente
        await callAdminRpc<any>('gsa_admin_processar_saque', {
          p_saque_id: saque.id,
          p_acao: 'rejeitar',
          p_motivo: rejectReason.trim(),
          p_data_pagamento: null
        });

        if (saque.cliente_id) {
          await notificationService.notifyClient(
            saque.cliente_id,
            '⚠️ Solicitação de Saque Recusada',
            `Seu saque no valor de ${formatCurrency(saque.valor)} foi recusado. Motivo: ${rejectReason.trim()}. O saldo foi estornado para sua carteira.`,
            'financeiro',
            'saque_recusado',
            { prioridade: 'alta', contexto: { saque_id: saque.id, valor: saque.valor, motivo: rejectReason.trim() } }
          );
        }

        await logService.logAction({
          ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
          ator_id: colaboradorId || 'admin',
          ator_nome: colaboradorNome || 'Administrador',
          acao: 'REJEITAR_SAQUE_CLIENTE',
          detalhes: `Recusou saque de ${formatCurrency(saque.valor)} para ${saque.nome_titular}. Motivo: ${rejectReason.trim()}`
        });
      }

      toast.success('Repasse recusado e saldo estornado!', { id: toastId });
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao recusar repasse:', err);
      toast.error(`Falha ao recusar repasse: ${err.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const isPendente = saque.status === 'pendente' || saque.status === 'aguardando' || saque.status === 'em_analise';

  return (
    <CommandSlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Mesa de Liquidação de Repasses"
      subtitle={`Protocolo #${saque.id.slice(0, 8).toUpperCase()} • Solicitado em ${formatDateTime(saque.created_at)}`}
      badge={<StatusBadge status={saque.status} size="sm" />}
      width="lg"
      tabs={[
        { id: 'clearance', label: 'Liquidação & PIX', icon: DollarSign },
        { id: 'titular', label: 'Dossiê do Titular', icon: User },
        { id: 'historico', label: 'Histórico & Dados', icon: FileText }
      ]}
      activeTab={activeTab}
      onTabChange={(t) => setActiveTab(t as any)}
    >
      <div className="space-y-6">
        {/* Value Hero Banner */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100/60 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500">
                Valor Líquido do Repasse
              </span>
              <div className="mt-1 text-3xl font-black text-slate-900 font-mono tracking-tight tabular-nums">
                {formatCurrency(saque.valor)}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-200/80 px-2 py-0.5 font-semibold text-[11px] uppercase">
                  {saque.tipo_solicitante === 'prestador' ? 'Prestador de Serviço' : 'Cliente (Resgate / Cashback)'}
                </span>
                <span>•</span>
                <span>Titular: <strong>{saque.nome_titular}</strong></span>
              </div>
            </div>

            <div className="text-right flex flex-col sm:items-end">
              <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500">Status Atual</span>
              <div className="mt-1">
                <StatusBadge status={saque.status} size="md" pulse={isPendente} />
              </div>
            </div>
          </div>
        </div>

        {/* Tab 1: Clearance & PIX */}
        {activeTab === 'clearance' && (
          <div className="space-y-5">
            {/* PIX Key Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Chave PIX Cadastrada
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Tipo: <span className="font-semibold uppercase">{saque.pix_tipo || 'Padrão / CPF'}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyPix}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {copiedKey ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiada!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-slate-500" />
                      <span>Copiar Chave</span>
                    </>
                  )}
                </button>
              </div>

              <div className="mt-3 rounded-lg bg-slate-900 p-3 text-white font-mono text-xs sm:text-sm break-all flex items-center justify-between gap-3 select-all">
                <span>{saque.pix_chave || saque.documento_titular || 'Chave PIX não informada no registro'}</span>
              </div>

              {saque.banco_nome && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs border-t border-slate-100 pt-3 text-slate-600">
                  <div>
                    <span className="text-[10px] uppercase text-slate-400 font-bold block">Banco</span>
                    <span className="font-medium text-slate-800">{saque.banco_nome}</span>
                  </div>
                  {saque.agencia && (
                    <div>
                      <span className="text-[10px] uppercase text-slate-400 font-bold block">Agência</span>
                      <span className="font-medium text-slate-800">{saque.agencia}</span>
                    </div>
                  )}
                  {saque.conta && (
                    <div>
                      <span className="text-[10px] uppercase text-slate-400 font-bold block">Conta ({saque.conta_tipo || 'Corrente'})</span>
                      <span className="font-medium text-slate-800">{saque.conta}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Decision Controls */}
            {isPendente ? (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Ação de Liquidação
                </h4>

                {decisionMode === 'idle' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setDecisionMode('approve')}
                      className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.99] transition-all uppercase tracking-wider"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Aprovar & Liquidar Repasse
                    </button>

                    <button
                      type="button"
                      onClick={() => setDecisionMode('reject')}
                      className="flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 hover:bg-rose-100 active:scale-[0.99] transition-all uppercase tracking-wider"
                    >
                      <XCircle className="h-4 w-4" />
                      Recusar & Estornar Saldo
                    </button>
                  </div>
                )}

                {decisionMode === 'approve' && (
                  <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                      <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        Confirmação de Pagamento Efetivado
                      </div>
                      <button
                        type="button"
                        onClick={() => setDecisionMode('idle')}
                        className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Data Efetiva da Transferência / PIX
                      </label>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="rounded-lg bg-white p-3 border border-emerald-100 text-xs text-slate-600">
                      <p>
                        Ao confirmar, o sistema registrará a baixa do repasse de <strong>{formatCurrency(saque.valor)}</strong>, atualizará o saldo contábil e enviará notificação automática ao solicitante.
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setDecisionMode('idle')}
                        disabled={isProcessing}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteApproval}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 uppercase tracking-wider disabled:opacity-50"
                      >
                        {isProcessing ? 'Processando...' : 'Confirmar Liquidação'}
                      </button>
                    </div>
                  </div>
                )}

                {decisionMode === 'reject' && (
                  <div className="space-y-4 rounded-lg border border-rose-200 bg-rose-50/50 p-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                      <div className="flex items-center gap-2 text-rose-800 font-bold text-xs uppercase tracking-wider">
                        <XCircle className="h-4 w-4 text-rose-600" />
                        Recusa de Repasse & Devolução de Saldo
                      </div>
                      <button
                        type="button"
                        onClick={() => setDecisionMode('idle')}
                        className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Motivo / Justificativa da Recusa <span className="text-rose-600">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Ex: Chave PIX incorreta, inconsistência cadastral ou documentação pendente..."
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>

                    <div className="rounded-lg bg-white p-3 border border-rose-100 text-xs text-slate-600">
                      <p>
                        O valor integral de <strong>{formatCurrency(saque.valor)}</strong> será estornado imediatamente para o saldo da carteira do titular.
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setDecisionMode('idle')}
                        disabled={isProcessing}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteRejection}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 uppercase tracking-wider disabled:opacity-50"
                      >
                        {isProcessing ? 'Processando...' : 'Confirmar Recusa & Estorno'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700 text-xs">
                <div className="flex items-center gap-2 font-bold uppercase text-slate-900 mb-1">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Repasse Finalizado
                </div>
                {saque.data_pagamento && (
                  <p className="mt-1">
                    Data da liquidação: <strong>{formatDate(saque.data_pagamento)}</strong>
                  </p>
                )}
                {saque.motivo_recusa && (
                  <p className="mt-1 text-rose-700">
                    Motivo da recusa: <strong>{saque.motivo_recusa}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Titular Dossier */}
        {activeTab === 'titular' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
                Dados Cadastrais do Titular
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Nome Completo / Razão Social</span>
                  <span className="font-semibold text-slate-900">{saque.nome_titular}</span>
                </div>

                {saque.documento_titular && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">CPF / CNPJ</span>
                    <span className="font-mono font-medium text-slate-900">
                      {saque.documento_titular.length > 11 ? maskCNPJ(saque.documento_titular) : maskCPF(saque.documento_titular)}
                    </span>
                  </div>
                )}

                {saque.email_titular && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">E-mail</span>
                    <span className="text-slate-800">{saque.email_titular}</span>
                  </div>
                )}

                {saque.telefone_titular && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Telefone</span>
                    <span className="text-slate-800">{maskPhone(saque.telefone_titular)}</span>
                  </div>
                )}

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Tipo de Perfil</span>
                  <span className="capitalize text-slate-800 font-medium">{saque.tipo_solicitante}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">ID do Registro</span>
                  <span className="font-mono text-[11px] text-slate-500">{saque.prestador_id || saque.cliente_id || saque.id}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: History & Raw Data */}
        {activeTab === 'historico' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
                Trilha de Auditoria & Registro
              </h4>

              <div className="mt-3 space-y-2 text-xs text-slate-600">
                <div className="flex justify-between border-b border-slate-50 py-1.5">
                  <span className="text-slate-500">Data de Solicitação:</span>
                  <span className="font-mono font-medium text-slate-900">{formatDateTime(saque.created_at)}</span>
                </div>
                {saque.data_pagamento && (
                  <div className="flex justify-between border-b border-slate-50 py-1.5">
                    <span className="text-slate-500">Data de Efetivação / Pagamento:</span>
                    <span className="font-mono font-medium text-slate-900">{formatDate(saque.data_pagamento)}</span>
                  </div>
                )}
                <div className="flex justify-between border-b border-slate-50 py-1.5">
                  <span className="text-slate-500">ID da Transação:</span>
                  <span className="font-mono font-medium text-slate-900">{saque.id}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </CommandSlideOver>
  );
}
