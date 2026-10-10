import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Cliente } from '../../types';
import { formatCurrency, playPremiumBeep } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { useVipLevels } from '../../hooks/useVipLevels';
import { useClientNotifications } from '../../hooks/useClientNotifications';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { PaymentModal } from './financeiro/PaymentModal';
import { SaquesList, CarteiraInfo } from './financeiro/SaquesList';
import { ExtratoList } from './financeiro/ExtratoList';
import { FaturasList } from './financeiro/FaturasList';
import { NotasFiscaisList } from './financeiro/NotasFiscaisList';
import { toast } from 'react-hot-toast';
import { notificationService } from '../../lib/notificationService';
import { CreditCard, MessageSquare, CheckCircle, Landmark, ArrowLeftRight, FileText, ChevronLeft } from 'lucide-react';
import { ClientMeuCredito } from './ClientMeuCredito';
import { ClientTransferencias } from './ClientTransferencias';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';

type FinanceiroTab = '' | 'faturas' | 'nf' | 'extrato' | 'saques' | 'credito' | 'transferencias';

export function ClientFinanceiro({ 
  clientId, 
  initialTab, 
  initialItemId,
  animateOnMount = false,
  cliente: clienteProp,
  onNavigate
}: { 
  clientId: string, 
  initialTab?: string, 
  initialItemId?: string,
  animateOnMount?: boolean,
  cliente?: Cliente | null,
  onNavigate?: (module: string, tab?: string, itemId?: string) => void
}) {
  const { levels } = useVipLevels();
  const { pendencies } = useClientNotifications();
  const normalizeInitialTab = (tab?: string): FinanceiroTab => {
    if (tab === 'credito_loja' || tab === 'credito') return 'credito';
    if (tab === 'transferencias') return 'transferencias';
    if (tab === 'nf' || tab === 'notas-fiscais' || tab === 'extrato' || tab === 'saques' || tab === 'faturas') {
      return tab === 'notas-fiscais' ? 'nf' : (tab as FinanceiroTab);
    }
    return '';
  };

  const [activeTab, setActiveTab] = useState<FinanceiroTab>(normalizeInitialTab(initialTab));
  const [isSubmoduleOpen, setIsSubmoduleOpen] = useState(Boolean(initialTab || initialItemId));
  const [saldo, setSaldo] = useState(clienteProp?.saldo_carteira || 0);
  const [cliente, setCliente] = useState<Cliente | null>(clienteProp || null);
  const currentPoints = cliente?.pontos_totais || 0;
  const autoLevel = levels.find(l => currentPoints >= l.minPoints && (l.maxPoints === null || currentPoints <= l.maxPoints)) || levels[0];
  const manualLevelData = cliente?.manual_level as any;
  const manualLevel = manualLevelData ? levels.find(l => 
    l.name.toLowerCase() === manualLevelData.nome_nivel?.toLowerCase()
  ) || levels[0] : null;
  const currentLevel = manualLevel || autoLevel;
  const levelData = Array.isArray(cliente?.client_levels) ? cliente?.client_levels[0] : cliente?.client_levels;
  const feePercentage = levelData?.taxa_saque_transferencia ?? currentLevel.feePercentage ?? 0;
  
  const [shouldOpenSaqueModal, setShouldOpenSaqueModal] = useState(false);
  const confettiStarted = useRef(false);
  const hasAutoOpened = useRef<string | null>(null);
  const animationStarted = useRef(false);
  const [displaySaldo, setDisplaySaldo] = useState(0);
  const [minSaque, setMinSaque] = useState(50);
  const [hasPaidFatura, setHasPaidFatura] = useState<boolean>(false);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [hasActiveRequest, setHasActiveRequest] = useState<boolean>(false);
  const [hasActiveMinRequest, setHasActiveMinRequest] = useState<boolean>(false);

  useEffect(() => {
    if (clienteProp) {
      setCliente(clienteProp);
      const newSaldo = Number(clienteProp.saldo_carteira) || 0;
      setSaldo(newSaldo);
      
      if (!animationStarted.current) {
        animationStarted.current = true;
        animateBalance(0, newSaldo);
      } else {
        animateBalance(displaySaldo, newSaldo);
      }
    }
  }, [clienteProp]);

  useEffect(() => {
    if (initialItemId && hasAutoOpened.current !== initialItemId) {
      const detectTabAndSwitch = async () => {
        try {
          // Find if it's a fatura
          const { data: fatura } = await supabase.from('faturas').select('id').eq('id', initialItemId).eq('cliente_id', clientId).maybeSingle();
          if (fatura) {
            setActiveTab('faturas');
            setIsSubmoduleOpen(true);
            return;
          }

          // Find if it's a saque
          const { data: saque } = await supabase.from('saques').select('id').eq('id', initialItemId).eq('cliente_id', clientId).maybeSingle();
          if (saque) {
            setActiveTab('saques');
            setIsSubmoduleOpen(true);
            return;
          }

          // Find if it's an nf
          const { data: nf } = await supabase.from('ordens_fiscais').select('id').eq('id', initialItemId).eq('cliente_id', clientId).maybeSingle();
          if (nf) {
            setActiveTab('nf');
            setIsSubmoduleOpen(true);
            return;
          }

          // Find if it's a transferencia (extrato)
          const { data: trans } = await supabase.from('transferencias').select('id').eq('id', initialItemId).eq('cliente_id', clientId).maybeSingle();
          if (trans) {
            setActiveTab('extrato');
            setIsSubmoduleOpen(true);
            return;
          }
        } catch (e: any) {
          console.error('Erro ao detectar tab:', e);
          toast.error('Erro ao buscar dados da área financeira.');
        }
      };
      detectTabAndSwitch();
    }
  }, [initialItemId]);

  useEffect(() => {
    const tab = normalizeInitialTab(initialTab);
    setActiveTab(tab);
    setIsSubmoduleOpen(Boolean(tab || initialItemId));
  }, [initialTab, initialItemId]);

  useEffect(() => {
    const handleTabChange = (e: any) => {
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab);
        setIsSubmoduleOpen(true);
        if (e.detail.itemId && e.detail.tab === 'nf') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('open-nf-detail', { detail: { itemId: e.detail.itemId } }));
          }, 300);
        }
      }
    };
    window.addEventListener('change-financeiro-tab', handleTabChange);
    return () => window.removeEventListener('change-financeiro-tab', handleTabChange);
  }, []);

  useEffect(() => {
    if (animateOnMount && !confettiStarted.current) {
      confettiStarted.current = true;
      triggerConfetti();
    }
  }, [animateOnMount]);

  useEffect(() => {
    fetchMinSaque();
    checkFaturas();
    checkActiveRequest();
    checkActiveMinRequest();
    if (!clienteProp) {
      fetchSaldo();
    }

    // Check for redemption success in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('redemption') === 'success') {
      triggerConfetti();
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }

    const handleRedemption = () => {
      playPremiumBeep();
      triggerConfetti();
      fetchSaldo();
    };

    window.addEventListener('voucher-redeemed', handleRedemption);

    return () => {
      window.removeEventListener('voucher-redeemed', handleRedemption);
    };
  }, [clientId, clienteProp]);

  useRealtimeSubscription(
    [
      {
        table: 'clientes',
        filter: clientId ? `id=eq.${clientId}` : undefined,
        onChange: fetchSaldo,
      },
      {
        table: 'faturas',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: () => {
          fetchSaldo();
          checkFaturas();
        },
      },
      {
        table: 'saques',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: fetchSaldo,
      },
      {
        table: 'transferencias',
        onChange: fetchSaldo,
      },
      {
        table: 'carteira_lancamentos',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: fetchSaldo,
      },
      {
        table: 'ordens_fiscais',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: fetchSaldo,
      },
      {
        table: 'tickets',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: () => {
          checkActiveRequest();
          checkActiveMinRequest();
        },
      },
      {
        table: 'system_settings',
        filter: 'key=eq.valor_minimo_saque',
        onChange: fetchMinSaque,
      },
    ],
    [clientId]
  );

  const triggerConfetti = () => {
    const end = Date.now() + 2000;
    const colors = ['#4f46e5', '#7c3aed', '#10b981'];

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  };

  async function fetchSaldo() {
    const { data } = await supabase
      .from('clientes')
      .select('*, client_levels!nivel_id(*)')
      .eq('id', clientId)
      .single();
    if (data) {
      const oldSaldo = displaySaldo;
      const newSaldo = Number(data.saldo_carteira) || 0;
      setSaldo(newSaldo);
      setCliente(data);
      
      if (!animationStarted.current) {
        animationStarted.current = true;
        animateBalance(0, newSaldo);
      } else {
        animateBalance(oldSaldo, newSaldo);
      }
    }
  };

  async function fetchMinSaque() {
    try {
      const { data } = await supabase.from('system_settings').select('value').eq('key', 'valor_minimo_saque').maybeSingle();
      if (data) setMinSaque(parseFloat(data.value));
    } catch (e: any) {
      console.error('Erro ao buscar mínimo de saque:', e);
    }
  };

  const checkFaturas = async () => {
    const { count, error } = await supabase
      .from('faturas')
      .select('*', { count: 'exact', head: true })
      .eq('cliente_id', clientId)
      .eq('status', 'pago');
    
    if (!error) {
      setHasPaidFatura((count || 0) > 0);
    }
  };

  const checkActiveRequest = async () => {
    const { data, error } = await supabase
      .from('tickets')
      .select('id')
      .eq('cliente_id', clientId)
      .eq('assunto', 'Solicitação de Liberação Manual de Saque')
      .in('status', ['aberto', 'em andamento']);
    
    if (!error) {
      setHasActiveRequest((data?.length || 0) > 0);
    }
  };

  const checkActiveMinRequest = async () => {
    const { data, error } = await supabase
      .from('tickets')
      .select('id')
      .eq('cliente_id', clientId)
      .eq('assunto', 'Solicitação de Saque Abaixo do Mínimo')
      .in('status', ['aberto', 'em andamento']);
    
    if (!error) {
      setHasActiveMinRequest((data?.length || 0) > 0);
    }
  };

  const canWithdraw = hasPaidFatura || (cliente?.saque_liberado_manual === true);
  const isWalletBlocked = cliente?.carteira_bloqueada === true;

  const financeiroTabs: Array<{ id: FinanceiroTab; label: string; description: string; icon: any; badge?: number }> = [
    { id: 'faturas', label: 'Faturas', description: 'Pagamentos, vencimentos e comprovantes.', icon: CreditCard, badge: pendencies.financeiro_faturas_pendentes + pendencies.financeiro_faturas_vencidas },
    { id: 'extrato', label: 'Extrato', description: 'Entradas, saídas e movimentações.', icon: FileText },
    { id: 'transferencias', label: 'Transferências', description: 'Enviar saldo ou pontos.', icon: ArrowLeftRight },
    { id: 'saques', label: 'Saques', description: 'Retirada de saldo da carteira.', icon: Landmark, badge: pendencies.financeiro_saques_analise },
    { id: 'credito', label: 'Meu Crédito', description: 'Limite, amortizações e quitação.', icon: Landmark },
    { id: 'nf', label: 'Notas Fiscais', description: 'Documentos fiscais emitidos.', icon: FileText },
  ];

  const handleRequestManualRelease = async () => {
    if (isCreatingTicket) return;
    setIsCreatingTicket(true);

    try {
      const ticket = await clientOperationalWrite<{ id: string }>(clientId, 'tickets', 'insert', {
        assunto: 'Solicitação de Liberação Manual de Saque',
        descricao: `O cliente ${cliente?.nome || clientId} solicita a liberação manual do saque antes do pagamento da primeira fatura.`,
        status: 'aberto'
      });

      await notificationService.notifyAdmin(
        '🎟️ Solicitação de Liberação de Saque',
        `O cliente ${cliente?.nome || clientId} solicitou liberação manual de saque via suporte.`,
        'suporte',
        'ticket_aberto_cliente',
        { itemId: ticket.id, tab: 'abertos' }
      );

      await notificationService.notifyClient(
        clientId,
        'Solicitação de Liberação Enviada! 💬',
        'Seu pedido de liberação manual de saque foi registrado. Nossa equipe analisará e retornará via ticket em breve.',
        'suporte',
        'ticket_aberto',
        { itemId: ticket.id, tab: 'abertos' }
      );

      toast.success('Solicitação enviada com sucesso! Acompanhe pelo suporte.');
      checkActiveRequest();
    } catch (error: any) {
      console.error('Erro ao solicitar liberação:', error);
      toast.error('Erro ao enviar solicitação. Tente novamente em instantes.');
    } finally {
      setIsCreatingTicket(false);
    }
  };

  const handleRequestSpecialWithdrawal = async () => {
    if (isCreatingTicket) return;
    setIsCreatingTicket(true);

    try {
      const ticket = await clientOperationalWrite<{ id: string }>(clientId, 'tickets', 'insert', {
        assunto: 'Solicitação de Saque Abaixo do Mínimo',
        descricao: `O cliente ${cliente?.nome || clientId} solicita o saque de um valor abaixo do mínimo permitido. \nSaldo Disponível: ${formatCurrency(saldo)}`,
        status: 'aberto'
      });

      await notificationService.notifyAdmin(
        '💸 Solicitação de Saque Especial',
        `O cliente ${cliente?.nome || clientId} solicitou saque abaixo do mínimo (${formatCurrency(saldo)}).`,
        'suporte',
        'ticket_aberto_cliente',
        { itemId: ticket.id, tab: 'abertos' }
      );

      await notificationService.notifyClient(
        clientId,
        'Solicitação de Saque Enviada! 💬',
        'Seu pedido para sacar o valor abaixo do mínimo foi enviado. Analisaremos seu caso e responderemos via ticket.',
        'suporte',
        'ticket_aberto',
        { itemId: ticket.id, tab: 'abertos' }
      );

      toast.success('Solicitação enviada com sucesso!');
      checkActiveMinRequest();
    } catch (error: any) {
      console.error('Erro ao solicitar saque especial:', error);
      toast.error('Erro ao enviar solicitação.');
    } finally {
      setIsCreatingTicket(false);
    }
  };

  const openFinanceiroSubmodule = (tab: FinanceiroTab) => {
    setActiveTab(tab);
    setIsSubmoduleOpen(true);
    onNavigate?.('financeiro', tab);
  };

  const openSaqueRequestFlow = () => {
    setShouldOpenSaqueModal(false);
    openFinanceiroSubmodule('saques');
    window.setTimeout(() => setShouldOpenSaqueModal(true), 0);
  };

  const backToFinanceiroHome = () => {
    setIsSubmoduleOpen(false);
    onNavigate?.('financeiro');
  };

  const animateBalance = (start: number, target: number) => {
    const duration = 1500;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const current = start + (easeOutCubic * (target - start));
      
      setDisplaySaldo(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplaySaldo(target);
      }
    };
    
    requestAnimationFrame(animate);
  };


  const activeSubmodule = financeiroTabs.find(tab => tab.id === activeTab);
  const ActiveSubmoduleIcon = activeSubmodule?.icon;
  const walletCard = (
    <div id="wallet-card" className="relative flex flex-col gap-4 overflow-hidden rounded-[1.65rem] bg-gradient-to-br from-[#111111] via-[#171724] to-[#101014] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-indigo-500/12 blur-3xl"></div>
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
      
      <div className="relative z-10 flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/8 ring-1 ring-white/10 shadow-inner shadow-white/5 sm:h-14 sm:w-14">
          <CreditCard className="h-6 w-6 text-white/90 sm:h-7 sm:w-7" />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/45">Saldo em Carteira</p>
          <motion.p className="mt-1 text-3xl leading-none tracking-tight text-white sm:text-4xl">
            {formatCurrency(displaySaldo)}
          </motion.p>
          <p className="mt-2 text-[10px] font-medium text-white/42">Mínimo para saque: {formatCurrency(minSaque)}</p>
        </div>
      </div>
      <div className="relative z-10 flex flex-col gap-3 sm:items-end">
        {isWalletBlocked ? (
          <div className="rounded-xl bg-red-500/20 px-4 py-3 text-sm text-white border border-red-500/30">
            <p className="font-bold">Saldo Bloqueado</p>
            <p className="text-xs opacity-90">Para mais informações, abra um chamado no suporte pelo ticket.</p>
          </div>
        ) : saldo > 0 && !canWithdraw ? (
          <div className="rounded-xl bg-amber-500/20 px-4 py-3 text-sm text-white border border-amber-500/30 max-w-xs sm:items-end flex flex-col">
            <p className="font-bold sm:text-right w-full">Saque Indisponível</p>
            <p className="text-xs opacity-90 mb-3 sm:text-right w-full">O saque será liberado após o pagamento da sua primeira fatura.</p>
            {hasActiveRequest ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/30">
                <CheckCircle className="h-3 w-3" />
                Solicitação em Análise
              </div>
            ) : (
              <button 
                onClick={handleRequestManualRelease}
                disabled={isCreatingTicket}
                className="flex items-center gap-2 rounded-lg bg-amber-500/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-500/50 transition-all disabled:opacity-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {isCreatingTicket ? 'Solicitando...' : 'Solicitar Liberação Manual'}
              </button>
            )}
          </div>
        ) : (
          <>
            {saldo >= minSaque && canWithdraw ? (
              <button 
                onClick={() => setShouldOpenSaqueModal(true)}
                className="w-full rounded-full bg-white px-6 py-3 text-sm font-black text-[#1a1a1a] shadow-lg transition-colors hover:bg-neutral-200 sm:w-auto sm:px-7"
              >
                Solicitar Saque
              </button>
            ) : saldo > 0 && canWithdraw && saldo < minSaque ? (
              <div className="flex flex-col items-center sm:items-end gap-3">
                <div className="text-center sm:text-right">
                  <p className="text-xs text-white/40 mb-1 font-bold uppercase tracking-widest">Saldo Insuficiente</p>
                  <p className="text-[10px] text-amber-400 font-medium max-w-[200px]">
                    Atingir o mínimo de {formatCurrency(minSaque)} para liberar o saque.
                  </p>
                </div>
                
                {hasActiveMinRequest ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/30">
                    <CheckCircle className="h-3 w-3" />
                    Chamado em Análise
                  </div>
                ) : (
                  <button 
                    onClick={handleRequestSpecialWithdrawal}
                    disabled={isCreatingTicket || saldo <= 0}
                    className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-all disabled:opacity-50 border border-white/10"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {isCreatingTicket ? 'Solicitando...' : 'Solicitar Saque Especial'}
                  </button>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {!isSubmoduleOpen && (
        <div className="space-y-6">
      <button
        type="button"
        onClick={() => onNavigate?.('dashboard')}
        className="inline-flex w-fit items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-700 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </button>

      <div className="hidden">
        <div id="wallet-card" className="relative flex flex-col gap-4 overflow-hidden rounded-[1.65rem] bg-gradient-to-br from-[#111111] via-[#171724] to-[#101014] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-indigo-500/12 blur-3xl"></div>
          <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
          
          <div className="relative z-10 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/8 ring-1 ring-white/10 shadow-inner shadow-white/5 sm:h-14 sm:w-14">
              <CreditCard className="h-6 w-6 text-white/90 sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/45">Saldo em Carteira</p>
              <motion.p 
                className="mt-1 text-3xl leading-none tracking-tight text-white sm:text-4xl"
              >
                {formatCurrency(displaySaldo)}
              </motion.p>
              <p className="mt-2 text-[10px] font-medium text-white/42">Mínimo para saque: {formatCurrency(minSaque)}</p>
            </div>
          </div>
          <div className="relative z-10 flex flex-col gap-3 sm:items-end">
            {isWalletBlocked ? (
              <div className="rounded-xl bg-red-500/20 px-4 py-3 text-sm text-white border border-red-500/30">
                <p className="font-bold">Saldo Bloqueado</p>
                <p className="text-xs opacity-90">Para mais informações, abra um chamado no suporte pelo ticket.</p>
              </div>
            ) : saldo > 0 && !canWithdraw ? (
              <div className="rounded-xl bg-amber-500/20 px-4 py-3 text-sm text-white border border-amber-500/30 max-w-xs sm:items-end flex flex-col">
                <p className="font-bold sm:text-right w-full">Saque Indisponível</p>
                <p className="text-xs opacity-90 mb-3 sm:text-right w-full">O saque será liberado após o pagamento da sua primeira fatura.</p>
                {hasActiveRequest ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/30">
                    <CheckCircle className="h-3 w-3" />
                    Solicitação em Análise
                  </div>
                ) : (
                  <button 
                    onClick={handleRequestManualRelease}
                    disabled={isCreatingTicket}
                    className="flex items-center gap-2 rounded-lg bg-amber-500/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-500/50 transition-all disabled:opacity-50"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {isCreatingTicket ? 'Solicitando...' : 'Solicitar Liberação Manual'}
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-white/60 leading-relaxed sm:text-right max-w-xs font-medium">
                </p>
                {saldo >= minSaque && canWithdraw ? (
                  <button 
                    onClick={openSaqueRequestFlow}
                    className="w-full rounded-full bg-white px-6 py-3 text-sm font-black text-[#1a1a1a] shadow-lg transition-colors hover:bg-neutral-200 sm:w-auto sm:px-7"
                  >
                    Solicitar Saque
                  </button>
                ) : saldo > 0 && canWithdraw && saldo < minSaque ? (
                  <div className="flex flex-col items-center sm:items-end gap-3">
                    <div className="text-center sm:text-right">
                      <p className="text-xs text-white/40 mb-1 font-bold uppercase tracking-widest">Saldo Insuficiente</p>
                      <p className="text-[10px] text-amber-400 font-medium max-w-[200px]">
                        Atingir o mínimo de {formatCurrency(minSaque)} para liberar o saque.
                      </p>
                    </div>
                    
                    {hasActiveMinRequest ? (
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/30">
                        <CheckCircle className="h-3 w-3" />
                        Chamado em Análise
                      </div>
                    ) : (
                      <button 
                        onClick={handleRequestSpecialWithdrawal}
                        disabled={isCreatingTicket || saldo <= 0}
                        className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-all disabled:opacity-50 border border-white/10"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {isCreatingTicket ? 'Solicitando...' : 'Solicitar Saque Especial'}
                      </button>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="mt-1 text-xl font-black text-neutral-950">Escolha uma área financeira</h3>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {financeiroTabs.map(({ id, label, icon: Icon, badge = 0 }) => {
            const isActive = activeTab === id;

            return (
              <button
                key={id}
                onClick={() => openFinanceiroSubmodule(id)}
                className={`group relative flex min-h-[124px] flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border p-3 text-center transition-all md:min-h-[140px] md:p-4 ${
                  isActive
                    ? 'border-indigo-200 bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'border-neutral-200 bg-white text-neutral-950 shadow-sm hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-lg'
                }`}
              >
                <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                  isActive ? 'bg-white/15 text-white ring-1 ring-white/20' : 'bg-neutral-100 text-indigo-600'
                }`}>
                  <Icon className="h-7 w-7" />
                </span>

                <div className="min-w-0">
                  <h4 className="text-sm font-black leading-tight sm:text-base">{label}</h4>
                </div>

                {badge > 0 && (
                  <span className={`absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[9px] font-black ${
                    isActive ? 'bg-white text-indigo-600' : 'bg-red-500 text-white'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
        </div>
      )}

      {isSubmoduleOpen && activeSubmodule && ActiveSubmoduleIcon && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={backToFinanceiroHome}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-700 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </button>

          <div className="flex items-center gap-3 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <ActiveSubmoduleIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black text-neutral-950">{activeSubmodule.label}</h2>
            </div>
          </div>
        </div>
      )}

      {isSubmoduleOpen && (
      <div className="min-h-[400px]">
        {activeTab === 'faturas' && <FaturasList clientId={clientId} saldo={saldo} cliente={cliente} onRefresh={fetchSaldo} initialItemId={initialItemId} />}
        {activeTab === 'nf' && <NotasFiscaisList clientId={clientId} initialItemId={initialItemId} />}
        {activeTab === 'extrato' && <ExtratoList clientId={clientId} initialItemId={initialItemId} clienteNome={cliente?.nome} clienteTelefone={cliente?.telefone} />}
        {activeTab === 'saques' && (
          <div className="space-y-6">
            {walletCard}
            <SaquesList 
              clientId={clientId} 
              saldo={saldo} 
              cliente={cliente} 
              onRefresh={fetchSaldo} 
              shouldOpenModal={shouldOpenSaqueModal}
              onModalOpen={() => setShouldOpenSaqueModal(false)}
              initialItemId={initialItemId}
              feePercentage={feePercentage}
              minSaque={minSaque}
              hasPaidFatura={hasPaidFatura}
            />
          </div>
        )}
        {activeTab === 'credito' && cliente && (
          <ClientMeuCredito
            clientId={clientId}
            cliente={cliente}
            onRefreshCliente={fetchSaldo}
            initialItemId={initialItemId}
            onNavigate={(module, tab, itemId) => onNavigate?.(module, tab, itemId)}
          />
        )}
        {activeTab === 'transferencias' && (
          <ClientTransferencias
            clientId={clientId}
            initialItemId={initialItemId}
            cliente={cliente}
          />
        )}
      </div>
      )}
    </div>
  );
}
