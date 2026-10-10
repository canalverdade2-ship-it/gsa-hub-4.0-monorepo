import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { Search, Filter, DollarSign, CheckCircle, Clock, AlertCircle, XCircle, FileText, User, Phone, Mail, CreditCard, History, Info, Landmark } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { GlobalFilter } from '../../ui/GlobalFilter';
import { formatCurrency, formatDate, formatDateTime } from '../../../lib/utils';
import { notificationService } from '../../../lib/notificationService';
import { logService } from '../../../lib/logService';
import { sessionService } from '../../../lib/sessionService';

const getAdminSessionForRpc = () => {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken) {
    throw new Error('Sessao administrativa expirada. Faca login novamente.');
  }
  return session;
};

export function PrestadoresFinanceiro({ subTab, initialItemId, colaboradorId, colaboradorNome }: { subTab?: string, initialItemId?: string, colaboradorId?: string, colaboradorNome?: string | null }) {
  const [saques, setSaques] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSaque, setSelectedSaque] = useState<any>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [activeDetailsTab, setActiveDetailsTab] = useState<'solicitacao' | 'prestador' | 'pagamento'>('solicitacao');
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, saque: any | null, type: 'approve' | 'reject', reason: string, paymentDate: string}>({
    isOpen: false, 
    saque: null, 
    type: 'approve', 
    reason: '',
    paymentDate: new Date().toISOString().split('T')[0]
  });
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({
    status: '',
    mes: '',
    ano: ''
  });

  const [highlightedId, setHighlightedId] = useState<string | null>(null);

useEffect(() => {
    if (initialItemId && saques.length > 0) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`saque-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);

          // Abertura automática do modal de detalhes
          const saque = saques.find(s => s.id === initialItemId);
          if (saque) {
            setSelectedSaque(saque);
            setIsDetailsModalOpen(true);
          }

          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, saques]);

  const fetchSaquesRef = useRef<(() => Promise<void>) | null>(null);

  // WebSocket channels: persist throughout component lifecycle decoupled from search
  useEffect(() => {
    const saquesChannel = supabase
      .channel('prestador-saques-admin-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_saques' }, () => {
        fetchSaquesRef.current?.();
      })
      .subscribe();

    const prestadoresChannel = supabase
      .channel('prestadores-admin-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestadores' }, () => {
        fetchSaquesRef.current?.();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(saquesChannel);
      supabase.removeChannel(prestadoresChannel);
    };
  }, []);

  // Fetch saques with debounce on search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSaques();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, filters]);

  const fetchSaques = async () => {
    fetchSaquesRef.current = fetchSaques;
    try {
      let query = supabase
        .from('prestador_saques')
        .select(`
          *,
          prestador:prestadores!inner(nome_razao, documento, email, telefone)
        `);

      if (search) {
        query = query.or(`nome_razao.ilike.%${search}%,documento.ilike.%${search}%`, { foreignTable: 'prestadores' });
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.mes) {
        const year = filters.ano || new Date().getFullYear();
        const startDate = `${year}-${filters.mes}-01`;
        const endDate = new Date(Number(year), Number(filters.mes), 0).toISOString().split('T')[0];
        query = query.gte('created_at', startDate).lte('created_at', endDate);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setSaques(data || []);
    } catch (error) {
      console.error('Erro ao buscar saques:', error);
      toast.error('Erro ao carregar solicitações de saque.');
    } finally {
      setLoading(false);
    }
  };

  const handleAprovarSaque = async (saque: any) => {
    setConfirmModal({ 
      isOpen: true, 
      saque, 
      type: 'approve', 
      reason: '', 
      paymentDate: new Date().toISOString().split('T')[0] 
    });
  };

  const confirmAprovarSaque = async () => {
    const saque = confirmModal.saque;
    if (!saque || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_processar_saque_prestador', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_saque_id: saque.id,
        p_acao: 'aprovar',
        p_motivo: null,
        p_data_pagamento: confirmModal.paymentDate
      });

      if (error) throw error;

      if (!data?.already_processed) {
        await notificationService.notifyProvider(
          saque.prestador_id,
          'Saque Realizado com Sucesso',
          `Seu saque no valor de ${formatCurrency(saque.valor)} foi pago.`,
          'financeiro',
          'prestador_saque_pago',
          { itemId: saque.id, tab: 'historico' }
        );
      }

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'APROVAR_SAQUE_PRESTADOR',
        detalhes: `Aprovou e pagou saque de ${formatCurrency(saque.valor)} para o prestador ${saque.prestador?.nome_razao}`
      });

      toast.success(data?.already_processed ? 'Saque ja estava marcado como pago.' : 'Saque aprovado e marcado como pago!');
      fetchSaques();
      setConfirmModal({ isOpen: false, saque: null, type: 'approve', reason: '', paymentDate: new Date().toISOString().split('T')[0] });
      setIsDetailsModalOpen(false);
      setSelectedSaque(null);
    } catch (error: any) {
      console.error('Erro ao aprovar saque:', error);
      toast.error(error.message || 'Erro ao aprovar saque.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejeitarSaque = async (saque: any) => {
    setConfirmModal({ isOpen: true, saque, type: 'reject', reason: '', paymentDate: new Date().toISOString().split('T')[0] });
  };

  const confirmRejeitarSaque = async () => {
    const { saque, reason } = confirmModal;
    if (!saque || isSubmitting) return;
    if (!reason.trim()) {
      toast.error('Informe o motivo da rejeicao.');
      return;
    }

    setIsSubmitting(true);

    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_processar_saque_prestador', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_saque_id: saque.id,
        p_acao: 'rejeitar',
        p_motivo: reason,
        p_data_pagamento: null
      });

      if (error) throw error;

      if (!data?.already_processed) {
        await notificationService.notifyProvider(
          saque.prestador_id,
          'Solicitacao de Saque Recusada',
          `Sua solicitacao de saque no valor de ${formatCurrency(saque.valor)} foi recusada. Motivo: ${reason}`,
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
        detalhes: `Rejeitou saque de ${formatCurrency(saque.valor)} para o prestador ${saque.prestador?.nome_razao}. Motivo: ${reason}`
      });

      toast.success(data?.already_processed ? 'Saque ja estava recusado.' : 'Saque recusado e valor estornado para a carteira do prestador.');
      fetchSaques();
      setConfirmModal({ isOpen: false, saque: null, type: 'approve', reason: '', paymentDate: new Date().toISOString().split('T')[0] });
      setIsDetailsModalOpen(false);
      setSelectedSaque(null);
    } catch (error: any) {
      console.error('Erro ao rejeitar saque:', error);
      toast.error(error.message || 'Erro ao rejeitar saque.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
      <div className="relative z-20 flex flex-col md:flex-row items-stretch md:items-center justify-end gap-4 px-2 mb-8">
        <GlobalFilter 
          searchValue={search}
          onSearch={setSearch}
          currentFilters={filters}
          onFilterChange={setFilters}
          onClear={() => {
            setSearch('');
            setFilters({ status: '', mes: '', ano: new Date().getFullYear().toString() });
          }}
          options={[
            {
              id: 'status',
              label: 'Status',
              type: 'select',
              options: [
                { value: 'pendente', label: 'Pendente' },
                { value: 'em_processamento', label: 'Em Processamento' },
                { value: 'pago', label: 'Pago' },
                { value: 'cancelado', label: 'Cancelado' }
              ]
            },
            {
              id: 'mes',
              label: 'Mês de Solicitação',
              type: 'select',
              options: [
                { value: '01', label: 'Janeiro' },
                { value: '02', label: 'Fevereiro' },
                { value: '03', label: 'Março' },
                { value: '04', label: 'Abril' },
                { value: '05', label: 'Maio' },
                { value: '06', label: 'Junho' },
                { value: '07', label: 'Julho' },
                { value: '08', label: 'Agosto' },
                { value: '09', label: 'Setembro' },
                { value: '10', label: 'Outubro' },
                { value: '11', label: 'Novembro' },
                { value: '12', label: 'Dezembro' }
              ]
            },
            {
              id: 'ano',
              label: 'Ano',
              type: 'select',
              options: [
                { value: '2024', label: '2024' },
                { value: '2025', label: '2025' },
                { value: '2026', label: '2026' }
              ]
            }
          ]}
        />
      </div>

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-6 py-4 font-medium">Data Solicitação</th>
                <th className="px-6 py-4 font-medium">Prestador</th>
                <th className="px-6 py-4 font-medium">Valor</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">
                    <div className="flex justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a1a] border-t-transparent"></div></div>
                  </td>
                </tr>
              ) : saques.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">
                    Nenhuma solicitação de saque encontrada.
                  </td>
                </tr>
              ) : (
                saques.map((saque) => (
                  <tr 
                    key={saque.id} 
                    id={`saque-${saque.id}`}
                    className={`transition-colors hover:bg-neutral-50 ${
                      highlightedId === saque.id 
                        ? 'bg-indigo-50/50 ring-2 ring-indigo-500 z-10 shadow-lg' 
                        : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-neutral-900">{formatDate(saque.created_at)}</div>
                      <div className="text-xs text-neutral-500">{formatDateTime(saque.created_at)}</div>
                    </td>
                    <td className="px-6 py-4 text-neutral-600">
                      <div className="font-medium text-neutral-900">{saque.prestador?.nome_razao || 'Não atribuído'}</div>
                      <div className="text-xs text-neutral-500">{saque.prestador?.documento}</div>

                    </td>
                    <td className="px-6 py-4 font-medium text-neutral-900">
                      {formatCurrency(saque.valor)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        saque.status === 'pendente' ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20' :
                        saque.status === 'em_processamento' ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20' :
                        saque.status === 'pago' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20' :
                        'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20'
                      }`}>
                        {saque.status.replace('_', ' ')}
                      </span>
                      {saque.observacao && (
                        <div className="mt-1 text-xs text-neutral-500 max-w-xs truncate" title={saque.observacao}>
                          {saque.observacao}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => {
                          setSelectedSaque(saque);
                          setIsDetailsModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                      >
                        <FileText className="h-4 w-4" />
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedSaque(null);
          setActiveDetailsTab('solicitacao');
        }}
        title="Detalhes da Solicitação de Saque"
        size="full"
      >
        {selectedSaque && (
          <div className="flex flex-col h-full bg-neutral-50/50 -m-6">
            {/* Modal Header Premium */}
            <div className="bg-white px-8 py-6 border-b border-neutral-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-[2rem] shadow-sm ring-1 ring-black/5 ${
                    selectedSaque.status === 'pago' ? 'bg-emerald-50 text-emerald-600' : 
                    selectedSaque.status === 'cancelado' ? 'bg-red-50 text-red-600' :
                    selectedSaque.status === 'pendente' ? 'bg-amber-50 text-amber-600' :
                    'bg-indigo-50 text-indigo-600'
                  }`}>
                    <DollarSign className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-neutral-900 uppercase tracking-tight">
                      Solicitação de Saque
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="font-mono text-[10px] font-black text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg ring-1 ring-indigo-100">
                        ID: {selectedSaque.id.substring(0, 8)}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                        selectedSaque.status === 'pago' ? 'bg-emerald-50 text-emerald-600' : 
                        selectedSaque.status === 'pendente' ? 'bg-amber-50 text-amber-600' :
                        selectedSaque.status === 'cancelado' ? 'bg-red-50 text-red-600' :
                        'bg-indigo-50 text-indigo-600'
                      }`}>
                        {selectedSaque.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-right mr-4">
                    <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Valor Solicitado</p>
                    <p className="text-2xl font-black text-neutral-900">{formatCurrency(selectedSaque.valor)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar Tabs */}
              <div className="w-64 bg-white border-r border-neutral-200 p-4 space-y-1">
                {[
                  { id: 'solicitacao', label: 'Dados da Solicitação', icon: FileText },
                  { id: 'prestador', label: 'Perfil do Prestador', icon: User },
                  { id: 'pagamento', label: 'Dados Bancários (PIX)', icon: CreditCard }
                ].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveDetailsTab(tab.id as any)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                        activeDetailsTab === tab.id 
                          ? 'bg-indigo-50 text-indigo-600 shadow-sm' 
                          : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-8">
                {activeDetailsTab === 'solicitacao' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Informações de Tempo</p>
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase">Solicitado em</p>
                            <p className="text-sm font-black text-neutral-900">{new Date(selectedSaque.created_at).toLocaleString('pt-BR')}</p>
                          </div>
                          {selectedSaque.data_pagamento && (
                            <div>
                              <p className="text-[10px] font-bold text-emerald-600 uppercase">Pago em</p>
                              <p className="text-sm font-black text-emerald-700">{new Date(selectedSaque.data_pagamento).toLocaleString('pt-BR')}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Resumo Financeiro</p>
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase">Valor do Saque</p>
                            <p className="text-xl font-black text-neutral-900">{formatCurrency(selectedSaque.valor)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase">Status</p>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase mt-1 ${
                              selectedSaque.status === 'pendente' ? 'bg-amber-100 text-amber-700' :
                              selectedSaque.status === 'pago' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {selectedSaque.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {selectedSaque.status === 'cancelado' && selectedSaque.observacao && (
                      <div className="rounded-3xl bg-red-50 p-6 border border-red-100">
                        <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-2">Motivo da Recusa</p>
                        <p className="text-sm text-red-700 font-medium leading-relaxed">{selectedSaque.observacao}</p>
                      </div>
                    )}

                    {selectedSaque.status === 'pendente' && (
                      <div className="flex gap-4 pt-6 border-t border-neutral-200">
                         <button
                          onClick={() => !isSubmitting && handleRejeitarSaque(selectedSaque)}
                          disabled={isSubmitting}
                          className="flex-1 rounded-2xl bg-red-50 py-4 text-xs font-black uppercase tracking-widest text-red-600 hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                        >
                          <XCircle className="h-4 w-4" />
                          Recusar Solicitação
                        </button>
                        <button
                          onClick={() => !isSubmitting && handleAprovarSaque(selectedSaque)}
                          disabled={isSubmitting}
                          className="flex-1 rounded-2xl bg-emerald-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Aprovar Pagamento
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeDetailsTab === 'prestador' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="flex items-center gap-6 mb-8">
                       <div className="h-20 w-20 rounded-[2.5rem] bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-3xl shadow-sm ring-1 ring-black/5">
                         {selectedSaque.prestador?.nome_razao?.[0] || 'P'}
                       </div>
                       <div>
                          <h3 className="text-2xl font-black text-neutral-900 uppercase tracking-tight">{selectedSaque.prestador?.nome_razao}</h3>
                          <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest font-mono">{selectedSaque.prestador?.documento}</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Informações de Contato</p>
                          <div className="space-y-4">
                             <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-neutral-50 text-neutral-400">
                                   <Phone className="h-4 w-4" />
                                </div>
                                <span className="text-sm font-bold text-neutral-700">{selectedSaque.prestador?.telefone}</span>
                             </div>
                             <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-neutral-50 text-neutral-400">
                                   <Mail className="h-4 w-4" />
                                </div>
                                <span className="text-sm font-bold text-neutral-700">{selectedSaque.prestador?.email}</span>
                             </div>
                          </div>
                       </div>
                    </div>
                  </div>
                )}

                {activeDetailsTab === 'pagamento' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="rounded-3xl bg-indigo-950 p-10 text-white shadow-2xl relative overflow-hidden group">
                       <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl transition-transform group-hover:scale-150"></div>
                       
                       <div className="relative z-10">
                          <p className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em] mb-8">Chave para Transferência (PIX)</p>
                          
                          <div className="space-y-6">
                             <div>
                                <p className="text-[10px] font-bold text-white/40 uppercase mb-1">Tipo de Chave</p>
                                <p className="text-lg font-black uppercase">{selectedSaque.tipo_chave_pix || 'Não informado'}</p>
                             </div>
                             
                             <div>
                                <p className="text-[10px] font-bold text-white/40 uppercase mb-1">Chave PIX</p>
                                <p className="text-3xl font-black text-indigo-100 break-all tracking-tight leading-tight">
                                   {selectedSaque.chave_pix}
                                </p>
                             </div>
                          </div>

                          <div className="mt-12 flex items-center gap-4 text-white/20">
                             <CreditCard className="h-8 w-8" />
                             <div className="h-[1px] flex-1 bg-white/10"></div>
                             <CheckCircle className="h-8 w-8" />
                          </div>
                       </div>
                    </div>

                    <div className="bg-amber-50 rounded-3xl p-6 border border-amber-200">
                       <div className="flex gap-4">
                          <AlertCircle className="h-6 w-6 text-amber-600 shrink-0" />
                          <div>
                             <p className="text-sm font-black text-amber-900 uppercase tracking-tight mb-1">Atenção ao Realizar o Pagamento</p>
                             <p className="text-xs text-amber-800 font-medium leading-relaxed">
                                Certifique-se de validar o nome do destinatário no seu banco antes de confirmar a transferência. 
                                Após realizar o PIX, retorne à aba "Solicitação" e clique em <strong>"Aprovar Pagamento"</strong> para baixar o crédito da carteira do prestador.
                             </p>
                          </div>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ 
          isOpen: false, 
          saque: null, 
          type: 'approve', 
          reason: '', 
          paymentDate: new Date().toISOString().split('T')[0] 
        })}
        title={confirmModal.type === 'approve' ? 'Aprovar Saque' : 'Recusar Saque'}
      >
        <div className="space-y-4">
          {confirmModal.type === 'approve' ? (
            <div className="space-y-4">
              <p className="text-neutral-600 text-sm">
                Confirme a data em que o pagamento foi realizado para o prestador <strong>{confirmModal.saque?.prestador?.nome_razao}</strong>:
              </p>
              <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5">
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Data do Pagamento:</label>
                <input
                  type="date"
                  required
                  value={confirmModal.paymentDate}
                  onChange={(e) => setConfirmModal({ ...confirmModal, paymentDate: e.target.value })}
                  className="w-full rounded-xl border-none bg-white p-3 text-sm font-bold text-neutral-900 shadow-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                />
              </div>
              <p className="text-[10px] font-bold text-amber-600 uppercase bg-amber-50 p-3 rounded-lg border border-amber-100 italic">
                Atenção: A baixa na carteira do prestador será realizada com base nesta data.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-bold text-neutral-700 mb-1">Motivo da recusa:</label>
              <textarea
                value={confirmModal.reason}
                onChange={(e) => setConfirmModal({ ...confirmModal, reason: e.target.value })}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
                rows={3}
                placeholder="Informe o motivo..."
              />
            </div>
          )}
          <div className="flex gap-4 pt-4">
            <button
              onClick={() => !isSubmitting && setConfirmModal({ 
                isOpen: false, 
                saque: null, 
                type: 'approve', 
                reason: '', 
                paymentDate: new Date().toISOString().split('T')[0] 
              })}
              className="flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50 px-4"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              onClick={confirmModal.type === 'approve' ? confirmAprovarSaque : confirmRejeitarSaque}
              disabled={isSubmitting}
              className={`flex-1 rounded-xl py-3 font-bold text-white shadow-lg transition-all px-4 ${
                confirmModal.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
              } disabled:opacity-50`}
            >
              {isSubmitting ? 'Processando...' : (confirmModal.type === 'approve' ? 'Confirmar Aprovação' : 'Confirmar Recusa')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
