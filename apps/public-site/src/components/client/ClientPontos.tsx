import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Cliente, PontoMovimentacao } from '../../types';
import { formatCurrency, formatDate, formatDateTime, formatLancamentoDescricao, generateUUID } from '../../lib/utils';
import { Star, ArrowDownRight, ArrowUpRight, History, CheckCircle, CreditCard } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '../ui/Modal';
import confetti from 'canvas-confetti';
import { useAutoFitTabs } from '../../hooks/useAutoFitTabs';
import { callClientRpc } from '../../lib/clientRpc';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

interface ClientPontosProps {
  clienteId: string;
  animateOnMount?: boolean;
  initialCliente?: Cliente | null;
  initialTab?: string;
  initialItemId?: string;
}

export function ClientPontos({ 
  clienteId, 
  animateOnMount = false, 
  initialCliente,
  initialTab,
  initialItemId
}: ClientPontosProps) {
  const { containerRef: pontosTabsRef, setButtonRef: setPontosTabButtonRef } = useAutoFitTabs(16, 10);
  const [cliente, setCliente] = useState<Cliente | null>(initialCliente || null);
  const [movimentacoes, setMovimentacoes] = useState<PontoMovimentacao[]>([]);
  const [levelHistory, setLevelHistory] = useState<any[]>([]);
  const [taxaConversao, setTaxaConversao] = useState<number>(0.01);
  const [activeTab, setActiveTab] = useState<'extrato' | 'resgates'>(
    (initialTab as any) || 'extrato'
  );
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [displayPoints, setDisplayPoints] = useState(0);

  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const hasAutoOpened = useRef<string | null>(null);
  const pointsConversionRequestId = useRef<string>(generateUUID());

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab as any);
  }, [initialTab]);

  useEffect(() => {
    if (initialItemId && movimentacoes.length > 0 && hasAutoOpened.current !== initialItemId) {
      const item = movimentacoes.find(m => m.id === initialItemId);
      if (item) {
        hasAutoOpened.current = initialItemId;
        // Auto-tab switcher based on item type if possible
        if (item.tipo === 'conversao_dinheiro') setActiveTab('resgates');
        else setActiveTab('extrato');

        // Scroll and highlight
        setTimeout(() => {
          const element = document.getElementById(`point-${initialItemId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId(item.id);
            setTimeout(() => setHighlightedItemId(null), 3000);
          }
        }, 300);
      }
    }
  }, [initialItemId, movimentacoes.length]);
  
  // Transfer Details State
  const [isTransferenciaModalOpen, setIsTransferenciaModalOpen] = useState(false);
  const [selectedTransferencia, setSelectedTransferencia] = useState<any>(null);
  const [isEstornoModalOpen, setIsEstornoModalOpen] = useState(false);
  const [isEstornando, setIsEstornando] = useState(false);

  const animationStarted = useRef(false);

  useEffect(() => {
    if (initialCliente) {
      setCliente(initialCliente);
    }
    fetchData();
  }, [clienteId, initialCliente, monthFilter]);

  useRealtimeSubscription(
    [
      {
        table: 'clientes',
        filter: clienteId ? `id=eq.${clienteId}` : undefined,
        debounceMs: 150,
        onChange: fetchData,
      },
      {
        table: 'pontos_movimentacoes',
        filter: clienteId ? `cliente_id=eq.${clienteId}` : undefined,
        debounceMs: 150,
        onChange: fetchData,
      },
    ],
    [clienteId, monthFilter]
  );

  useEffect(() => {
    if (!cliente) return;

    // If we should animate and haven't started yet
    if (animateOnMount && !animationStarted.current) {
      animationStarted.current = true;
      
      const targetPoints = cliente.saldo_pontos || 0;
      const duration = 2000; // 2 seconds for fast explosion
      const startTime = performance.now();
      let animationFrameId: number;
      
      // Trigger confetti explosion
      // Removed confetti as requested

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out cubic
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(easeOutCubic * targetPoints);
        
        setDisplayPoints(current);

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(animate);
        } else {
          setDisplayPoints(targetPoints);
        }
      };
      
      // Start with 0
      setDisplayPoints(0);
      animationFrameId = requestAnimationFrame(animate);

      return () => {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
      };
    } 
    // If not animating, ensure we show the correct balance immediately
    else if (!animateOnMount && !animationStarted.current) {
      setDisplayPoints(cliente.saldo_pontos || 0);
    }
  }, [cliente, animateOnMount]);

  async function fetchData() {
    try {
      // Fetch Cliente
      const { data: clientData, error: clientError } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', clienteId)
        .single();
      
      if (clientError) {
        console.error('Error fetching client:', clientError);
        return;
      }
      
      if (clientData) setCliente(clientData);

      // Fetch Taxa Conversao
      const { data: empresaData } = await supabase
        .from('empresa')
        .select('taxa_conversao_pontos')
        .limit(1)
        .maybeSingle();
        
      if (empresaData?.taxa_conversao_pontos) {
        setTaxaConversao(empresaData.taxa_conversao_pontos);
      }

      // Fetch Movimentacoes
      const { data: dataOld, error: errorOld } = await supabase
        .from('pontos_movimentacoes')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('data_movimentacao', { ascending: false });

      const { data: dataNew, error: errorNew } = await supabase
        .from('points_transactions')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });

      // 1. Processar dados da tabela antiga (preferencial pois tem saldo_apos)
      const formattedOld = (dataOld || []).map(item => ({
        id: item.id,
        data_movimentacao: item.data_movimentacao,
        descricao: item.descricao,
        pontos: item.pontos,
        tipo: item.tipo,
        valor_convertido: item.valor_convertido,
        saldo_apos: item.saldo_apos
      }));

      // 2. Processar dados da tabela nova, evitando duplicatas
      const formattedNew: any[] = [];
      (dataNew || []).forEach(newItem => {
        // Verificar se já existe um registro correspondente na tabela antiga (mesmo valor, descrição e tempo próximo)
        const isDuplicate = formattedOld.some(oldItem => 
          oldItem.pontos === newItem.pontos && 
          oldItem.descricao === newItem.descricao &&
          Math.abs(new Date(oldItem.data_movimentacao).getTime() - new Date(newItem.created_at).getTime()) < 5000
        );

        if (!isDuplicate) {
          formattedNew.push({
            id: newItem.id,
            data_movimentacao: newItem.created_at,
            descricao: newItem.descricao,
            pontos: newItem.pontos,
            tipo: newItem.tipo,
            valor_convertido: newItem.valor_convertido,
            saldo_apos: newItem.saldo_apos // Será undefined, mas ok se for novo dado
          });
        }
      });

      const combined = [...formattedOld, ...formattedNew].sort((a, b) => 
        new Date(b.data_movimentacao).getTime() - new Date(a.data_movimentacao).getTime()
      );


      let filteredData = combined;
      if (monthFilter) {
        filteredData = filteredData.filter(item => item.data_movimentacao.startsWith(monthFilter));
      }
      setMovimentacoes(filteredData);

      // Fetch Level History
      const { data: historyData, error: historyError } = await supabase
        .from('level_history')
        .select(`
          *,
          nivel_anterior:client_levels!nivel_anterior_id(nome_nivel, cor),
          nivel_novo:client_levels!nivel_novo_id(nome_nivel, cor)
        `)
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });

      if (historyError) {
        console.error('Error fetching level history:', historyError);
      } else if (historyData) {
        setLevelHistory(historyData);
      }
    } catch (err) {
      console.error('Unexpected error in fetchData:', err);
    }
  };

  const fetchTransferDetails = async (item: any) => {
    const isSaida = item.pontos < 0;
    const { data } = await supabase
      .from('transferencias')
      .select('*, cliente_origem:clientes!cliente_origem_id(nome, cpf, data_cadastro, saldo_carteira, saldo_pontos), cliente_destino:clientes!cliente_destino_id(nome, cpf, data_cadastro, saldo_carteira, saldo_pontos)')
      .eq(isSaida ? 'cliente_origem_id' : 'cliente_destino_id', clienteId)
      .eq('valor', Math.abs(item.pontos))
      .order('data_solicitacao', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setSelectedTransferencia(data);
      setIsTransferenciaModalOpen(true);
    } else {
      toast.error('Detalhes da transferência não encontrados.');
    }
  };

  const handleEstornar = async () => {
    if (!selectedTransferencia) return;
    setIsEstornando(true);

    try {
      await callClientRpc('gsa_client_reverse_transfer', {
        p_transferencia_id: selectedTransferencia.id,
      });
      toast.success('Transferência estornada com sucesso!');

      setIsEstornoModalOpen(false);
      setIsTransferenciaModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao estornar transferência.');
    } finally {
      setIsEstornando(false);
    }
  };

  const handleWithdraw = async () => {
    if (cliente?.pontos_bloqueados) {
      toast.error('Sua carteira de pontos está bloqueada.');
      return;
    }
    if (!cliente || (cliente.saldo_pontos || 0) <= 0) {
      toast.error('Você não possui pontos para resgatar.');
      return;
    }

    const pontosDebitar = cliente.saldo_pontos || 0;
    const valorEstimadoAtual = Math.round(pontosDebitar * taxaConversao * 100) / 100;
    if (valorEstimadoAtual < 0.01) {
      const minPontos = taxaConversao > 0 ? Math.ceil(0.01 / taxaConversao) : 1000;
      toast.error(`Saldo insuficiente para resgate. Você precisa de pelo menos ${minPontos} pontos para converter em valor.`);
      return;
    }

    setIsWithdrawing(true);
    try {
      const data = await callClientRpc<any>('gsa_client_convert_points', {
        p_request_id: pointsConversionRequestId.current,
        p_pontos: pontosDebitar,
      });

      if (!data?.success) throw new Error('Não foi possível converter os pontos.');
      pointsConversionRequestId.current = generateUUID();

      fetchData();
      setShowSuccessModal(true);
    } catch (error: any) {
      console.error('Error withdrawing points:', error);
      toast.error(error.message || 'Erro ao realizar o resgate dos pontos.');
    } finally {
      setIsWithdrawing(false);
    }
  };


  if (!cliente) return <div>Carregando...</div>;

  const valorEstimado = (cliente.saldo_pontos || 0) * taxaConversao;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Meus Pontos</h2>
      </div>

      {/* Main Card */}
      <div className={`rounded-3xl p-5 md:p-8 text-white shadow-xl ${cliente.pontos_bloqueados ? 'bg-red-600' : 'bg-gradient-to-br from-indigo-600 to-violet-700'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 md:gap-6">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="flex h-12 w-12 md:h-16 md:w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <Star className="h-6 w-6 md:h-8 md:w-8 text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] md:text-sm font-medium text-indigo-100 uppercase tracking-wider">Pontos Disponíveis {cliente.pontos_bloqueados && '(BLOQUEADO)'}</p>
              <motion.h3 
                key={displayPoints}
                initial={animateOnMount && displayPoints < (cliente.saldo_pontos || 0) ? { scale: 1.2, color: '#fbbf24' } : { scale: 1, color: '#ffffff' }}
                animate={{ scale: 1, color: '#ffffff' }}
                transition={{ duration: 0.2 }}
                className="text-3xl md:text-4xl font-black mt-0.5 md:mt-1"
              >
                {displayPoints.toLocaleString('pt-BR')}
              </motion.h3>
              <p className="mt-1 md:mt-2 text-[10px] md:text-sm text-indigo-200 leading-tight">
                Equivalente em reais:<br className="md:hidden" /> <span className="font-bold text-white">{formatCurrency(displayPoints * taxaConversao)}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            {cliente.pontos_bloqueados && (
              <p className="text-[10px] md:text-xs text-white/90 font-medium sm:max-w-[200px] sm:text-right text-center">
                Saldo bloqueado. Abra um chamado no suporte.
              </p>
            )}
            <button
              onClick={handleWithdraw}
              disabled={(cliente.saldo_pontos || 0) <= 0 || isWithdrawing || cliente.pontos_bloqueados || (animateOnMount && displayPoints < (cliente.saldo_pontos || 0))}
              className={`w-full rounded-xl px-5 py-3 md:px-8 md:py-4 text-xs md:text-sm font-bold transition-all ${cliente.pontos_bloqueados ? 'bg-white/20 text-white cursor-not-allowed' : 'bg-white text-indigo-600 hover:bg-indigo-50 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed'}`}
            >
              {isWithdrawing ? 'Processando...' : 'Resgatar'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="w-full min-w-0 sm:w-auto overflow-hidden">
        <div ref={pontosTabsRef} className="flex w-full gap-1 rounded-3xl bg-neutral-200/50 p-1 ring-1 ring-neutral-300 shadow-inner">
          {['extrato', 'resgates'].map((t, index) => (
            <button 
              key={t}
              ref={setPontosTabButtonRef(index)}
              onClick={() => setActiveTab(t as any)}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-2xl px-1.5 py-2.5 font-black capitalize leading-none transition-all sm:px-6 ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-300">
        {activeTab === 'extrato' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-neutral-400 uppercase mb-1 block">Filtrar por Mês</label>
                <div className="flex gap-2">
                  <input 
                    type="month" 
                    value={monthFilter}
                    onChange={e => setMonthFilter(e.target.value)}
                    className="flex-1 rounded-xl border border-neutral-300 bg-neutral-100/50 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  {monthFilter && (
                    <button 
                      onClick={() => setMonthFilter('')}
                      className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-50"
                    >
                      Todos
                    </button>
                  )}
                </div>
              </div>
            </div>
            {movimentacoes.length === 0 ? (
              <p className="text-center text-neutral-500 py-8">Nenhuma movimentação encontrada.</p>
            ) : (
              movimentacoes.map((mov) => {
                const info = formatLancamentoDescricao(mov.descricao);
                return (
                  <div id={`point-${mov.id}`} key={mov.id} className={`flex items-center justify-between border-b border-neutral-100 pb-4 last:border-0 last:pb-0 px-2 transition-all duration-500 rounded-xl ${highlightedItemId === mov.id ? 'bg-indigo-50 ring-2 ring-indigo-500 shadow-lg scale-[1.01] z-10' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${mov.pontos > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                        {mov.pontos > 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-neutral-900 text-sm sm:text-base">{info.titulo}</p>
                          {info.autor && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-600">
                              {info.autor}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-400 mt-0.5">{formatDateTime(mov.data_movimentacao)} {mov.fatura_id ? `• Ref: Fatura` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={`font-black text-sm sm:text-base ${mov.pontos > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {mov.pontos > 0 ? '+' : ''}{mov.pontos.toLocaleString('pt-BR')} pts
                        </p>
                        <p className="text-xs text-neutral-400">Saldo: {Number(mov.saldo_apos || 0).toLocaleString('pt-BR')}</p>
                      </div>
                      {mov.descricao?.includes('Transferência') && (
                        <button
                          onClick={() => fetchTransferDetails(mov)}
                          className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-600 hover:bg-neutral-200"
                        >
                          Detalhes
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'resgates' && (
          <div className="space-y-4">
            {movimentacoes.filter(m => m.tipo === 'conversao_dinheiro').length === 0 ? (
              <p className="text-center text-neutral-500 py-8">Nenhum resgate realizado.</p>
            ) : (
              movimentacoes.filter(m => m.tipo === 'conversao_dinheiro').map((mov) => (
                <div id={`point-${mov.id}`} key={mov.id} className={`flex items-center justify-between border-b border-neutral-100 pb-4 last:border-0 last:pb-0 px-2 transition-all duration-500 rounded-xl ${highlightedItemId === mov.id ? 'bg-indigo-50 ring-2 ring-indigo-500 shadow-lg scale-[1.01] z-10' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-neutral-900">Conversão para Carteira</p>
                      <p className="text-xs text-neutral-500">{formatDateTime(mov.data_movimentacao)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-600">
                      {formatCurrency(mov.valor_convertido || 0)}
                    </p>
                    <p className="text-xs text-neutral-500">{Math.abs(mov.pontos)} pts utilizados</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Success Modal */}
      <Modal isOpen={showSuccessModal} onClose={() => setShowSuccessModal(false)} title="Sucesso">
        <div className="text-center py-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <h3 className="mb-2 text-2xl font-bold text-neutral-900">Saque Realizado!</h3>
          <p className="mb-8 text-sm text-neutral-600">
            Parabéns, seus pontos foram convertidos em dinheiro e poderão ser sacados em sua carteira digital ou aplicados como desconto em sua fatura.
          </p>
          <button
            onClick={() => {
              setShowSuccessModal(false);
              // The parent component handles navigation, we can dispatch an event or use a prop.
              // For now, we'll reload or dispatch a custom event to change the tab.
              window.dispatchEvent(new CustomEvent('navigate-to-financeiro'));
            }}
            className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white transition-colors hover:bg-indigo-700 active:scale-95 transition-all"
          >
            Entendi
          </button>
        </div>
      </Modal>

      <Modal 
        isOpen={isTransferenciaModalOpen} 
        onClose={() => setIsTransferenciaModalOpen(false)} 
        title="Detalhes da Movimentação"
        size="md"
      >
        {selectedTransferencia && (
          <div className="space-y-6 py-2">
            {/* Header Info */}
            <div className="flex items-center gap-4 p-5 rounded-3xl bg-neutral-50 border border-neutral-100 ring-1 ring-neutral-200/50">
              <div className={`h-14 w-14 rounded-2xl shadow-sm flex items-center justify-center border ${
                selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                selectedTransferencia.status === 'recusado' || selectedTransferencia.status === 'cancelado' ? 'bg-rose-50 border-rose-100 text-rose-600' :
                'bg-amber-50 border-amber-100 text-amber-600'
              }`}>
                <History className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Status da Transação</p>
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                    selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido' ? 'bg-emerald-100 text-emerald-700' :
                    selectedTransferencia.status === 'recusado' || selectedTransferencia.status === 'cancelado' ? 'bg-rose-100 text-rose-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido' ? 'Finalizada' :
                     selectedTransferencia.status === 'recusado' || selectedTransferencia.status === 'cancelado' ? 'Cancelada' : 'Em Análise'}
                  </span>
                </div>
                <p className="text-sm font-black text-neutral-900">
                  {selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido' ? 'Transferência Processada com Sucesso' :
                   selectedTransferencia.status === 'recusado' || selectedTransferencia.status === 'cancelado' ? 'Transferência Rejeitada ou Estornada' :
                   'Aguardando Aprovação do Sistema'}
                </p>
              </div>
            </div>

            {/* Envolvidos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-2">Origem</p>
                <p className="text-sm font-black text-neutral-900 truncate">{selectedTransferencia.cliente_origem?.nome}</p>
                <p className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">Remetente</p>
              </div>

              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">Destino</p>
                <p className="text-sm font-black text-neutral-900 truncate">{selectedTransferencia.cliente_destino?.nome}</p>
                <p className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">Destinatário</p>
              </div>
            </div>

            {/* Financeiro */}
            <div className="rounded-3xl bg-neutral-900 p-6 text-white shadow-2xl shadow-neutral-900/20">
              <div className="space-y-4">
                <div className="flex justify-between items-center text-neutral-400">
                  <span className="text-[10px] font-black uppercase tracking-widest">Tipo de Crédito</span>
                  <span className="text-sm font-bold uppercase tracking-widest">{selectedTransferencia.tipo || 'saldo'}</span>
                </div>
                
                <div className="pt-4 border-t border-white/10 flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Valor Creditado</p>
                    <p className="text-3xl font-black text-white leading-none">
                      {selectedTransferencia.tipo === 'pontos' 
                        ? `${selectedTransferencia.valor_liquido || selectedTransferencia.valor} pts` 
                        : formatCurrency(selectedTransferencia.valor_liquido || selectedTransferencia.valor)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-neutral-500 uppercase tracking-tighter mb-1">Solicitado em</p>
                    <p className="text-[11px] font-bold text-neutral-300">{formatDate(selectedTransferencia.data_solicitacao || selectedTransferencia.created_at)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="space-y-3 pt-2">
              {(selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido') && selectedTransferencia.cliente_destino_id === clienteId && (
                <button 
                  onClick={() => setIsEstornoModalOpen(true)} 
                  className="w-full rounded-2xl bg-rose-600 hover:bg-rose-700 py-4 text-white font-black uppercase tracking-widest text-[10px] shadow-xl shadow-rose-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <History className="h-4 w-4" />
                  ESTORNAR TRANSAÇÃO
                </button>
              )}
              
              <button 
                onClick={() => setIsTransferenciaModalOpen(false)} 
                className="w-full rounded-2xl border-2 border-neutral-100 py-4 text-neutral-400 font-black uppercase tracking-widest text-[10px] hover:bg-neutral-50 hover:text-neutral-600 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Fechar Detalhes
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isEstornoModalOpen} onClose={() => setIsEstornoModalOpen(false)} title="Confirmar Estorno" size="sm">
        <div className="space-y-6">
          <div className="rounded-xl bg-red-50 p-4 ring-1 ring-red-100">
            <p className="text-sm text-red-800">
              O valor será totalmente estornado para o remetente. Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setIsEstornoModalOpen(false)}
              className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-bold text-neutral-700 ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50"
              disabled={isEstornando}
            >
              Cancelar
            </button>
            <button
              onClick={handleEstornar}
              disabled={isEstornando}
              className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isEstornando ? 'Estornando...' : 'Confirmar Estorno'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
