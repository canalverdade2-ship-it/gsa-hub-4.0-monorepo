import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, FileText, CheckCircle, XCircle, ChevronRight, 
  Send, MessageSquare, Printer, Percent, Clock, Upload, Trash2, 
  ArrowRightLeft, Calendar, Landmark, Package, User, Phone, Mail, 
  AlertCircle, DollarSign, ShieldAlert, Sparkles, RefreshCw, Layers
} from 'lucide-react';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { supabase } from '../../../../lib/supabase';
import { Orcamento, Cliente, Servico, Produto, Assinatura } from '../../../../types';
import { Modal } from '../../../ui/Modal';
import { formatCurrency, formatDate, generateCode, generateUUID, handleError } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';
import { generateOrcamentoPDF } from '../../../../lib/pdf';
import { AdminWhatsAppButton } from '../../ui/AdminWhatsAppButton';
import { callAdminRpc, deleteAdminEntityCascade, deleteAdminEntityBatch } from '../../../../lib/adminRpc';
import { notificationService } from '../../../../lib/notificationService';
import { logService, AtorTipo } from '../../../../lib/logService';
import { PainelRentabilidade } from '../../PainelRentabilidade';
import { SplitScreenLayout, StatusBadge, CommandSlideOver } from '../shared';
import { BudgetApprovalResult, OrcamentoStatusFilter } from './types';
import clsx from 'clsx';

interface OrcamentosWorkstationProps {
  activeSubTab?: 'abertos' | 'analise' | 'aprovados' | 'cancelados' | string;
  initialItemId?: string;
  adminType?: string;
  colaboradorId?: string;
  colaboradorNome?: string;
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
}

export function OrcamentosWorkstation({
  activeSubTab,
  initialItemId,
  adminType,
  colaboradorId,
  colaboradorNome,
  onNavigate
}: OrcamentosWorkstationProps) {
  const [statusFilter, setStatusFilter] = useState<OrcamentoStatusFilter>(
    activeSubTab === 'aprovados' ? 'aprovados' : activeSubTab === 'cancelados' ? 'cancelados' : activeSubTab === 'analise' ? 'negociacao' : 'abertos'
  );

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedOrcamento, setSelectedOrcamento] = useState<Orcamento | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState<'detalhes' | 'itens' | 'rentabilidade' | 'documentos' | 'negociacao'>('detalhes');
  
  // Modals / Drawers
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isRenegotiateModalOpen, setIsRenegotiateModalOpen] = useState(false);
  const [renegotiateValue, setRenegotiateValue] = useState(0);
  const [isDocRequestModalOpen, setIsDocRequestModalOpen] = useState(false);
  const [requestedDocs, setRequestedDocs] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Deletion States (Cascade & Batch)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [budgetToDelete, setBudgetToDelete] = useState<Orcamento | null>(null);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [selectedBudgetIds, setSelectedBudgetIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  // Sync initial subtab
  useEffect(() => {
    if (activeSubTab === 'aprovados') setStatusFilter('aprovados');
    else if (activeSubTab === 'cancelados') setStatusFilter('cancelados');
    else if (activeSubTab === 'analise') setStatusFilter('negociacao');
    else if (activeSubTab === 'abertos') setStatusFilter('abertos');
  }, [activeSubTab]);

  // Load budgets
  const fetchOrcamentos = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('orcamentos')
        .select(`
          *,
          clientes (
            id,
            nome,
            cpf,
            cnpj,
            email,
            telefone,
            codigo_cliente,
            indicacao_origem_id
          ),
          servicos (
            nome,
            descricao,
            valor
          ),
          produtos (
            nome,
            descricao,
            valor
          ),
          assinaturas (
            nome,
            descricao,
            valor
          )
        `);

      if (statusFilter === 'abertos') {
        query = query.in('status', ['aberto', 'em revisão', 'pendência documentos']);
      } else if (statusFilter === 'negociacao') {
        query = query.eq('status', 'negociação');
      } else if (statusFilter === 'aprovados') {
        query = query.eq('status', 'aprovado');
      } else if (statusFilter === 'cancelados') {
        query = query.eq('status', 'cancelado');
      }

      if (search.trim()) {
        query = query.or(`codigo_orcamento.ilike.%${search}%,titulo_solicitacao.ilike.%${search}%`);
      }

      const { data, error } = await query.order('data_criacao', { ascending: false }).limit(100);
      if (error) throw error;
      
      const list = (data as unknown as Orcamento[]) || [];
      setOrcamentos(list);

      // Preserve or update selection
      if (selectedOrcamento) {
        const found = list.find(o => o.id === selectedOrcamento.id);
        if (found) setSelectedOrcamento(found);
      } else if (initialItemId) {
        const found = list.find(o => o.id === initialItemId);
        if (found) {
          setSelectedOrcamento(found);
          setHighlightedId(initialItemId);
        }
      } else if (list.length > 0 && !selectedOrcamento) {
        // Auto select first item on desktop
        setSelectedOrcamento(list[0]);
      }
    } catch (err) {
      console.error('Erro ao buscar orçamentos:', err);
      toast.error('Erro ao carregar lista de orçamentos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrcamentos();
  }, [statusFilter, search]);

  // Realtime subscription
  useRealtimeSubscription([
    { table: 'orcamentos', onChange: fetchOrcamentos, debounceMs: 400 },
    { table: 'ordens_servico', onChange: fetchOrcamentos, debounceMs: 400 },
  ]);

  // Handle standard approval
  const handleApproveStandard = async (orc: Orcamento) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const approval = await callAdminRpc<BudgetApprovalResult>('gsa_admin_approve_budget', {
        p_request_id: generateUUID(),
        p_orcamento_id: orc.id,
        p_approval_kind: 'standard',
      });

      if (!approval?.success) {
        throw new Error(`O servidor não confirmou a aprovação do orçamento ${orc.codigo_orcamento || orc.id}.`);
      }

      try {
        await notificationService.notifyClient(
          orc.cliente_id,
          '✅ Pedido Aprovado!',
          `Seu pedido ${orc.codigo_orcamento} foi aprovado pelo sistema. 🚀`,
          'orcamentos',
          'orcamento_aprovado',
          { tab: 'aprovados', itemId: orc.id, prioridade: 'alta' }
        );
      } catch (notificationError) {
        console.error('Orçamento aprovado, mas a notificação falhou:', notificationError);
        toast.error('Orçamento aprovado e OS gerada, mas a notificação ao cliente falhou.');
      }

      toast.success('Orçamento aprovado com sucesso! Ordem de Serviço gerada.');
      await logService.logAction({
        acao: 'APROVACAO_ORCAMENTO',
        detalhes: JSON.stringify({ orcamento_id: orc.id, codigo: orc.codigo_orcamento }),
        ator_tipo: (adminType || 'admin') as AtorTipo,
        ator_nome: colaboradorNome || 'Administrador'
      });

      await fetchOrcamentos();
    } catch (err: any) {
      console.error('Erro ao aprovar orçamento:', err);
      toast.error(handleError(err, 'Erro ao aprovar pedido'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle negotiation approval
  const handleApproveNegotiation = async (orc: Orcamento) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { data: currentOrc, error: fetchError } = await supabase
        .from('orcamentos')
        .select('status')
        .eq('id', orc.id)
        .single();

      if (fetchError) throw fetchError;
      if (currentOrc?.status !== 'negociação') {
        toast.error('Este orçamento já foi alterado por outro usuário.');
        await fetchOrcamentos();
        return;
      }

      const approval = await callAdminRpc<BudgetApprovalResult>('gsa_admin_approve_budget', {
        p_request_id: generateUUID(),
        p_orcamento_id: orc.id,
        p_approval_kind: 'negotiation',
      });

      if (!approval?.success) {
        throw new Error('O servidor não confirmou a aprovação do orçamento.');
      }

      try {
        await notificationService.notifyClient(
          orc.cliente_id,
          '🤝 Negociação Aprovada!',
          `Sua solicitação de negociação para o orçamento ${orc.codigo_orcamento} foi aprovada. 🎉`,
          'orcamentos',
          'orcamento_aprovado',
          { tab: 'aprovados', itemId: orc.id, prioridade: 'alta', contexto: { orcamento_id: orc.id, codigo: orc.codigo_orcamento } }
        );
      } catch (notificationError) {
        console.error('Negociação aprovada, mas a notificação falhou:', notificationError);
        toast.error('Negociação aprovada e OS gerada, mas a notificação ao cliente falhou.');
      }

      if (orc.categoria === 'servico') {
        toast.success('negociação aprovada e OS gerada!');
        if (onNavigate) onNavigate('operacoes', 'os');
      } else if (orc.categoria === 'produto') {
        toast.success('negociação aprovada e Ordem de Compra gerada!');
        if (onNavigate) onNavigate('operacoes', 'compras');
      } else {
        toast.success('negociação aprovada e Ordem de Assinatura gerada!');
        if (onNavigate) onNavigate('operacoes', 'compras');
      }

      await logService.logAction({
        acao: 'APROVACAO_NEGOCIACAO',
        detalhes: JSON.stringify({ orcamento_id: orc.id, codigo: orc.codigo_orcamento }),
        ator_tipo: (adminType || 'admin') as AtorTipo,
        ator_nome: colaboradorNome || 'Administrador'
      });

      await fetchOrcamentos();
    } catch (err: any) {
      console.error('Erro ao aprovar negociação:', err);
      toast.error(handleError(err, 'Erro ao aprovar negociação'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle renegotiation proposal
  const handleRenegotiateSubmit = async () => {
    if (!selectedOrcamento || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await callAdminRpc('gsa_admin_patch_marketplace_budget', {
        p_orcamento_id: selectedOrcamento.id,
        p_patch: { fase_negociacao: 'cliente', proposta_admin_porcentagem: renegotiateValue },
      });

      await notificationService.notifyClient(
        selectedOrcamento.cliente_id,
        '📩 Nova Proposta de Negociação',
        `O sistema enviou uma nova proposta para o orçamento ${selectedOrcamento.codigo_orcamento}. 📄`,
        'orcamentos',
        'orcamento_contraproposta',
        { tab: 'abertos', itemId: selectedOrcamento.id, prioridade: 'alta', contexto: { orcamento_id: selectedOrcamento.id, codigo: selectedOrcamento.codigo_orcamento } }
      );

      toast.success('Proposta de renegociação enviada com sucesso!');
      setIsRenegotiateModalOpen(false);

      await logService.logAction({
        acao: 'CONTRA_PROPOSTA_ORCAMENTO',
        detalhes: JSON.stringify({ orcamento_id: selectedOrcamento.id, desconto_proposto: renegotiateValue }),
        ator_tipo: (adminType || 'admin') as AtorTipo,
        ator_nome: colaboradorNome || 'Administrador'
      });

      await fetchOrcamentos();
    } catch (err) {
      toast.error('Erro ao enviar proposta de negociação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle PDF generation
  const handlePrintPDF = (orc: Orcamento) => {
    try {
      generateOrcamentoPDF(orc, (orc as any).clientes ?? null, null);
      toast.success('PDF do orçamento gerado!');
    } catch (err) {
      toast.error('Erro ao gerar PDF.');
    }
  };

  // Handle Single Cascade Delete
  const handleDeleteBudget = async () => {
    if (!budgetToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteAdminEntityCascade(
        'orcamento',
        budgetToDelete.id,
        deleteReason || 'Exclusão direta via Painel de Orçamentos'
      );

      if (!result?.success) {
        throw new Error(result?.message || 'Falha ao excluir o orçamento.');
      }

      toast.success(`Orçamento ${budgetToDelete.codigo_orcamento || ''} e dependências excluídos com sucesso!`);
      setIsDeleteModalOpen(false);
      setBudgetToDelete(null);
      setDeleteReason('');

      if (selectedOrcamento?.id === budgetToDelete.id) {
        setSelectedOrcamento(null);
      }
      setSelectedBudgetIds(prev => prev.filter(id => id !== budgetToDelete.id));

      await logService.logAction({
        acao: 'EXCLUSAO_ORCAMENTO_CASCATA',
        detalhes: JSON.stringify({ orcamento_id: budgetToDelete.id, codigo: budgetToDelete.codigo_orcamento, motivo: deleteReason }),
        ator_tipo: (adminType || 'admin') as AtorTipo,
        ator_nome: colaboradorNome || 'Administrador'
      });

      await fetchOrcamentos();
    } catch (err: any) {
      console.error('Erro ao excluir orçamento:', err);
      toast.error(handleError(err, 'Erro ao excluir orçamento de ponta a ponta'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Batch Cascade Delete
  const handleBatchDelete = async () => {
    if (selectedBudgetIds.length === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteAdminEntityBatch(
        'orcamento',
        selectedBudgetIds,
        deleteReason || 'Exclusão em lote via Painel de Orçamentos'
      );

      if (!result?.success) {
        throw new Error('Falha ao processar exclusão em lote.');
      }

      toast.success(`${result.deleted} orçamento(s) excluído(s) em definitivo de ponta a ponta!`);
      setIsBatchDeleteModalOpen(false);
      const deletedIds = [...selectedBudgetIds];
      setSelectedBudgetIds([]);
      setDeleteReason('');

      if (selectedOrcamento && deletedIds.includes(selectedOrcamento.id)) {
        setSelectedOrcamento(null);
      }

      await logService.logAction({
        acao: 'EXCLUSAO_ORCAMENTOS_LOTE',
        detalhes: JSON.stringify({ ids: deletedIds, total: result.deleted, motivo: deleteReason }),
        ator_tipo: (adminType || 'admin') as AtorTipo,
        ator_nome: colaboradorNome || 'Administrador'
      });

      await fetchOrcamentos();
    } catch (err: any) {
      console.error('Erro ao excluir orçamentos em lote:', err);
      toast.error(handleError(err, 'Erro ao excluir orçamentos selecionados'));
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectBudget = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedBudgetIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllBudgets = () => {
    if (selectedBudgetIds.length === orcamentos.length) {
      setSelectedBudgetIds([]);
    } else {
      setSelectedBudgetIds(orcamentos.map(o => o.id));
    }
  };


  return (
    <div className="w-full space-y-4">
      {/* â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
          SPLIT SCREEN COMMAND CENTER (Master Queue + Workstation)
          â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â•  */}
      <SplitScreenLayout
        masterTitle="Orçamentos"
        masterSubtitle="Fila de análise e aprovação"
        masterCount={orcamentos.length}
        masterSearch={{
          value: search,
          onChange: setSearch,
          placeholder: 'Buscar código ou cliente...'
        }}
        masterActions={
          <div className="flex items-center gap-1.5">
            {selectedBudgetIds.length > 0 && (
              <button
                onClick={() => setIsBatchDeleteModalOpen(true)}
                className="px-2.5 py-1 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-all flex items-center gap-1 shadow-2xs"
                title="Excluir selecionados em definitivo (cascata)"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                <span>Excluir ({selectedBudgetIds.length})</span>
              </button>
            )}
            {orcamentos.length > 0 && (
              <button
                onClick={toggleSelectAllBudgets}
                title={selectedBudgetIds.length === orcamentos.length ? 'Desmarcar todos' : 'Selecionar todos'}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 transition-colors text-xs font-bold"
              >
                <Layers className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => fetchOrcamentos()}
              title="Recarregar fila"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 transition-colors"
            >
              <RefreshCw className={clsx('h-4 w-4', isLoading && 'animate-spin')} />
            </button>
          </div>
        }
        masterFilters={
          <div className="flex items-center gap-1 overflow-x-auto pb-1 custom-scrollbar">
            {(
              [
                { id: 'abertos', label: 'Abertos' },
                { id: 'negociacao', label: 'negociação' },
                { id: 'aprovados', label: 'Aprovados' },
                { id: 'cancelados', label: 'Cancelados' }
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={clsx(
                  'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all whitespace-nowrap',
                  statusFilter === tab.id
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
        masterContent={
          orcamentos.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-semibold">Nenhum orçamento nesta fila.</p>
            </div>
          ) : (
            orcamentos.map(orc => {
              const isSelected = selectedOrcamento?.id === orc.id;
              const isChecked = selectedBudgetIds.includes(orc.id);
              const clientName = (orc as any).clientes?.nome || 'Cliente não identificado';
              const itemName = (orc as any).servicos?.nome || (orc as any).produtos?.nome || (orc as any).assinaturas?.nome || orc.titulo_solicitacao || 'Item Operacional';
              const isNegotiation = orc.status === 'negociação';

              return (
                <div
                  key={orc.id}
                  onClick={() => setSelectedOrcamento(orc)}
                  className={clsx(
                    'p-3 rounded-xl border text-left cursor-pointer transition-all duration-150 relative overflow-hidden group',
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    {/* Checkbox for batch selection */}
                    <div 
                      onClick={(e) => toggleSelectBudget(orc.id, e)}
                      className="pt-0.5 shrink-0"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] font-mono font-bold text-slate-900 tracking-tight">
                          {orc.codigo_orcamento}
                        </span>
                        <span className={clsx(
                          'text-[9px] font-bold uppercase px-1.5 py-0.2 rounded',
                          orc.categoria === 'servico' ? 'bg-blue-100 text-blue-800' :
                          orc.categoria === 'produto' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'
                        )}>
                          {orc.categoria}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-slate-800 truncate mb-0.5">
                        {clientName}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {itemName}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-slate-900">
                        {formatCurrency(orc.total)}
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={orc.status} size="xs" />
                      </div>
                    </div>
                  </div>

                  {isNegotiation && (
                    <div className="mt-2 pt-2 border-t border-amber-200/70 flex items-center justify-between text-[10px] text-amber-800 font-medium">
                      <span className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-amber-600" />
                        Desconto Solicitado:
                      </span>
                      <span className="font-bold font-mono">
                        {orc.desconto_solicitado_porcentagem || 0}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )
        }
        selectedId={selectedOrcamento?.id}
        onCloseDetail={() => setSelectedOrcamento(null)}
        detailTitle={selectedOrcamento?.codigo_orcamento || 'Orçamento'}
        detailSubtitle={(selectedOrcamento as any)?.clientes?.nome ? `Cliente: ${(selectedOrcamento as any).clientes.nome}` : undefined}
        detailBadge={selectedOrcamento ? <StatusBadge status={selectedOrcamento.status} /> : undefined}
        detailActions={
          selectedOrcamento && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* WhatsApp Quick Link */}
              <AdminWhatsAppButton
                telefone={(selectedOrcamento as any).clientes?.telefone}
                mensagem={`Olá ${(selectedOrcamento as any).clientes?.nome || 'cliente'}, seu orçamento ${selectedOrcamento.codigo_orcamento} está disponível para análise.`}
              />

              {/* PDF generator */}
              <button
                onClick={() => handlePrintPDF(selectedOrcamento)}
                title="Gerar PDF"
                className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>PDF</span>
              </button>

              {/* Action: Approve Standard */}
              {(selectedOrcamento.status === 'aberto' || selectedOrcamento.status === 'em revisão' || selectedOrcamento.status === 'pendência documentos') && (
                <button
                  disabled={isSubmitting || isDeleting}
                  onClick={() => handleApproveStandard(selectedOrcamento)}
                  className="px-3.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>Aprovar Pedido</span>
                </button>
              )}

              {/* Action: Approve Negotiation */}
              {selectedOrcamento.status === 'negociação' && (
                <>
                  <button
                    onClick={() => {
                      setRenegotiateValue(selectedOrcamento.proposta_admin_porcentagem || 0);
                      setIsRenegotiateModalOpen(true);
                    }}
                    className="px-3 py-1 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg border border-amber-300 transition-colors flex items-center gap-1"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    <span>Contraproposta</span>
                  </button>

                  <button
                    disabled={isSubmitting || isDeleting}
                    onClick={() => handleApproveNegotiation(selectedOrcamento)}
                    className="px-3.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>Aprovar negociação</span>
                  </button>
                </>
              )}

              {/* Action: End-to-End Cascade Delete */}
              <button
                disabled={isSubmitting || isDeleting}
                onClick={() => {
                  setBudgetToDelete(selectedOrcamento);
                  setDeleteReason('');
                  setIsDeleteModalOpen(true);
                }}
                title="Excluir Orçamento de ponta a ponta (limpeza completa em cascata)"
                className="px-2.5 py-1 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-2xs"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                <span>Excluir</span>
              </button>
            </div>
          )
        }
        detailContent={
          selectedOrcamento && (
            <div className="space-y-6">
              {/* Workstation Tab Switcher */}
              <div className="flex items-center gap-1 border-b border-slate-200 pb-2">
                {[
                  { id: 'detalhes', label: 'Visão Geral' },
                  { id: 'itens', label: 'Itens & Serviços' },
                  { id: 'rentabilidade', label: 'Rentabilidade' },
                  { id: 'documentos', label: 'Documentos' },
                  { id: 'negociacao', label: 'negociação' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveInspectorTab(tab.id as any)}
                    className={clsx(
                      'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all',
                      activeInspectorTab === tab.id
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* TAB 1: VISÃO GERAL */}
              {activeInspectorTab === 'detalhes' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Client card */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                      <User className="h-4 w-4 text-indigo-600" />
                      <span>Dados do Solicitante</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="text-slate-900 font-bold">
                        {(selectedOrcamento as any).clientes?.nome || 'Não informado'}
                      </div>
                      <div className="text-slate-500 font-mono text-[11px]">
                        CPF/CNPJ: {(selectedOrcamento as any).clientes?.cpf || (selectedOrcamento as any).clientes?.cnpj || '—'}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        Email: {(selectedOrcamento as any).clientes?.email || '—'}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        Telefone: {(selectedOrcamento as any).clientes?.telefone || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Financial Breakdown card */}
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                      <span>Resumo Financeiro</span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Valor Base:</span>
                        <span className="font-mono">{formatCurrency(selectedOrcamento.valor_servico || selectedOrcamento.valor_produto || selectedOrcamento.valor_assinatura || 0)}</span>
                      </div>
                      {Boolean(selectedOrcamento.valor_adicional) && (
                        <div className="flex justify-between text-slate-600">
                          <span>Adicionais ({selectedOrcamento.descricao_adicional || 'Extras'}):</span>
                          <span className="font-mono text-blue-600">+{formatCurrency(selectedOrcamento.valor_adicional)}</span>
                        </div>
                      )}
                      {Boolean(selectedOrcamento.acrescimo) && (
                        <div className="flex justify-between text-slate-600">
                          <span>Acréscimos:</span>
                          <span className="font-mono text-amber-600">+{formatCurrency(selectedOrcamento.acrescimo)}</span>
                        </div>
                      )}
                      {Boolean(selectedOrcamento.desconto) && (
                        <div className="flex justify-between text-slate-600">
                          <span>Desconto Concedido:</span>
                          <span className="font-mono text-emerald-600">-{formatCurrency(selectedOrcamento.desconto)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-100 pt-1.5">
                        <span>Total Final:</span>
                        <span className="font-mono text-emerald-700">{formatCurrency(selectedOrcamento.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Request Description & Context */}
                  <div className="md:col-span-2 p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                    <h4 className="text-xs font-bold text-slate-800">
                      Descrição da Solicitação / Escopo
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100">
                      {selectedOrcamento.observacoes_servico || selectedOrcamento.descricao_solicitacao || 'Nenhuma observação informada.'}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: ITENS & SERVIÇOS */}
              {activeInspectorTab === 'itens' && (
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-bold text-slate-800">
                    Itens Vinculados ao Orçamento
                  </h4>
                  <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {(selectedOrcamento as any).servicos?.nome || (selectedOrcamento as any).produtos?.nome || (selectedOrcamento as any).assinaturas?.nome || selectedOrcamento.titulo_solicitacao || 'Item do Orçamento'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Categoria: {selectedOrcamento.categoria} • Quantidade: {selectedOrcamento.quantidade || 1}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-slate-900">
                        {formatCurrency(selectedOrcamento.total)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: RENTABILIDADE */}
              {activeInspectorTab === 'rentabilidade' && (
                <div className="space-y-4">
                  <PainelRentabilidade tipo="previsto" orcamentoId={selectedOrcamento.id} />
                </div>
              )}

              {/* TAB 4: DOCUMENTOS */}
              {activeInspectorTab === 'documentos' && (
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800">
                      Documentos e Comprovações
                    </h4>
                    <button
                      onClick={() => setIsDocRequestModalOpen(true)}
                      className="px-3 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors"
                    >
                      Solicitar Novos Documentos
                    </button>
                  </div>

                  {/* Anexos enviados pelo cliente no pedido/orçamento público */}
                  {selectedOrcamento.anexos && Array.isArray(selectedOrcamento.anexos) && selectedOrcamento.anexos.length > 0 && (
                    <div className="space-y-2 border-b border-slate-100 pb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block mb-1">
                        Arquivos Anexados pelo Cliente ({selectedOrcamento.anexos.length})
                      </span>
                      <div className="grid grid-cols-1 gap-2">
                        {selectedOrcamento.anexos.map((doc: any, i: number) => {
                          const fileUrl = typeof doc === 'string' ? doc : doc?.url || '';
                          const fileName = typeof doc === 'string' ? `Anexo ${i + 1}` : doc?.nome || doc?.tipo || `Anexo ${i + 1}`;
                          return (
                            <div key={i} className="p-2.5 rounded-lg border border-indigo-100 bg-indigo-50/40 text-xs flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                                <span className="font-semibold text-slate-800 truncate" title={fileName}>
                                  {fileName}
                                </span>
                              </div>
                              {fileUrl ? (
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 px-2 py-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline bg-white border border-indigo-200 rounded shadow-xs"
                                >
                                  Visualizar ↗
                                </a>
                              ) : (
                                <span className="text-[10px] text-slate-400">Sem link direto</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Documentos Pendentes Solicitados */}
                  {selectedOrcamento.documentos_solicitados && selectedOrcamento.documentos_solicitados.length > 0 ? (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Documentos Solicitados ao Cliente
                      </span>
                      {selectedOrcamento.documentos_solicitados.map((doc, i) => (
                        <div key={i} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs flex items-center justify-between">
                          <span className="font-medium text-slate-700">{doc}</span>
                          <StatusBadge status="pendente" size="xs" />
                        </div>
                      ))}
                    </div>
                  ) : (!selectedOrcamento.anexos || selectedOrcamento.anexos.length === 0) ? (
                    <p className="text-xs text-slate-500 italic">
                      Nenhum documento anexado ou pendente para este orçamento.
                    </p>
                  ) : null}
                </div>
              )}

              {/* TAB 5: NEGOCIAÇÃO */}
              {activeInspectorTab === 'negociacao' && (
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Percent className="h-4 w-4 text-amber-600" />
                    Painel de negociação & Descontos
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Desconto Solicitado</span>
                      <div className="text-base font-bold font-mono text-slate-900 mt-1">
                        {selectedOrcamento.desconto_solicitado_porcentagem || 0}%
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Proposta Admin</span>
                      <div className="text-base font-bold font-mono text-slate-900 mt-1">
                        {selectedOrcamento.proposta_admin_porcentagem || 0}%
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Fase da negociação</span>
                      <div className="text-xs font-bold text-slate-800 mt-1 capitalize">
                        {selectedOrcamento.fase_negociacao || 'Pendente'}
                      </div>
                    </div>
                  </div>

                  {selectedOrcamento.motivo_desconto && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <span className="text-xs font-bold text-amber-900">Motivo informado pelo cliente:</span>
                      <p className="text-xs text-amber-800 mt-0.5">{selectedOrcamento.motivo_desconto}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        }
      />

      {/* RENEGOTIATION MODAL */}
      <Modal
        isOpen={isRenegotiateModalOpen}
        onClose={() => setIsRenegotiateModalOpen(false)}
        title="Enviar Contraproposta"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Defina o percentual de desconto de contraproposta para o cliente.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Desconto Ofertado (%)
            </label>
            <input 
              type="number"
              min="0"
              max="100"
              value={renegotiateValue}
              inputMode="numeric"
onChange={(e) => setRenegotiateValue(Number(e.target.value))}
              className="w-full p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsRenegotiateModalOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleRenegotiateSubmit}
              className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 shadow-2xs"
            >
              Enviar Proposta
            </button>
          </div>
        </div>
      </Modal>

      {/* DOCUMENT REQUEST MODAL */}
      <Modal
        isOpen={isDocRequestModalOpen}
        onClose={() => setIsDocRequestModalOpen(false)}
        title="Solicitar Documentos ao Cliente"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Adicione os documentos comprobatórios que o cliente deve anexar antes da aprovação.
          </p>

          <div className="space-y-2">
            {requestedDocs.map((doc, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ex: CNH, Comprovante de Residência..."
                  value={doc}
                  onChange={(e) => {
                    const newDocs = [...requestedDocs];
                    newDocs[index] = e.target.value;
                    setRequestedDocs(newDocs);
                  }}
                  className="flex-1 p-2 text-xs border border-slate-300 rounded-lg"
                />
                {requestedDocs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRequestedDocs(requestedDocs.filter((_, i) => i !== index))}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setRequestedDocs([...requestedDocs, ''])}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar outro documento
          </button>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsDocRequestModalOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                if (!selectedOrcamento) return;
                setIsSubmitting(true);
                try {
                  const filtered = requestedDocs.filter(d => d.trim().length > 0);
                  await callAdminRpc('gsa_admin_patch_marketplace_budget', {
                    p_orcamento_id: selectedOrcamento.id,
                    p_patch: { documentos_solicitados: filtered, status: 'pendência documentos' },
                  });
                  toast.success('Solicitação de documentos registrada com sucesso!');
                  setIsDocRequestModalOpen(false);
                  await fetchOrcamentos();
                } catch (err) {
                  toast.error('Erro ao salvar solicitação de documentos.');
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 shadow-2xs"
            >
              Salvar e Notificar
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL EXCLUSÃO DE PONTA A PONTA (INDIVIDUAL) */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setIsDeleteModalOpen(false);
            setBudgetToDelete(null);
            setDeleteReason('');
          }
        }}
        title="Excluir Orçamento de Ponta a Ponta"
      >
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900 space-y-1">
              <p className="font-bold">Atenção: Exclusão Master em Cascata</p>
              <p className="leading-relaxed">
                Você está prestes a excluir permanentemente o orçamento <strong className="font-mono">{budgetToDelete?.codigo_orcamento}</strong>.
              </p>
              <p className="text-[11px] text-red-750">
                Esta ação executará uma limpeza completa de ponta a ponta sem deixar registros pendentes ou em aberto: ordens de serviço, faturas, itens, solicitações e notificações vinculadas serão expurgadas.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Motivo da Exclusão (Auditoria)
            </label>
            <input
              type="text"
              placeholder="Ex: Solicitação de teste / Cancelamento definitivo pelo ADM..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setIsDeleteModalOpen(false);
                setBudgetToDelete(null);
                setDeleteReason('');
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteBudget}
              className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 shadow-2xs flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL EXCLUSÃO EM LOTE DE PONTA A PONTA */}
      <Modal
        isOpen={isBatchDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setIsBatchDeleteModalOpen(false);
            setDeleteReason('');
          }
        }}
        title={`Excluir ${selectedBudgetIds.length} Orçamento(s) em Lote`}
      >
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900 space-y-1">
              <p className="font-bold">Confirmação de Exclusão em Lote</p>
              <p className="leading-relaxed">
                Deseja excluir definitivamente os <strong className="font-bold">{selectedBudgetIds.length}</strong> orçamentos selecionados?
              </p>
              <p className="text-[11px] text-red-750">
                Cada orçamento será limpo de ponta a ponta em cascata com todas as suas ordens, faturas e notificações vinculadas.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Motivo da Exclusão em Lote (Auditoria)
            </label>
            <input
              type="text"
              placeholder="Ex: Limpeza de fila / Orçamentos cancelados pelo Administrador..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setIsBatchDeleteModalOpen(false);
                setDeleteReason('');
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleBatchDelete}
              className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 shadow-2xs flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isDeleting ? 'Excluindo Lote...' : `Excluir ${selectedBudgetIds.length} Selecionados`}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

