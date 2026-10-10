import React, { useState, useEffect, useRef } from 'react';
import { Gift, Calendar, Clock, CheckCircle, AlertCircle, Info, Loader2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { Promocao, ClientePromocao } from '../../types';
import { ClientPromoDetalhesModal } from './ClientPromoDetalhesModal';
import { ClientCancelPromoModal } from './ClientCancelPromoModal';
import { formatDate } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { createNotification } from '../../lib/notifications';
import { useClientNotifications } from '../../hooks/useClientNotifications';
import { useAutoFitTabs } from '../../hooks/useAutoFitTabs';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';

export function ClientPromocoes({ 
  clientId,
  initialTab,
  initialItemId
}: { 
  clientId: string,
  initialTab?: string,
  initialItemId?: string
}) {
  const { containerRef: promocoesTabsRef, setButtonRef: setPromocoesTabButtonRef } = useAutoFitTabs(16, 10);
  const normalizeTab = (tab?: string): 'geral' | 'encerradas' => {
    return tab === 'encerradas' ? 'encerradas' : 'geral';
  };
  const [activeTab, setActiveTab] = useState<'geral' | 'encerradas'>(normalizeTab(initialTab));
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [minhasPromocoes, setMinhasPromocoes] = useState<ClientePromocao[]>([]);
  const [orcamentosComPromo, setOrcamentosComPromo] = useState<any[]>([]);
  const [cliente, setCliente] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<Promocao | null>(null);
  const [selectedPromoToCancel, setSelectedPromoToCancel] = useState<Promocao | null>(null);
  const [selectedAtivacao, setSelectedAtivacao] = useState<ClientePromocao | undefined>(undefined);
  const [selectedOrcamentoEmUso, setSelectedOrcamentoEmUso] = useState<any>(undefined);

  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialTab) setActiveTab(normalizeTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    if (initialItemId && promocoes.length > 0 && hasAutoOpened.current !== initialItemId) {
      // Find the promo to determine its current status for auto-tabbing
      const promo = promocoes.find(p => p.id === initialItemId);
      if (promo) {
        hasAutoOpened.current = initialItemId;
        const ativacao = minhasPromocoes.find(mp => mp.promocao_id === promo.id);
        const now = new Date();
        const isWithinDisclosure = now >= new Date(promo.data_inicio_divulgacao) && now <= new Date(promo.data_fim_divulgacao);
        
        let targetTab: 'geral' | 'encerradas' = 'encerradas';
        
        if (ativacao) {
          if (ativacao.status === 'cancelado') targetTab = 'encerradas';
          else if (ativacao.data_expiracao && new Date(ativacao.data_expiracao) < now) targetTab = 'encerradas';
          else targetTab = 'geral';
        } else if (isWithinDisclosure && promo.status !== 'suspensa') {
          targetTab = 'geral';
        }

        setActiveTab(targetTab);

        // Scroll and highlight
        setTimeout(() => {
          const element = document.getElementById(`promo-${initialItemId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId(promo.id);
            setTimeout(() => setHighlightedItemId(null), 3000);
          }
        }, 400); // 400ms to allow tab switch rendering
      }
    }
  }, [initialItemId, promocoes.length, minhasPromocoes.length]);

  useEffect(() => {
    fetchData();

    const channelPromos = supabase
      .channel('client-promocoes-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'promocoes'
      }, () => {
        fetchData();
      })
      .subscribe();

    const channelMinhasPromos = supabase
      .channel('client-minhas-promocoes-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cliente_promocoes',
        filter: `cliente_id=eq.${clientId}`
      }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelPromos);
      supabase.removeChannel(channelMinhasPromos);
    };
  }, [clientId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: promoData } = await supabase
        .from('promocoes')
        .select('*');
      
      const { data: minhasData } = await supabase
        .from('cliente_promocoes')
        .select('*, orcamentos(codigo_orcamento, total, desconto, titulo_solicitacao)')
        .eq('cliente_id', clientId);

      const { data: clienteData } = await supabase
        .from('clientes')
        .select('nome')
        .eq('id', clientId)
        .single();

      const { data: orcamentosData } = await supabase
        .from('orcamentos')
        .select('id, codigo_orcamento, total, desconto, promocao_id, data_criacao, status')
        .eq('cliente_id', clientId)
        .neq('status', 'cancelado')
        .not('promocao_id', 'is', null);

      setPromocoes(promoData || []);
      setMinhasPromocoes(minhasData || []);
      setOrcamentosComPromo(orcamentosData || []);
      setCliente(clienteData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const { pendencies } = useClientNotifications();

  const openDetails = (promo: Promocao) => {
    setSelectedPromo(promo);
    setSelectedAtivacao(minhasPromocoes.find(mp => mp.promocao_id === promo.id));
    setSelectedOrcamentoEmUso(orcamentosComPromo.find(o => o.promocao_id === promo.id) || undefined);
    setIsDetailsModalOpen(true);
  };

  const handleAtivar = async (promo: Promocao) => {
    setActivatingId(promo.id);
    try {
      const dataAtivacao = new Date();
      const dataExpiracao = new Date();
      const meses = Number(promo.prazo_validade_meses) || 1; // Default to 1 month if invalid/0
      dataExpiracao.setMonth(dataExpiracao.getMonth() + meses);

      await clientOperationalWrite(clientId, 'cliente_promocoes', 'insert', {
        promocao_id: promo.id,
        data_ativacao: dataAtivacao.toISOString(),
        data_expiracao: dataExpiracao.toISOString(),
        status: 'ativa'
      });

      // Notificar Admin
      await createNotification(
        null,
        'Promoção Ativada',
        `O cliente ${cliente?.nome || 'Um cliente'} ativou a promoção: ${promo.titulo}`,
        'promocoes',
        'ativas',
        promo.id
      );

      toast.success('Promoção ativada com sucesso!');
      fetchData();
    } catch (error: any) {
      toast.error('Erro ao ativar promoção: ' + error.message);
    } finally {
      setActivatingId(null);
    }
  };

  const handleCancelar = async (motivo: string) => {
    if (!selectedPromoToCancel) return;
    try {
      const ativacao = minhasPromocoes.find(mp => mp.promocao_id === selectedPromoToCancel.id);
      if (!ativacao) throw new Error('Ativação não encontrada');

      await clientOperationalWrite(clientId, 'cliente_promocoes', 'update', { 
        status: 'cancelado',
        motivo_cancelamento: motivo,
        data_cancelamento: new Date().toISOString()
      }, { id: ativacao.id });

      // Notificar Admin
      await createNotification(
        null,
        'Promoção Cancelada pelo Cliente',
        `O cliente ${cliente?.nome || 'Um cliente'} cancelou a promoção: ${selectedPromoToCancel.titulo}`,
        'promocoes',
        'cancelados',
        selectedPromoToCancel.id
      );

      toast.success('Promoção cancelada com sucesso!');
      setIsCancelModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error('Erro ao cancelar promoção: ' + error.message);
    }
  };

  const now = new Date();

  const filteredPromocoes = promocoes.map(promo => {
    const ativacao = minhasPromocoes.find(mp => mp.promocao_id === promo.id);
    const isWithinDisclosure = now >= new Date(promo.data_inicio_divulgacao) && now <= new Date(promo.data_fim_divulgacao);
    
    // Check validity safely
    let isExpiredValidity = false;
    if (ativacao && ativacao.data_expiracao) {
      const expDate = new Date(ativacao.data_expiracao);
      if (!isNaN(expDate.getTime())) {
        isExpiredValidity = now > expDate;
      }
    }
    
    const isExpiredDisclosure = now > new Date(promo.data_fim_divulgacao);

    const orcamentoEmUso = orcamentosComPromo.find(o => o.promocao_id === promo.id);

    let status: 'disponivel' | 'ativa' | 'encerrada' | 'suspensa' | 'cancelado' | 'usada' = 'encerrada';

    if (promo.status === 'suspensa') {
      status = 'suspensa';
    } else if (orcamentoEmUso) {
      status = 'usada';
    } else if (ativacao) {
      if (ativacao.status === 'cancelado') {
        status = 'cancelado';
      } else if (ativacao.status === 'usada') {
        status = 'usada';
      } else if (isExpiredValidity) {
        status = 'encerrada';
      } else {
        status = 'ativa';
      }
    } else if (isExpiredDisclosure) {
      status = 'encerrada';
    } else {
      status = 'disponivel';
    }

    return { ...promo, ativacao, status, orcamentoEmUso };
  }).filter(p => {
    if (!p) return false;
    if (activeTab === 'geral') {
      return p.status === 'disponivel' || p.status === 'ativa';
    } else {
      return p.status === 'encerrada' || p.status === 'cancelado' || p.status === 'suspensa' || p.status === 'usada';
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-full min-w-0 sm:w-auto overflow-hidden">
        <div ref={promocoesTabsRef} className="flex w-full gap-1 rounded-3xl bg-neutral-200/50 p-1 ring-1 ring-neutral-300 shadow-inner">
          {(['geral', 'encerradas'] as const).map((t, index) => (
            <button 
              key={t}
              ref={setPromocoesTabButtonRef(index)}
              onClick={() => setActiveTab(t)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-2xl px-1.5 py-2.5 font-black capitalize leading-none transition-all sm:gap-2 sm:px-6 ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
            >
              {t === 'geral' ? 'Disponíveis' : 'Histórico'}
              {t === 'geral' && pendencies.modulePromocoes > 0 && (
                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white animate-pulse">
                  {pendencies.modulePromocoes}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {filteredPromocoes.length === 0 ? (
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }}
               className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border border-dashed border-neutral-200"
            >
               <Gift className="h-16 w-16 text-neutral-200 mx-auto mb-4" />
               <p className="text-sm font-black text-neutral-400 uppercase tracking-widest">
                 {activeTab === 'geral' ? 'Nenhuma promoção disponível' : 'Nenhuma promoção no histórico'}
               </p>
            </motion.div>
          ) : (
            filteredPromocoes.map((p) => (
              <motion.div 
                id={`promo-${p!.id}`}
                key={p!.id} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4 }}
                whileHover={highlightedItemId === p!.id ? {} : { y: -5 }}
                className={`group relative overflow-hidden rounded-[2rem] p-[2px] transition-all duration-500 flex flex-col 
                  ${highlightedItemId === p!.id ? 'bg-indigo-500 scale-[1.03] z-20 shadow-2xl shadow-indigo-500/40 ring-4 ring-indigo-500/20' : 
                    p!.status === 'ativa' ? 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 shadow-emerald-500/20' : 
                    p!.status === 'disponivel' ? 'bg-gradient-to-br from-indigo-500 via-purple-500 to-violet-600 shadow-indigo-500/20' : 
                p!.status === 'suspensa' ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/10' :
                    'bg-gradient-to-br from-neutral-200 to-neutral-300'
                  }`}
              >
                {/* Red Dot Indicator (Fixed Position) */}
                {highlightedItemId === p!.id && (
                  <div className="absolute top-4 right-4 z-[30] flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 shadow-lg ring-2 ring-white"></span>
                  </div>
                )}

                <div className="flex flex-1 flex-col rounded-[1.9rem] bg-white p-6 relative z-10 transition-colors duration-500">
                  {/* Status Badges */}
                  {p!.status === 'ativa' && (
                    <div className="absolute top-5 right-5 bg-emerald-50 text-emerald-600 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5 ring-1 ring-emerald-500/20 shadow-sm">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div> Ativada
                    </div>
                  )}
                  {p!.status === 'usada' && (
                    <div className="absolute top-5 right-5 bg-sky-50 text-sky-600 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5 ring-1 ring-sky-500/20 shadow-sm">
                      <CheckCircle className="w-3 h-3" /> Utilizada
                    </div>
                  )}
                  {p!.status === 'suspensa' && (
                    <div className="absolute top-5 right-5 bg-amber-50 text-amber-600 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5 ring-1 ring-amber-500/20 shadow-sm">
                      <AlertCircle className="w-3 h-3" /> Suspensa
                    </div>
                  )}
                  {p!.status === 'cancelado' && (
                    <div className="absolute top-5 right-5 bg-rose-50 text-rose-600 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5 ring-1 ring-rose-500/20 shadow-sm">
                      <XCircle className="w-3 h-3" /> Cancelada
                    </div>
                  )}
                  {p!.status === 'encerrada' && (
                    <div className="absolute top-5 right-5 bg-neutral-50 text-neutral-500 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5 ring-1 ring-neutral-200">
                      <Clock className="w-3 h-3" /> Encerrada
                    </div>
                  )}
                  
                  {/* Icon Header */}
                  <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl shadow-inner transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6
                    ${p!.status === 'disponivel' ? 'bg-indigo-50 text-indigo-600' :
                      p!.status === 'ativa' ? 'bg-emerald-50 text-emerald-600' : 
                      p!.status === 'usada' ? 'bg-sky-50 text-sky-600' : 
                      p!.status === 'suspensa' ? 'bg-amber-50 text-amber-600' : 'bg-neutral-50 text-neutral-400'}
                  `}>
                    <Gift className="h-7 w-7" />
                  </div>

                  {/* Content Body */}
                  <div className="mb-6 flex-1">
                    <span className={`inline-block px-3 py-1 mb-3 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm ${
                      p!.status === 'disponivel' ? 'bg-indigo-900 text-indigo-100' :
                      p!.status === 'ativa' ? 'bg-emerald-900 text-emerald-100' : 
                      p!.status === 'usada' ? 'bg-sky-900 text-sky-100' : 
                      p!.status === 'suspensa' ? 'bg-amber-900 text-amber-100' : 'bg-neutral-800 text-neutral-100'
                    }`}>
                      {p!.tipo}
                    </span>
                    <h3 className={`text-xl font-black tracking-tight leading-tight mb-3 transition-colors duration-300
                      ${p!.status === 'disponivel' ? 'group-hover:text-indigo-600 text-neutral-900' :
                        p!.status === 'ativa' ? 'text-emerald-950 group-hover:text-emerald-700' : 
                        p!.status === 'usada' ? 'text-sky-950 group-hover:text-sky-700' : 'text-neutral-900'}`}
                    >
                      {p!.titulo}
                    </h3>
                    <p className="text-sm font-medium text-neutral-500 line-clamp-3 leading-relaxed">
                      {p!.descricao}
                    </p>
                  </div>

                  {/* Actions Area */}
                  <div className="mt-auto space-y-4">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => openDetails(p!)}
                        className="flex-1 rounded-xl bg-neutral-100 py-3 text-xs font-black uppercase tracking-widest text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 transition-all active:scale-95"
                      >
                        Detalhes
                      </button>
                      
                      {p!.status === 'ativa' && (
                        <>
                          <button 
                            onClick={() => {
                              setSelectedPromoToCancel(p!);
                              setIsCancelModalOpen(true);
                            }}
                            className="flex-1 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all active:scale-95 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-widest"
                          >
                            <XCircle className="w-4 h-4" />
                            Cancelar Ativação
                          </button>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {p!.status === 'disponivel' && (
                        <button 
                          onClick={() => handleAtivar(p!)}
                          disabled={activatingId === p!.id}
                          className="flex-[2] relative overflow-hidden rounded-xl bg-indigo-600 py-3 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 group/btn"
                        >
                          <span className="relative z-10 flex items-center justify-center gap-2">
                            {activatingId === p!.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/> }
                            Ativar
                          </span>
                          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover/btn:translate-x-[150%] transition-transform duration-1000 ease-in-out" />
                        </button>
                      )}
                      
                      {p!.status === 'suspensa' && (
                        <button 
                          disabled
                          className="flex-1 rounded-xl bg-neutral-100 py-3 text-xs font-black uppercase tracking-widest text-neutral-400 cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          Indisponível
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
      <ClientPromoDetalhesModal 
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        promo={selectedPromo}
        ativacao={selectedAtivacao}
        orcamentoEmUso={selectedOrcamentoEmUso}
      />
      <ClientCancelPromoModal 
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={handleCancelar}
        promoTitle={selectedPromoToCancel?.titulo || ''}
      />
    </div>
  );
}
