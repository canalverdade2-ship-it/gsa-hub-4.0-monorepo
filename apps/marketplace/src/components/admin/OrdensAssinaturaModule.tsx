import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MoreHorizontal, Calendar, CheckCircle, XCircle, Layers, ShieldCheck, AlertTriangle, Receipt, DollarSign, Info, Trash2, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { formatCurrency, formatDate, handleError, generateUUID } from '../../lib/utils';
import { GlobalFilter } from '../ui/GlobalFilter';
import { toast } from 'react-hot-toast';
import { notificationService } from '../../lib/notificationService';
import { logService } from '../../lib/logService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { sessionService } from '../../lib/sessionService';
import { activateAdminSubscription } from '../../lib/adminStoreOperations';
import { deleteAdminEntityCascade } from '../../lib/adminRpc';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

const getAdminSessionForRpc = () => {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken) {
    throw new Error('Sessao administrativa expirada. Faca login novamente.');
  }
  return session;
};

const getLocalDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function OrdensAssinaturaModule({ activeSubTab, initialItemId, colaboradorNome }: { activeSubTab?: 'processamento' | 'concluido' | 'cancelado', initialItemId?: string, colaboradorNome?: string }) {
  const [activeTab, setActiveTab] = useState<'processamento' | 'concluido' | 'cancelado'>('processamento');

  useEffect(() => {
    if (activeSubTab) setActiveTab(activeSubTab);
  }, [activeSubTab]);
  const [ordens, setOrdens] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({
    mes: '',
    ano: ''
  });
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedOrdem, setSelectedOrdem] = useState<any | null>(null);
  const [isProrrogarModalOpen, setIsProrrogarModalOpen] = useState(false);
  const [isCancelarModalOpen, setIsCancelarModalOpen] = useState(false);
  const [mesesProrrogacao, setMesesProrrogacao] = useState<number>(1);
  const [dataCancelamento, setDataCancelamento] = useState<string>('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [isSubmittingSubscriptionAction, setIsSubmittingSubscriptionAction] = useState(false);
  const extensionRequestId = useRef(generateUUID());
  const cancellationRequestId = useRef(generateUUID());
  const activationRequestId = useRef(generateUUID());

  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && ordens.length > 0 && hasAutoOpened.current !== initialItemId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`oa-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          
          // Abrir modal automaticamente
          const ordem = ordens.find(o => o.id === initialItemId);
          if (ordem) {
            setSelectedOrdem(ordem);
            setIsDetailOpen(true);
            hasAutoOpened.current = initialItemId;
          }

          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, ordens]);


  const fetchOrdens = useCallback(async () => {
    let selectStr = '*, assinaturas(nome, valor), clientes(nome), faturas(*), orcamentos(*)';
    if (search) {
      selectStr = '*, assinaturas!inner(nome, valor), clientes(nome), faturas(*), orcamentos(*)';
    }

    let query = supabase
      .from('ordens_assinatura')
      .select(selectStr);

    if (activeTab === 'processamento') {
      query = query.in('status', ['em_analise', 'pendente', 'pago']);
    } else if (activeTab === 'concluido') {
      query = query.in('status', ['concluido', 'em_cancelamento']);
    } else {
      query = query.eq('status', 'cancelado');
    }
    
    if (search) {
      query = query.ilike('assinaturas.nome', `%${search}%`);
    }

    if (filters.mes) {
      const year = filters.ano || new Date().getFullYear();
      const startDate = `${year}-${filters.mes}-01`;
      const endDate = `${year}-${filters.mes}-${String(new Date(Number(year), Number(filters.mes), 0).getDate()).padStart(2, '0')}`;
      query = query.gte('data_criacao', startDate).lte('data_criacao', endDate);
    }

    const { data, error } = await query.order('data_criacao', { ascending: false });
    if (error) {
      console.error('Error fetching ordens_assinatura:', error);
      toast.error('Erro ao carregar ordens de assinatura.');
    }
    if (data) {
      setOrdens(data);
    }
  }, [activeTab, search, filters]);

  useEffect(() => {
    fetchOrdens();
  }, [fetchOrdens]);

  useRealtimeSubscription([
    { table: 'ordens_assinatura', onChange: fetchOrdens, debounceMs: 300 },
    { table: 'assinaturas', onChange: fetchOrdens, debounceMs: 300 },
    { table: 'faturas', onChange: fetchOrdens, debounceMs: 300 },
    { table: 'orcamentos', onChange: fetchOrdens, debounceMs: 300 },
    { table: 'clientes', onChange: fetchOrdens, debounceMs: 300 },
  ], [fetchOrdens]);

  const executeSubscriptionCancellation = async (
    ordem: any,
    cancellationDate: string,
    motivo?: string
  ) => {
    const session = getAdminSessionForRpc();
    const { data, error } = await supabase.rpc('gsa_admin_cancel_subscription', {
      p_sessao_id: session.sessaoId,
      p_session_token: session.sessionToken,
      p_request_id: cancellationRequestId.current,
      p_ordem_assinatura_id: ordem.id,
      p_data_cancelamento: cancellationDate,
      p_motivo: motivo || null,
    });

    if (error) throw error;
    if (!(data as any)?.success) {
      throw new Error('Nao foi possivel cancelar a assinatura.');
    }

    cancellationRequestId.current = generateUUID();
    return data as any;
  };

  const handleDeleteAssinaturaCascade = async () => {
    if (!selectedOrdem || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteAdminEntityCascade(
        'ordem_assinatura',
        selectedOrdem.id,
        deleteReason || 'Exclusão direta via Painel de Ordens de Assinatura'
      );
      if (!result?.success) {
        throw new Error(result?.message || 'Falha ao excluir ordem de assinatura.');
      }
      toast.success('Ordem de assinatura e histórico vinculados excluídos de ponta a ponta!');
      setIsDeleteModalOpen(false);
      setIsDetailOpen(false);
      setSelectedOrdem(null);
      setDeleteReason('');
      await fetchOrdens();
    } catch (err: any) {
      console.error('Erro ao excluir ordem de assinatura:', err);
      toast.error(handleError(err, 'Erro ao excluir ordem de assinatura'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'concluido' | 'cancelado', motivo?: string) => {
    const ordem = ordens.find(o => o.id === id);
    if (!ordem) {
      toast.error('Ordem de assinatura nao encontrada.');
      return;
    }

    setIsSubmittingSubscriptionAction(true);
    try {
      if (status === 'cancelado') {
        const data = await executeSubscriptionCancellation(
          ordem,
          getLocalDateInputValue(),
          motivo || 'Cancelamento imediato da ordem pelo sistema'
        );

        toast.success((data as any)?.already_processed
          ? 'Esta ordem ja estava cancelada.'
          : 'Ordem de assinatura cancelada com seguranca.');
        setIsDetailOpen(false);
        await fetchOrdens();
        return;
      }

const result = await activateAdminSubscription({
  requestId: activationRequestId.current,
  ordemId: id,
});
activationRequestId.current = generateUUID();
toast.success(result?.already_processed
  ? 'Esta ativação já havia sido processada.'
  : 'Assinatura ativada com segurança.');
      setIsDetailOpen(false);
      await fetchOrdens();
    } catch (error) {
      toast.error(handleError(error, status === 'concluido' ? 'ativar assinatura' : 'cancelar assinatura'));
    } finally {
      setIsSubmittingSubscriptionAction(false);
    }
  };

  const handleProrrogarAssinatura = async () => {
    if (!selectedOrdem) return;
    if (!Number.isInteger(mesesProrrogacao) || mesesProrrogacao < 1 || mesesProrrogacao > 36) {
      toast.error('Informe um periodo entre 1 e 36 meses.');
      return;
    }

    setIsSubmittingSubscriptionAction(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_extend_subscription', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_request_id: extensionRequestId.current,
        p_ordem_assinatura_id: selectedOrdem.id,
        p_meses: mesesProrrogacao,
      });

      if (error) throw error;
      if (!(data as any)?.success) {
        throw new Error('Nao foi possivel prorrogar a assinatura.');
      }

      extensionRequestId.current = generateUUID();
      toast.success((data as any)?.already_exists
        ? 'Esta prorrogacao ja havia sido processada.'
        : 'Assinatura prorrogada e faturas geradas em uma unica transacao.');

      setMesesProrrogacao(1);
      setIsProrrogarModalOpen(false);
      setIsDetailOpen(false);
      await fetchOrdens();
    } catch (error) {
      toast.error(handleError(error, 'prorrogar assinatura'));
    } finally {
      setIsSubmittingSubscriptionAction(false);
    }
  };

  const handleCancelarAssinatura = async () => {
    if (!selectedOrdem || !dataCancelamento) return;

    const today = getLocalDateInputValue();
    if (dataCancelamento < today) {
      toast.error('A data de cancelamento nao pode ser retroativa.');
      return;
    }

    setIsSubmittingSubscriptionAction(true);
    try {
      const data = await executeSubscriptionCancellation(
        selectedOrdem,
        dataCancelamento,
        'Cancelamento solicitado pelo painel administrativo'
      );

      toast.success((data as any)?.status === 'em_cancelamento'
        ? 'Cancelamento agendado e cobrancas futuras ajustadas.'
        : (data as any)?.already_processed
          ? 'Esta assinatura ja estava cancelada.'
          : 'Assinatura cancelada e cobrancas futuras ajustadas.');

      setDataCancelamento('');
      setIsCancelarModalOpen(false);
      setIsDetailOpen(false);
      await fetchOrdens();
    } catch (error) {
      toast.error(handleError(error, 'cancelar assinatura'));
    } finally {
      setIsSubmittingSubscriptionAction(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
      <div className="grid grid-cols-1 gap-2 rounded-2xl bg-neutral-100 p-1 sm:grid-cols-3">
        {[
          { id: 'processamento' as const, label: 'Processamento' },
          { id: 'concluido' as const, label: 'Ativas' },
          { id: 'cancelado' as const, label: 'Canceladas' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-neutral-200'
                : 'text-neutral-500 hover:bg-white/60 hover:text-neutral-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-end gap-4 px-2 mb-8">
        <GlobalFilter 
          searchValue={search}
          onSearch={setSearch}
          currentFilters={filters}
          onFilterChange={setFilters}
          onClear={() => {
            setSearch('');
            setFilters({ mes: '', ano: new Date().getFullYear().toString() });
          }}
          options={[
            {
              id: 'mes',
              label: 'Mês de Criação',
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

      <div className="grid grid-cols-1 gap-6">
        {ordens.length > 0 ? ordens.map((ordem) => {
          const fatura = ordem.faturas?.[0];
          return (
            <div 
              key={ordem.id} 
              id={`oa-${ordem.id}`}
              className={`group relative overflow-hidden rounded-[2.5rem] bg-white p-6 md:p-8 shadow-sm ring-1 ring-black/5 transition-all hover:shadow-2xl hover:-translate-y-1 flex flex-col md:flex-row md:items-center justify-between gap-6 ${
                highlightedId === ordem.id 
                  ? 'bg-indigo-50/50 ring-2 ring-indigo-500 z-10 scale-[1.01]' 
                  : ''
              }`}
            >
              <div className={`absolute top-0 right-0 h-32 w-32 translate-x-12 -translate-y-12 rounded-full opacity-5 group-hover:opacity-10 transition-opacity ${
                ordem.status === 'concluido' ? 'bg-emerald-500' : 
                ordem.status === 'em_cancelamento' ? 'bg-indigo-500' :
                ordem.status === 'cancelado' ? 'bg-red-500' : 'bg-amber-500'
              }`} />
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 relative z-10">
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl shadow-inner group-hover:scale-110 transition-all ${
                  ordem.status === 'concluido' ? 'bg-emerald-50 text-emerald-600' : 
                  ordem.status === 'em_cancelamento' ? 'bg-indigo-50 text-indigo-600' :
                  ordem.status === 'cancelado' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                }`}>
                  <Calendar className="h-8 w-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black text-neutral-900 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{ordem.nome_assinatura_contratada ?? ordem.assinaturas?.nome}</h3>
                    <span className="text-[10px] font-mono text-neutral-400 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100">{ordem.codigo_ordem}</span>
                  </div>
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-1">Cliente: {ordem.clientes.nome}</p>
                  <div className="flex items-center flex-wrap gap-3 mt-3">
                    <p className="text-xl font-black text-[#1a1a1a] tracking-tighter">{formatCurrency(ordem.valor_mensal_contratado ?? ordem.assinaturas?.valor ?? 0)}</p>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md shadow-sm ${
                      ordem.status === 'concluido' ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' : 
                      ordem.status === 'em_cancelamento' ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' :
                      ordem.status === 'cancelado' ? 'bg-red-50 text-red-600 ring-1 ring-red-200' :
                      'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
                    }`}>
                      {ordem.status === 'concluido' ? 'Ativa' : 
                       ordem.status === 'em_cancelamento' ? 'Em Cancelamento' :
                       ordem.status === 'cancelado' ? 'Cancelada' : 'Pendente'}
                    </span>
                    {fatura && (
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md shadow-sm ${
                        fatura.status === 'pago' ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
                      }`}>
                        {fatura.status === 'pago' ? 'Pago' : 'Aguardando Pagamento'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedOrdem(ordem); setIsDetailOpen(true); }}
                className="relative z-10 w-full md:w-auto rounded-2xl bg-indigo-600 md:bg-neutral-100 py-4 md:p-4 text-white md:text-neutral-400 hover:bg-indigo-700 md:hover:bg-[#1a1a1a] hover:text-white transition-all active:scale-95 shadow-lg shadow-indigo-600/20 md:shadow-sm text-[10px] font-black uppercase tracking-widest md:normal-case md:tracking-normal flex items-center justify-center gap-2"
              >
                <span className="md:hidden">Ver Detalhes</span>
                <MoreHorizontal className="hidden md:block h-6 w-6" />
              </button>
            </div>
          );
        }) : (
          <div className="py-24 text-center">
            <Calendar className="h-16 w-16 text-neutral-100 mx-auto mb-4" />
            <p className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">Nenhuma ordem de assinatura {activeTab === 'processamento' ? 'em processamento' : activeTab === 'cancelado' ? 'cancelada' : 'ativa ou agendada'}</p>
          </div>
        )}
      </div>

      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Detalhes da Ordem de Assinatura" size="wide">
        {selectedOrdem && (
          <AssinaturaDetails 
            ordem={selectedOrdem}
            activeTab={activeTab}
            onOpenProrrogar={() => setIsProrrogarModalOpen(true)}
            onOpenCancelar={() => setIsCancelarModalOpen(true)}
            onUpdateStatus={handleUpdateStatus}
            onDeleteClick={() => {
              setDeleteReason('');
              setIsDeleteModalOpen(true);
            }}
          />
        )}
      </Modal>

      <Modal
        isOpen={isProrrogarModalOpen}
        onClose={() => setIsProrrogarModalOpen(false)}
        title="Prorrogar Assinatura"
      >
        <div className="space-y-6">
          <p className="text-sm text-neutral-600">
            Quantos meses adicionais deseja prorrogar esta assinatura?
          </p>
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-1">Meses</label>
            <input 
              type="number"
              min="1"
              value={mesesProrrogacao}
              inputMode="numeric"
onChange={(e) => setMesesProrrogacao(parseInt(e.target.value) || 1)}
              className="w-full rounded-xl border-neutral-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <button
            disabled={isSubmittingSubscriptionAction}
            onClick={handleProrrogarAssinatura}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmittingSubscriptionAction ? 'Processando...' : 'Confirmar Prorrogação'}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={isCancelarModalOpen}
        onClose={() => setIsCancelarModalOpen(false)}
        title="Cancelar Assinatura"
      >
        <div className="space-y-6">
          <p className="text-sm text-neutral-600">
            Selecione a data efetiva do encerramento. Faturas pagas serao preservadas, cobrancas com vencimento ate essa data permanecerao validas e somente faturas nao pagas posteriores serao canceladas.
          </p>
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-1">Data de Cancelamento</label>
            <input
              type="date"
              min={getLocalDateInputValue()}
              value={dataCancelamento}
              onChange={(e) => setDataCancelamento(e.target.value)}
              className="w-full rounded-xl border-neutral-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <button
            disabled={!dataCancelamento || isSubmittingSubscriptionAction}
            onClick={handleCancelarAssinatura}
            className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmittingSubscriptionAction ? 'Processando...' : 'Confirmar Cancelamento'}
          </button>
        </div>
      </Modal>

      {/* Modal Exclusão de Assinatura em Cascata */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => { if (!isDeleting) setIsDeleteModalOpen(false); }}
        title="Excluir Ordem de Assinatura de Ponta a Ponta"
      >
        {selectedOrdem && (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-900 space-y-1">
                <p className="font-bold text-sm">Exclusão Master em Cascata</p>
                <p className="leading-relaxed">
                  Você está prestes a excluir permanentemente a assinatura <strong>{selectedOrdem.codigo_ordem || `#OA-${selectedOrdem.id.slice(0, 4).toUpperCase()}`}</strong> ({selectedOrdem.nome_assinatura_contratada || selectedOrdem.assinaturas?.nome}).
                </p>
                <p className="text-[11px] text-red-750">
                  Esta ação é irreversível e executará a limpeza em cascata completa: faturas, cobranças, notificações e histórico vinculado serão removidos sem deixar pendências.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo da Exclusão (Auditoria)
              </label>
              <input
                type="text"
                placeholder="Ex: Cancelamento definitivo e expurgo pelo Administrador..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteAssinaturaCascade}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AssinaturaDetails({ 
  ordem, 
  activeTab, 
  onOpenProrrogar, 
  onOpenCancelar, 
  onUpdateStatus,
  onDeleteClick
}: { 
  ordem: any, 
  activeTab?: string, 
  onOpenProrrogar?: () => void, 
  onOpenCancelar?: () => void, 
  onUpdateStatus?: (id: string, status: 'concluido' | 'cancelado', motivo?: string) => void,
  onDeleteClick?: () => void
}) {
  const orcamento = Array.isArray(ordem.orcamentos) ? ordem.orcamentos[0] : ordem.orcamentos;
  
  const statusColors: Record<string, string> = {
    'em_analise': 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/50',
    'em_cancelamento': 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/50',
    'concluido': 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50',
    'cancelado': 'bg-red-50 text-red-600 ring-1 ring-red-200/50',
    'pago': 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/50',
    'pendente': 'bg-orange-50 text-orange-600 ring-1 ring-orange-200/50',
  };

  const statusLabels: Record<string, string> = {
    'em_analise': 'Em Processamento',
    'pago': 'Pago (Em Processamento)',
    'pendente': 'Pendente (Em Processamento)',
    'em_cancelamento': 'Em Cancelamento',
    'concluido': 'Ativa',
    'cancelado': 'Cancelada',
  };

  const displayLabel = statusLabels[ordem.status] || ordem.status;
  const badgeClass = statusColors[ordem.status] || 'bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200';
  const isPulsing = ['em_analise', 'em_cancelamento', 'pago', 'pendente'].includes(ordem.status);

  return (
    <div className="space-y-6">
      {/* Alert Banners */}
      {ordem.status === 'cancelado' && (
        <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200/50 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-left">
            <h5 className="text-sm font-black text-red-900 uppercase">Assinatura Cancelada</h5>
            <p className="text-xs text-red-700 mt-1 leading-relaxed">
              Esta assinatura foi cancelada em {formatDate(ordem.data_cancelamento)}.
              {ordem.motivo_cancelamento && <><br/><strong>Motivo:</strong> {ordem.motivo_cancelamento}</>}
            </p>
          </div>
        </div>
      )}

      {ordem.status === 'em_cancelamento' && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200/50 flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-left">
            <h5 className="text-sm font-black text-amber-900 uppercase">Cancelamento Agendado</h5>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              A assinatura está programada para ser encerrada em {formatDate(ordem.data_cancelamento)}. Faturas pagas serão preservadas, cobranças com vencimento até essa data permanecerão válidas e somente cobranças futuras não pagas serão canceladas.
            </p>
          </div>
        </div>
      )}

      {/* Header do Modal */}
      <div className="rounded-3xl bg-neutral-50 p-5 ring-1 ring-neutral-200/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex gap-4 items-center">
          <div className="h-14 w-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
            <Layers className="h-6 w-6" />
          </div>
          <div className="text-left">
            <span className="text-[10px] font-mono font-black text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100/50">
              {ordem.codigo_ordem || `#OA-${ordem.id.slice(0, 4).toUpperCase()}`}
            </span>
            <h3 className="text-xl font-black text-neutral-900 tracking-tight leading-tight mt-1">
              {ordem.nome_assinatura_contratada ?? ordem.assinaturas?.nome}
            </h3>
            <span className="text-xs font-bold text-neutral-500">{ordem.clientes?.nome}</span>
          </div>
        </div>
        <div className="text-left sm:text-right flex flex-col sm:items-end gap-2">
          <div className="flex items-center gap-2">
            <AdminWhatsAppButton 
              telefone={ordem.clientes?.telefone}
              mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                tipo: 'assinatura',
                clienteNome: ordem.clientes?.nome,
                codigo: ordem.codigo_ordem || `#OA-${ordem.id.slice(0, 4).toUpperCase()}`,
                status: ordem.status === 'concluido' ? 'Ativa' : ordem.status === 'em_cancelamento' ? 'Em Cancelamento' : ordem.status === 'cancelado' ? 'Cancelada' : 'Em Processamento'
              })}
            />
            <div className="text-right">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Status do Contrato</span>
              <div className="mt-1">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${badgeClass}`}>
                  {isPulsing && (
                    <span className="h-2 w-2 rounded-full bg-current animate-ping" />
                  )}
                  {displayLabel}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Symmetrical Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Coluna da Direita: Detalhes & Vigência */}
        <div className="space-y-6 text-left">
          <div className="rounded-[2rem] bg-neutral-50 p-6 ring-1 ring-neutral-200/60">
            <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-indigo-500" /> Detalhes do Plano
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Valor do Plano</span>
                <span className="text-lg font-black text-neutral-950 mt-1 block">
                  {formatCurrency(ordem.valor_mensal_contratado ?? ordem.assinaturas?.valor ?? 0)}
                  <span className="text-xs text-neutral-400 font-bold"> /mês</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Vigência Ativa</span>
                <span className="text-base font-black text-neutral-800 mt-1.5 block">
                  {ordem.prazo_meses || 1} { (ordem.prazo_meses || 1) === 1 ? 'mês' : 'meses' }
                </span>
              </div>
              <div>
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Data de Início</span>
                <span className="text-sm font-bold text-neutral-700 mt-1 block">
                  {formatDate(ordem.data_inicio || ordem.data_criacao)}
                </span>
              </div>
              {ordem.data_vencimento && (
                <div>
                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Vencimento</span>
                  <span className="text-sm font-bold text-neutral-700 mt-1 block">
                    {formatDate(ordem.data_vencimento)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Ações de Gestão */}
          <div className="pt-2">
            {activeTab === 'processamento' && onUpdateStatus && (
              <div className="space-y-3">
                <button 
                  onClick={() => onUpdateStatus(ordem.id, 'concluido')}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white py-3 text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-emerald-600/10 hover:shadow-lg hover:shadow-emerald-600/20"
                >
                  <CheckCircle className="h-4 w-4" /> Ativar Assinatura
                </button>
                <button 
                  onClick={() => onUpdateStatus(ordem.id, 'cancelado', 'Cancelado pelo sistema')}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 py-3 text-xs font-black uppercase tracking-widest transition-all ring-1 ring-red-100"
                >
                  <XCircle className="h-4 w-4" /> Cancelar Ordem
                </button>
                {onDeleteClick && (
                  <button 
                    onClick={onDeleteClick}
                    title="Excluir Assinatura em Cascata (Administrador Master)"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 hover:bg-red-700 text-white py-3 text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-red-600/20"
                  >
                    <Trash2 className="h-4 w-4" /> Excluir Assinatura
                  </button>
                )}
              </div>
            )}
            
            {activeTab === 'concluido' && (
              <div className="space-y-3">
                {onOpenProrrogar && (
                  <button
                    onClick={onOpenProrrogar}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white py-3 text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-emerald-600/10 hover:shadow-lg hover:shadow-emerald-600/20"
                  >
                    <Calendar className="h-4 w-4" /> Prorrogar Assinatura
                  </button>
                )}
                {ordem.status === 'concluido' && onOpenCancelar && (
                  <button
                    onClick={onOpenCancelar}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 py-3 text-xs font-black uppercase tracking-widest transition-all ring-1 ring-red-100"
                  >
                    <XCircle className="h-4 w-4" /> Cancelar Assinatura
                  </button>
                )}
                {onDeleteClick && (
                  <button 
                    onClick={onDeleteClick}
                    title="Excluir Assinatura em Cascata (Administrador Master)"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 hover:bg-red-700 text-white py-3 text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-red-600/20"
                  >
                    <Trash2 className="h-4 w-4" /> Excluir Assinatura
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
