import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, CheckCircle, XCircle, 
  Printer, Trash2, 
  User, Briefcase, RefreshCw, 
  Calendar, ExternalLink, ShieldAlert, Layers
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { OS } from '../../../../types';
import { Modal } from '../../../ui/Modal';
import { formatCurrency, formatDate, handleError } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';
import { generateOSPDF } from '../../../../lib/pdf';
import { AdminWhatsAppButton } from '../../ui/AdminWhatsAppButton';
import { notificationService } from '../../../../lib/notificationService';
import { logService, AtorTipo } from '../../../../lib/logService';
import { PainelRentabilidade } from '../../PainelRentabilidade';
import { SplitScreenLayout, StatusBadge } from '../shared';
import clsx from 'clsx';
import { callAdminRpc, deleteAdminEntityCascade, deleteAdminEntityBatch } from '../../../../lib/adminRpc';

interface OrdensServicoWorkstationProps {
  activeSubTab?: 'abertas' | 'concluidas' | 'canceladas' | string;
  initialItemId?: string;
  adminType?: string;
  colaboradorNome?: string;
  colaboradorId?: string;
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
}

export function OrdensServicoWorkstation({
  activeSubTab,
  initialItemId,
  adminType,
  colaboradorNome,
  onNavigate
}: OrdensServicoWorkstationProps) {
  const [statusFilter, setStatusFilter] = useState<'andamento' | 'concluido' | 'cancelado'>('andamento');

  useEffect(() => {
    if (activeSubTab === 'concluidas') setStatusFilter('concluido');
    else if (activeSubTab === 'canceladas') setStatusFilter('cancelado');
    else if (activeSubTab === 'abertas') setStatusFilter('andamento');
  }, [activeSubTab]);

  const [ordens, setOrdens] = useState<OS[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedOS, setSelectedOS] = useState<OS | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState<'detalhes' | 'prestador' | 'rentabilidade' | 'anexos'>('detalhes');
  
  // Modals
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deletion state (Cascade & Batch)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [osToDelete, setOsToDelete] = useState<OS | null>(null);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [selectedOsIds, setSelectedOsIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  const fetchOrdens = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('ordens_servico')
        .select(`
          *,
          clientes (
            id,
            nome,
            cpf,
            cnpj,
            telefone,
            email,
            codigo_cliente
          ),
          orcamentos:orcamento_id (
            id,
            servico_id,
            produto_id,
            assinatura_id,
            codigo_orcamento,
            total,
            valor_servico,
            valor_adicional,
            descricao_adicional,
            acrescimo,
            desconto,
            servicos (
              nome,
              descricao
            )
          ),
          prestador_demandas (
            id,
            status,
            link_entrega,
            link_resultado,
            arquivos_resultado,
            arquivos_briefing,
            prestadores (
              id,
              nome_razao,
              telefone,
              documento,
              tipo_cadastro
            )
          )
        `)
        .eq('status', statusFilter);

      if (search.trim()) {
        query = query.ilike('codigo_os', `%${search}%`);
      }

      const { data, error } = await query.order('codigo_os', { ascending: false }).limit(100);
      if (error) throw error;

      const list = (data as unknown as OS[]) || [];
      setOrdens(list);

      if (selectedOS) {
        const found = list.find(o => o.id === selectedOS.id);
        if (found) setSelectedOS(found);
      } else if (initialItemId) {
        const found = list.find(o => o.id === initialItemId);
        if (found) setSelectedOS(found);
      } else if (list.length > 0 && !selectedOS) {
        setSelectedOS(list[0]);
      }
    } catch (err) {
      console.error('Erro ao buscar ordens de serviço:', err);
      toast.error('Erro ao carregar lista de OS.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdens();
  }, [statusFilter, search]);

  // Realtime subscription
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const debouncedFetch = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchOrdens();
      }, 400);
    };

    const channel = supabase
      .channel(`admin-os-sd1-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico' }, () => {
        debouncedFetch();
      })
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [statusFilter]);

  // Handle finalize OS
  const handleFinalizeOS = async (os: OS) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await callAdminRpc<any>('gsa_admin_concluir_os_e_faturar', {
        p_os_id: os.id,
        p_data_vencimento: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        p_observacao: `Serviço concluído - OS ${os.codigo_os}`,
      });

      await notificationService.notifyClient(
        os.cliente_id,
        'Ordem de Serviço concluída e faturada',
        `Sua Ordem de Serviço ${os.codigo_os} foi concluída. A fatura ${result.codigo_fatura} foi gerada no valor de ${formatCurrency(result.valor_total)}, com vencimento em ${formatDate(result.data_vencimento)}.`,
        'os',
        'os_concluida',
        { tab: 'concluidas', itemId: os.id, prioridade: 'alta' }
      );

      toast.success(result.already_processed
        ? `OS já processada. Fatura ${result.codigo_fatura}.`
        : `OS concluída e fatura ${result.codigo_fatura} gerada.`);
      await logService.logAction({
        acao: 'FINALIZACAO_OS',
        detalhes: JSON.stringify({ os_id: os.id, codigo: os.codigo_os, fatura_id: result.fatura_id, codigo_fatura: result.codigo_fatura }),
        ator_tipo: (adminType || 'admin') as AtorTipo,
        ator_nome: colaboradorNome || 'Administrador'
      });

      await fetchOrdens();
    } catch (err: any) {
      console.error('Erro ao concluir OS:', err);
      toast.error(handleError(err, 'Erro ao concluir OS'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel OS
  const handleCancelOS = async () => {
    if (!selectedOS || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await callAdminRpc('gsa_admin_cancelar_os', {
        p_os_id: selectedOS.id,
        p_motivo: cancelReason,
      });

      await notificationService.notifyClient(
        selectedOS.cliente_id,
        '⚠️ Ordem de Serviço Cancelada',
        `A Ordem de Serviço ${selectedOS.codigo_os} foi cancelada. Motivo: ${cancelReason}`,
        'os',
        'os_cancelada',
        { tab: 'canceladas', itemId: selectedOS.id }
      );

      toast.success('Ordem de serviço cancelada.');
      setIsCancelModalOpen(false);

      await logService.logAction({
        acao: 'CANCELAMENTO_OS',
        detalhes: JSON.stringify({ os_id: selectedOS.id, motivo: cancelReason }),
        ator_tipo: (adminType || 'admin') as AtorTipo,
        ator_nome: colaboradorNome || 'Administrador'
      });

      await fetchOrdens();
    } catch (err: any) {
      console.error('Erro ao cancelar OS:', err);
      toast.error(handleError(err, 'Erro ao cancelar OS'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Single Cascade Delete OS
  const handleDeleteOS = async () => {
    if (!osToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteAdminEntityCascade(
        'ordem_servico',
        osToDelete.id,
        deleteReason || 'Exclusão direta de OS via Painel de Operações'
      );

      if (!result?.success) {
        throw new Error(result?.message || 'Falha ao excluir a Ordem de Serviço.');
      }

      toast.success(`OS ${osToDelete.codigo_os || ''} e dependências excluídas com sucesso!`);
      setIsDeleteModalOpen(false);
      setOsToDelete(null);
      setDeleteReason('');

      if (selectedOS?.id === osToDelete.id) {
        setSelectedOS(null);
      }
      setSelectedOsIds(prev => prev.filter(id => id !== osToDelete.id));

      await logService.logAction({
        acao: 'EXCLUSAO_OS_CASCATA',
        detalhes: JSON.stringify({ os_id: osToDelete.id, codigo: osToDelete.codigo_os, motivo: deleteReason }),
        ator_tipo: (adminType || 'admin') as AtorTipo,
        ator_nome: colaboradorNome || 'Administrador'
      });

      await fetchOrdens();
    } catch (err: any) {
      console.error('Erro ao excluir OS:', err);
      toast.error(handleError(err, 'Erro ao excluir Ordem de Serviço de ponta a ponta'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Batch Cascade Delete OS
  const handleBatchDeleteOS = async () => {
    if (selectedOsIds.length === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteAdminEntityBatch(
        'ordem_servico',
        selectedOsIds,
        deleteReason || 'Exclusão em lote de OS via Painel de Operações'
      );

      if (!result?.success) {
        throw new Error('Falha ao processar exclusão em lote de OS.');
      }

      toast.success(`${result.deleted} Ordem(ns) de Serviço excluída(s) com sucesso!`);
      setIsBatchDeleteModalOpen(false);
      const deletedIds = [...selectedOsIds];
      setSelectedOsIds([]);
      setDeleteReason('');

      if (selectedOS && deletedIds.includes(selectedOS.id)) {
        setSelectedOS(null);
      }

      await logService.logAction({
        acao: 'EXCLUSAO_OS_LOTE',
        detalhes: JSON.stringify({ ids: deletedIds, total: result.deleted, motivo: deleteReason }),
        ator_tipo: (adminType || 'admin') as AtorTipo,
        ator_nome: colaboradorNome || 'Administrador'
      });

      await fetchOrdens();
    } catch (err: any) {
      console.error('Erro ao excluir OS em lote:', err);
      toast.error(handleError(err, 'Erro ao excluir Ordens de Serviço selecionadas'));
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectOs = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedOsIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllOs = () => {
    if (selectedOsIds.length === ordens.length) {
      setSelectedOsIds([]);
    } else {
      setSelectedOsIds(ordens.map(o => o.id));
    }
  };

  // Handle PDF generation
  const handlePrintPDF = (os: OS) => {
    try {
      generateOSPDF(os, (os as any).clientes ?? null, null);
      toast.success('PDF da OS gerado com sucesso!');
    } catch (err) {
      toast.error('Erro ao gerar PDF da OS.');
    }
  };

  return (
    <div className="w-full space-y-4">
      <SplitScreenLayout
        masterTitle="Ordens de Serviço"
        masterSubtitle="Execução e despacho operacional"
        masterCount={ordens.length}
        masterSearch={{
          value: search,
          onChange: setSearch,
          placeholder: 'Buscar código da OS...'
        }}
        masterActions={
          <div className="flex items-center gap-1.5">
            {selectedOsIds.length > 0 && (
              <button
                onClick={() => setIsBatchDeleteModalOpen(true)}
                className="px-2.5 py-1 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-all flex items-center gap-1 shadow-2xs"
                title="Excluir selecionadas em definitivo (cascata)"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                <span>Excluir ({selectedOsIds.length})</span>
              </button>
            )}
            {ordens.length > 0 && (
              <button
                onClick={toggleSelectAllOs}
                title={selectedOsIds.length === ordens.length ? 'Desmarcar todas' : 'Selecionar todas'}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 transition-colors text-xs font-bold"
              >
                <Layers className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => fetchOrdens()}
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
                { id: 'andamento', label: 'Em Andamento' },
                { id: 'concluido', label: 'Concluídas' },
                { id: 'cancelado', label: 'Canceladas' }
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
          ordens.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-semibold">Nenhuma ordem de serviço nesta fila.</p>
            </div>
          ) : (
            ordens.map(os => {
              const isSelected = selectedOS?.id === os.id;
              const isChecked = selectedOsIds.includes(os.id);
              const clientName = (os as any).clientes?.nome || 'Cliente não identificado';
              const serviceName = (os as any).orcamentos?.servicos?.nome || 'Serviço Operacional';
              const totalAmount = (os as any).orcamentos?.total || 0;

              return (
                <div
                  key={os.id}
                  onClick={() => setSelectedOS(os)}
                  className={clsx(
                    'p-3 rounded-xl border text-left cursor-pointer transition-all duration-150 relative overflow-hidden group',
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div 
                      onClick={(e) => toggleSelectOs(os.id, e)}
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
                          {os.codigo_os}
                        </span>
                        {(os as any).orcamentos?.codigo_orcamento && (
                          <span className="text-[9px] font-mono text-slate-500 bg-slate-100 px-1 py-0.2 rounded">
                            {(os as any).orcamentos.codigo_orcamento}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-semibold text-slate-800 truncate mb-0.5">
                        {clientName}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {serviceName}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-slate-900">
                        {formatCurrency(totalAmount)}
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={os.status} size="xs" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      Início: {formatDate(os.data_inicio)}
                    </span>
                    {os.data_fim && (
                      <span>Fim: {formatDate(os.data_fim)}</span>
                    )}
                  </div>
                </div>
              );
            })
          )
        }
        selectedId={selectedOS?.id}
        onCloseDetail={() => setSelectedOS(null)}
        detailTitle={selectedOS?.codigo_os || 'Ordem de Serviço'}
        detailSubtitle={(selectedOS as any)?.clientes?.nome ? `Cliente: ${(selectedOS as any).clientes.nome}` : undefined}
        detailBadge={selectedOS ? <StatusBadge status={selectedOS.status} /> : undefined}
        detailActions={
          selectedOS && (
            <div className="flex items-center gap-2 flex-wrap">
              <AdminWhatsAppButton
                telefone={(selectedOS as any).clientes?.telefone}
                mensagem={`Olá ${(selectedOS as any).clientes?.nome || 'cliente'}, sua Ordem de Serviço ${selectedOS.codigo_os} foi atualizada.`}
              />

              <button
                onClick={() => handlePrintPDF(selectedOS)}
                title="Imprimir PDF da OS"
                className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>PDF</span>
              </button>

              {selectedOS.status === 'andamento' && (
                <>
                  <button
                    onClick={() => {
                      setCancelReason('');
                      setIsCancelModalOpen(true);
                    }}
                    className="px-3 py-1 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors flex items-center gap-1"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Cancelar OS</span>
                  </button>

                  <button
                    disabled={isSubmitting || isDeleting}
                    onClick={() => handleFinalizeOS(selectedOS)}
                    className="px-3.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>Concluir OS</span>
                  </button>
                </>
              )}

              {/* Cascade Delete Action */}
              <button
                disabled={isSubmitting || isDeleting}
                onClick={() => {
                  setOsToDelete(selectedOS);
                  setDeleteReason('');
                  setIsDeleteModalOpen(true);
                }}
                title="Excluir Ordem de Serviço de ponta a ponta (limpeza completa em cascata)"
                className="px-2.5 py-1 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-2xs"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                <span>Excluir</span>
              </button>
            </div>
          )
        }
        detailContent={
          selectedOS && (
            <div className="space-y-6">
              {/* Workstation Inspector Tabs */}
              <div className="flex items-center gap-1 border-b border-slate-200 pb-2">
                {[
                  { id: 'detalhes', label: 'Visão Geral' },
                  { id: 'prestador', label: 'Técnico / Demanda' },
                  { id: 'rentabilidade', label: 'Rentabilidade' },
                  { id: 'anexos', label: 'Anexos & Briefing' }
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

              {/* TAB 1: DETALHES */}
              {activeInspectorTab === 'detalhes' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                      <User className="h-4 w-4 text-indigo-600" />
                      <span>Dados do Solicitante</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="text-slate-900 font-bold">
                        {(selectedOS as any).clientes?.nome || 'Não informado'}
                      </div>
                      <div className="text-slate-500 font-mono text-[11px]">
                        CPF/CNPJ: {(selectedOS as any).clientes?.cpf || (selectedOS as any).clientes?.cnpj || '—'}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        Email: {(selectedOS as any).clientes?.email || '—'}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        Telefone: {(selectedOS as any).clientes?.telefone || '—'}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
                      <Briefcase className="h-4 w-4 text-emerald-600" />
                      <span>Serviço Executado</span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="text-slate-900 font-bold">
                        {(selectedOS as any).orcamentos?.servicos?.nome || 'Serviço Personalizado'}
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        Código Orçamento: {(selectedOS as any).orcamentos?.codigo_orcamento || '—'}
                      </div>
                      <div className="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-100 pt-1.5">
                        <span>Valor Total:</span>
                        <span className="font-mono text-emerald-700">
                          {formatCurrency((selectedOS as any).orcamentos?.total || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TÉCNICO / PRESTADOR */}
              {activeInspectorTab === 'prestador' && (
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-bold text-slate-800">
                    Alocação de Técnico / Prestador
                  </h4>

                  {(selectedOS as any).prestador_demandas ? (
                    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {(selectedOS as any).prestador_demandas.prestadores?.nome_razao || (selectedOS as any).prestador_demandas.prestadores?.nome || 'Prestador Alocado'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Telefone: {(selectedOS as any).prestador_demandas.prestadores?.telefone || '—'}
                          </div>
                        </div>
                        <StatusBadge status={(selectedOS as any).prestador_demandas.status} size="xs" />
                      </div>

                      {(selectedOS as any).prestador_demandas.link_entrega && (
                        <div className="pt-2 border-t border-slate-200">
                          <a
                            href={(selectedOS as any).prestador_demandas.link_entrega}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Acessar Link de Entrega
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
                      <p className="text-xs text-slate-500 mb-2">
                        Nenhuma demanda externa de prestador vinculada a esta OS.
                      </p>
                      <button
                        onClick={() => {
                          if (onNavigate) onNavigate('operacoes', 'demandas');
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors"
                      >
                        Abrir Demanda no Kanban
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: RENTABILIDADE */}
              {activeInspectorTab === 'rentabilidade' && (
                <div className="space-y-4">
                  <PainelRentabilidade tipo="realizado" osId={selectedOS.id} />
                </div>
              )}

              {/* TAB 4: ANEXOS */}
              {activeInspectorTab === 'anexos' && (
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-bold text-slate-800">
                    Anexos e Documentação da OS
                  </h4>
                  {selectedOS.anexos_os && selectedOS.anexos_os.length > 0 ? (
                    <div className="space-y-2">
                      {selectedOS.anexos_os.map((anexo, i) => (
                        <div key={i} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700">{anexo.nome}</span>
                          <a
                            href={anexo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 font-bold"
                          >
                            Download
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      Nenhum anexo registrado nesta OS.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        }
      />

      {/* CANCEL MODAL */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancelar Ordem de Serviço"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Informe o motivo detalhado do cancelamento desta Ordem de Serviço.
          </p>

          <textarea
            rows={3}
            placeholder="Ex: Desistência do cliente, inviabilidade técnica..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="w-full p-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20"
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCancelModalOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={isSubmitting || !cancelReason.trim()}
              onClick={handleCancelOS}
              className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 shadow-2xs"
            >
              Confirmar Cancelamento
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL EXCLUSÃO DE PONTA A PONTA (INDIVIDUAL OS) */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setIsDeleteModalOpen(false);
            setOsToDelete(null);
            setDeleteReason('');
          }
        }}
        title="Excluir Ordem de Serviço de Ponta a Ponta"
      >
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900 space-y-1">
              <p className="font-bold">Atenção: Exclusão Master em Cascata</p>
              <p className="leading-relaxed">
                Você está prestes a excluir permanentemente a OS <strong className="font-mono">{osToDelete?.codigo_os}</strong>.
              </p>
              <p className="text-[11px] text-red-750">
                Esta ação executará uma limpeza completa de ponta a ponta sem deixar pendências: faturas vinculadas, demandas de técnicos/prestadores, notas de suporte e notificações serão removidas.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Motivo da Exclusão (Auditoria)
            </label>
            <input
              type="text"
              placeholder="Ex: Cancelamento definitivo pelo ADM / Erro de lançamento..."
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
                setOsToDelete(null);
                setDeleteReason('');
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteOS}
              className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 shadow-2xs flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL EXCLUSÃO EM LOTE DE PONTA A PONTA (OS) */}
      <Modal
        isOpen={isBatchDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setIsBatchDeleteModalOpen(false);
            setDeleteReason('');
          }
        }}
        title={`Excluir ${selectedOsIds.length} Ordem(ns) de Serviço em Lote`}
      >
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900 space-y-1">
              <p className="font-bold">Confirmação de Exclusão em Lote</p>
              <p className="leading-relaxed">
                Deseja excluir definitivamente as <strong className="font-bold">${selectedOsIds.length}</strong> ordens de serviço selecionadas?
              </p>
              <p className="text-[11px] text-red-750">
                Cada ordem de serviço será expurgada de ponta a ponta em cascata juntamente com suas demandas de prestadores, faturas e notificações.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Motivo da Exclusão em Lote (Auditoria)
            </label>
            <input
              type="text"
              placeholder="Ex: Limpeza de ordens canceladas / Expurgado pelo ADM..."
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
              onClick={handleBatchDeleteOS}
              className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 shadow-2xs flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isDeleting ? 'Excluindo Lote...' : `Excluir ${selectedOsIds.length} Selecionadas`}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
