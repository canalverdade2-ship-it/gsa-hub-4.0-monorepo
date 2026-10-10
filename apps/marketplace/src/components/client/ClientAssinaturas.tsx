import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, handleError, generateUUID } from '../../lib/utils';
import { Calendar, Clock, CheckCircle, XCircle, Info, ArrowRight, Layers, ShieldCheck, AlertTriangle, Receipt, DollarSign } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { useAutoFitTabs } from '../../hooks/useAutoFitTabs';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { callClientRpc } from '../../lib/clientRpc';

const getLocalDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getInvoiceStatusInfo = (status?: string) => {
  const statuses: Record<string, { label: string; className: string }> = {
    pago: { label: 'Pago', className: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100' },
    pendente: { label: 'Pendente', className: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100' },
    vencida: { label: 'Vencida', className: 'bg-red-50 text-red-600 ring-1 ring-red-100' },
    cancelado: { label: 'Cancelada', className: 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200' },
    cancelada: { label: 'Cancelada', className: 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200' },
    revisada: { label: 'Revisada', className: 'bg-blue-50 text-blue-600 ring-1 ring-blue-100' },
    aguardando_link: { label: 'Aguardando Link', className: 'bg-violet-50 text-violet-600 ring-1 ring-violet-100' },
    pendente_pagamento: { label: 'Pendente de Pagamento', className: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100' },
  };

  return statuses[status || ''] || {
    label: status ? status.replace(/_/g, ' ') : 'Sem status',
    className: 'bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200',
  };
};

export function ClientAssinaturas({ 
  clientId, 
  initialTab,
  initialItemId,
  onNavigate
}: { 
  clientId: string, 
  initialTab?: string,
  initialItemId?: string,
  onNavigate?: (module: string, tab?: string, itemId?: string) => void
}) {
  const { containerRef: minhasTabsRef, setButtonRef: setMinhasTabButtonRef } = useAutoFitTabs(16, 10);
  const extensionRequestId = useRef(generateUUID());
  const cancellationRequestId = useRef(generateUUID());
  const [minhasTab, setMinhasTab] = useState<'ativas' | 'canceladas' | 'em_cancelamento'>(
    (initialTab as any) || 'ativas'
  );


  useEffect(() => {
    if (initialTab) setMinhasTab(initialTab as any);
  }, [initialTab]);
  const [minhasAssinaturas, setMinhasAssinaturas] = useState<any[]>([]);
  const [selectedAssinatura, setSelectedAssinatura] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProrrogarModalOpen, setIsProrrogarModalOpen] = useState(false);
  const [isCancelarModalOpen, setIsCancelarModalOpen] = useState(false);
  const [mesesProrrogacao, setMesesProrrogacao] = useState<number>(1);
  const [dataCancelamento, setDataCancelamento] = useState<string>('');
  const [isSubmittingSubscriptionAction, setIsSubmittingSubscriptionAction] = useState(false);
  const hasAutoOpened = useRef<string | null>(null);

  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (initialItemId && minhasAssinaturas.length > 0 && hasAutoOpened.current !== initialItemId) {
      const item = minhasAssinaturas.find(a => a.id === initialItemId);
      if (item) {
        hasAutoOpened.current = initialItemId;
        // Auto-tab switching
        if (['em_analise', 'pendente', 'pago', 'concluido', 'em_cancelamento'].includes(item.status)) setMinhasTab('ativas');
        else if (item.status === 'cancelado') setMinhasTab('canceladas');

        setSelectedAssinatura(item);
        setIsModalOpen(true);

        // Scroll and highlight
        setTimeout(() => {
          const element = document.getElementById(`sub-${initialItemId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId(item.id);
            setTimeout(() => setHighlightedItemId(null), 3000);
          }
        }, 300);
      } else {
        if (initialTab && initialTab !== minhasTab) {
          setMinhasTab(initialTab as any);
        }
      }
    }
  }, [initialItemId, minhasAssinaturas.length, initialTab]);

  useEffect(() => {
    fetchMinhasAssinaturas();
  }, [clientId, minhasTab]);

  useRealtimeSubscription(
    [
      { table: 'ordens_assinatura', filter: `cliente_id=eq.${clientId}`, onChange: fetchMinhasAssinaturas },
      { table: 'faturas', filter: `cliente_id=eq.${clientId}`, onChange: fetchMinhasAssinaturas },
      { table: 'assinaturas', onChange: fetchMinhasAssinaturas },
    ],
    [clientId]
  );

  async function fetchMinhasAssinaturas() {
    try {
      const { data } = await supabase
        .from('ordens_assinatura')
        .select('*, assinaturas(nome, valor), faturas(*), orcamentos(*)')
        .eq('cliente_id', clientId)
        .order('data_criacao', { ascending: false });
      
      if (data) setMinhasAssinaturas(data);
    } catch (err) {
      console.error('Erro ao buscar assinaturas:', err);
    }
  };

  const handleAssinarNovamente = async (assinatura: any) => {
    setIsModalOpen(false);
    if (onNavigate && assinatura.assinatura_id) {
      onNavigate('gsa_store', 'shop', assinatura.assinatura_id);
    }
  };

  const handleProrrogarAssinatura = async () => {
    if (!selectedAssinatura) return;
    if (!Number.isInteger(mesesProrrogacao) || mesesProrrogacao < 1 || mesesProrrogacao > 36) {
      toast.error('Informe um periodo entre 1 e 36 meses.');
      return;
    }

    setIsSubmittingSubscriptionAction(true);
    try {
      const data = await callClientRpc<any>('gsa_client_extend_subscription', {
        p_request_id: extensionRequestId.current,
        p_ordem_assinatura_id: selectedAssinatura.id,
        p_meses: mesesProrrogacao,
      });
      if (!data?.success) throw new Error('Erro ao prorrogar assinatura.');

      extensionRequestId.current = generateUUID();
      toast.success(data?.already_exists
        ? 'Esta prorrogacao ja havia sido processada.'
        : 'Assinatura prorrogada e faturas geradas com sucesso!');

      setMesesProrrogacao(1);
      setIsProrrogarModalOpen(false);
      setIsModalOpen(false);
      await fetchMinhasAssinaturas();
    } catch (error) {
      toast.error(handleError(error, 'prorrogar assinatura'));
    } finally {
      setIsSubmittingSubscriptionAction(false);
    }
  };

  const handleCancelarAssinatura = async () => {
    if (!selectedAssinatura || !dataCancelamento) return;

    const today = getLocalDateInputValue();
    if (dataCancelamento < today) {
      toast.error('A data de cancelamento nao pode ser retroativa.');
      return;
    }

    setIsSubmittingSubscriptionAction(true);
    try {
      const data = await callClientRpc<any>('gsa_client_cancel_subscription', {
        p_request_id: cancellationRequestId.current,
        p_ordem_assinatura_id: selectedAssinatura.id,
        p_data_cancelamento: dataCancelamento,
      });
      if (!data?.success) throw new Error('Erro ao cancelar assinatura.');

      cancellationRequestId.current = generateUUID();
      toast.success(data?.status === 'em_cancelamento'
        ? 'Cancelamento agendado com sucesso.'
        : data?.already_processed
          ? 'Esta assinatura ja estava cancelada.'
          : 'Assinatura cancelada com sucesso.');

      setDataCancelamento('');
      setIsCancelarModalOpen(false);
      setIsModalOpen(false);
      await fetchMinhasAssinaturas();
    } catch (error) {
      toast.error(handleError(error, 'cancelar assinatura'));
    } finally {
      setIsSubmittingSubscriptionAction(false);
    }
  };

  const calculateCancellationPreview = () => {
    if (!dataCancelamento) return { diasRestantes: 0 };

    const cancelDate = new Date(`${dataCancelamento}T00:00:00`);
    const today = new Date(`${getLocalDateInputValue()}T00:00:00`);
    const diffTime = cancelDate.getTime() - today.getTime();
    return { diasRestantes: Math.max(0, Math.ceil(diffTime / 86400000)) };
  };

  const handleOpenDetails = (assinatura: any) => {
    setSelectedAssinatura(assinatura);
    setIsModalOpen(true);
  };

  const filteredMinhas = minhasAssinaturas.filter(a => {
    if (minhasTab === 'ativas') {
      return ['em_analise', 'pendente', 'pago', 'concluido', 'em_cancelamento'].includes(a.status);
    } else if (minhasTab === 'em_cancelamento') {
      return a.status === 'em_cancelamento';
    } else {
      return a.status === 'cancelado';
    }
  });

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="w-full min-w-0 overflow-x-auto sm:w-auto">
          <div ref={minhasTabsRef} className="flex w-full gap-1 rounded-3xl bg-neutral-200/50 p-1 ring-1 ring-neutral-300 shadow-inner">
            {['ativas', 'canceladas'].map((t, index) => (
              <button 
                key={t}
                ref={setMinhasTabButtonRef(index)}
                onClick={() => setMinhasTab(t as 'ativas' | 'canceladas')}
                className={`min-w-0 flex-1 whitespace-nowrap rounded-2xl px-1.5 py-2.5 font-black capitalize leading-none transition-all sm:px-6 ${minhasTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMinhas.map((a) => {
            const orcamento = Array.isArray(a.orcamentos) ? a.orcamentos[0] : a.orcamentos;
            
            const statusColors: Record<string, string> = {
              'em_analise': 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/50',
              'em_cancelamento': 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/50',
              'concluido': 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50',
              'cancelado': 'bg-red-50 text-red-600 ring-1 ring-red-200/50',
            };

            const statusLabels: Record<string, string> = {
              'em_analise': 'Em Processamento',
              'em_cancelamento': 'Em Cancelamento',
              'concluido': 'Ativa',
              'cancelado': 'Cancelada',
            };

            const displayLabel = statusLabels[a.status] || a.status;
            const badgeClass = statusColors[a.status] || 'bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200';
            const isPulsing = ['em_analise', 'em_cancelamento'].includes(a.status);

            return (
              <div
                id={`sub-${a.id}`}
                key={a.id}
                className={`relative group rounded-[2rem] p-5 transition-all duration-500 overflow-hidden bg-white ${
                  highlightedItemId === a.id
                    ? 'bg-indigo-50/50 ring-4 ring-indigo-500 shadow-2xl scale-[1.02] z-10'
                    : 'shadow-md hover:shadow-2xl ring-1 ring-neutral-200'
                }`}
              >
                {/* Efeito decorativo de fundo no card */}
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-indigo-50 opacity-20 group-hover:scale-150 transition-all duration-700" />
                
                <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                  <div>
                    {/* Header do Card */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[11px] font-mono font-black text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100/50">
                        {orcamento?.codigo_orcamento || `#OC${a.codigo_ordem}`}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${badgeClass}`}>
                        {isPulsing && (
                          <span className="h-1.5 w-1.5 rounded-full bg-current animate-ping" />
                        )}
                        {displayLabel}
                      </span>
                    </div>

                    {/* Conteúdo Principal do Card */}
                    <div className="flex gap-4 items-start text-left">
                      <div className="h-16 w-16 rounded-2xl bg-indigo-50/50 text-indigo-600 flex-shrink-0 flex items-center justify-center border border-indigo-100/50 overflow-hidden">
                        <Layers className="h-7 w-7" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-base font-black text-neutral-900 tracking-tight leading-tight truncate group-hover:text-indigo-600 transition-colors">
                          {a.nome_assinatura_contratada ?? a.assinaturas?.nome}
                        </h4>
                        <p className="text-[11px] font-bold text-neutral-400 mt-1">
                          Início: {formatDate(a.data_inicio || a.data_criacao)}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs font-bold text-neutral-500">
                            {a.prazo_meses || 1} { (a.prazo_meses || 1) === 1 ? 'mês' : 'meses' }
                          </span>
                          <span className="h-1 w-1 rounded-full bg-neutral-300" />
                          <span className="text-sm font-black text-indigo-600">
                            {formatCurrency(a.valor_mensal_contratado ?? a.assinaturas?.valor ?? 0)}/mês
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé e Ação */}
                  <div className="pt-2 border-t border-neutral-100 mt-2">
                    <button
                      onClick={() => handleOpenDetails(a)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-50 py-2.5 text-xs font-black text-neutral-600 transition-all hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      <Info className="h-4 w-4" />
                      Visualizar Detalhes
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredMinhas.length === 0 && (
            <div className="col-span-full py-12 text-center text-neutral-400 font-medium">
              Nenhuma assinatura encontrada nesta aba.
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Detalhes da Assinatura"
        size="wide"
      >
        {selectedAssinatura && (() => {
          const orcamento = Array.isArray(selectedAssinatura.orcamentos)
            ? selectedAssinatura.orcamentos[0]
            : selectedAssinatura.orcamentos;
          
          const statusColors: Record<string, string> = {
            'em_analise': 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/50',
            'em_cancelamento': 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/50',
            'concluido': 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50',
            'cancelado': 'bg-red-50 text-red-600 ring-1 ring-red-200/50',
          };

          const statusLabels: Record<string, string> = {
            'em_analise': 'Em Processamento',
            'em_cancelamento': 'Em Cancelamento',
            'concluido': 'Ativa',
            'cancelado': 'Cancelada',
          };

          const displayLabel = statusLabels[selectedAssinatura.status] || selectedAssinatura.status;
          const badgeClass = statusColors[selectedAssinatura.status] || 'bg-neutral-50 text-neutral-600 ring-1 ring-neutral-200';
          const isPulsing = ['em_analise', 'em_cancelamento'].includes(selectedAssinatura.status);

          return (
            <div className="space-y-6">
              {/* Alert Banners */}
              {selectedAssinatura.status === 'cancelado' && (
                <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200/50 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-left">
                    <h5 className="text-sm font-black text-red-900 uppercase">Assinatura Cancelada</h5>
                    <p className="text-xs text-red-700 mt-1 leading-relaxed">
                      Esta assinatura foi cancelada em {formatDate(selectedAssinatura.data_cancelamento)}. Caso tenha dúvidas ou precise de esclarecimentos adicionais sobre o encerramento do contrato, entre em contato através de nossa Central de Atendimento.
                    </p>
                  </div>
                </div>
              )}

              {selectedAssinatura.status === 'em_cancelamento' && (
                <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200/50 flex items-start gap-3">
                  <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-left">
                    <h5 className="text-sm font-black text-amber-900 uppercase">Cancelamento Agendado</h5>
                    <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                      A assinatura está programada para ser encerrada em {formatDate(selectedAssinatura.data_cancelamento)}. Cobranças futuras não pagas serão canceladas conforme a regra financeira do contrato.
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
                      {orcamento?.codigo_orcamento || `#OC${selectedAssinatura.codigo_ordem}`}
                    </span>
                    <h3 className="text-xl font-black text-neutral-900 tracking-tight leading-tight mt-1">
                      {selectedAssinatura.nome_assinatura_contratada ?? selectedAssinatura.assinaturas?.nome}
                    </h3>
                  </div>
                </div>
                <div className="text-left sm:text-right">
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
                          {formatCurrency(selectedAssinatura.valor_mensal_contratado ?? selectedAssinatura.assinaturas?.valor ?? 0)}
                          <span className="text-xs text-neutral-400 font-bold"> /mês</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Vigência Ativa</span>
                        <span className="text-base font-black text-neutral-800 mt-1.5 block">
                          {selectedAssinatura.prazo_meses || 1} { (selectedAssinatura.prazo_meses || 1) === 1 ? 'mês' : 'meses' }
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Data de Início</span>
                        <span className="text-sm font-bold text-neutral-700 mt-1 block">
                          {formatDate(selectedAssinatura.data_inicio || selectedAssinatura.data_criacao)}
                        </span>
                      </div>
                      {selectedAssinatura.data_vencimento && (
                        <div>
                          <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Vencimento</span>
                          <span className="text-sm font-bold text-neutral-700 mt-1 block">
                            {formatDate(selectedAssinatura.data_vencimento)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações de Gestão */}
                  <div className="pt-2">
                    {(selectedAssinatura.status === 'concluido' || selectedAssinatura.status === 'em_cancelamento') && (
                      <div className="space-y-3">
                        <button
                          onClick={() => setIsProrrogarModalOpen(true)}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white py-3 text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-emerald-600/10 hover:shadow-lg hover:shadow-emerald-600/20"
                        >
                          <Calendar className="h-4 w-4" /> Prorrogar Assinatura
                        </button>
                        {selectedAssinatura.status === 'concluido' && (
                          <button
                            onClick={() => setIsCancelarModalOpen(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 py-3 text-xs font-black uppercase tracking-widest transition-all ring-1 ring-red-100"
                          >
                            <XCircle className="h-4 w-4" /> Solicitar Cancelamento
                          </button>
                        )}
                      </div>
                    )}

                    {selectedAssinatura.status === 'cancelado' && (
                      <button
                        onClick={() => handleAssinarNovamente(selectedAssinatura)}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-indigo-600/10 hover:shadow-lg hover:shadow-indigo-600/20"
                      >
                        <ShieldCheck className="h-4 w-4" /> Renovar / Assinar Novamente
                      </button>
                    )}
                  </div>
                </div>

                {/* Coluna da Esquerda: Faturamento */}
                <div className="rounded-[2rem] bg-neutral-50 p-6 ring-1 ring-neutral-200/60 flex flex-col justify-between text-left">
                  <div>
                    <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-1.5">
                      <Receipt className="h-4 w-4 text-indigo-500" /> Histórico de Cobrança
                    </h4>
                    
                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                      {selectedAssinatura.faturas && selectedAssinatura.faturas.length > 0 ? (
                        selectedAssinatura.faturas.map((f: any, idx: number) => (
                          <div key={f.id || idx} className="bg-white border border-neutral-100 rounded-2xl p-3 flex justify-between items-center shadow-sm">
                            <div className="text-left">
                              <p className="text-[10px] font-mono font-bold text-neutral-400">#{f.codigo_fatura}</p>
                              <p className="text-xs font-bold text-neutral-800 mt-0.5">Vencimento: {formatDate(f.data_vencimento)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-neutral-900">{formatCurrency(f.valor_total)}</p>
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider mt-1 ${
                                getInvoiceStatusInfo(f.status).className
                              }`}>
                                {getInvoiceStatusInfo(f.status).label}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-xs text-neutral-400 font-semibold">
                          Nenhuma fatura vinculada.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        isOpen={isProrrogarModalOpen}
        onClose={() => setIsProrrogarModalOpen(false)}
        title="Prorrogar Assinatura"
        size="wide"
      >
        <div className="space-y-6">
          <p className="text-sm text-neutral-600">
            Quantos meses adicionais você deseja prorrogar esta assinatura?
          </p>
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-1">Meses</label>
            <input 
              type="number"
              min="1"
              value={mesesProrrogacao}
              inputMode="numeric"
onChange={(e) => setMesesProrrogacao(parseInt(e.target.value))}
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
        size="wide"
      >
        <div className="space-y-6">
          <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 flex gap-3">
            <Info className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Ao escolher uma data futura, sua assinatura permanecera ativa com o status <strong>"Em Cancelamento"</strong> ate o dia selecionado. Faturas pagas serao preservadas e somente cobrancas nao pagas posteriores ao encerramento serao canceladas.
            </p>
          </div>

          <div className="space-y-4">
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

            {dataCancelamento && (
              <div className="rounded-2xl bg-neutral-100 p-4 ring-1 ring-neutral-300 space-y-2">
                <p className="text-xs font-bold text-neutral-400 uppercase">Prévia do Cancelamento</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-600">Dias restantes:</span>
                  <span className="font-bold text-neutral-900">{calculateCancellationPreview().diasRestantes} dias</span>
                </div>
                <div className="pt-2 border-t border-neutral-200 text-xs leading-relaxed text-neutral-600">
                  Nao sera criado estorno automatico. Cobrancas vencidas ou com vencimento ate a data escolhida permanecerao para conferencia.
                </div>
              </div>
            )}
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
    </div>
  );
}
