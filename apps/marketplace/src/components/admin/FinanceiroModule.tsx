import { useState, useEffect, useRef } from 'react';
import { Search, FileText, CheckCircle, XCircle, Wallet, Ticket, CreditCard, Filter, Printer, ArrowDownCircle, Check, X, Info, Landmark, Send, MessageSquare, ClipboardList, History, Building2, Plus, Calendar, Clock, User, ShoppingBag, ChevronLeft, Repeat2, Gavel, Receipt, BadgePercent, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Fatura, Cliente, Voucher, Saque } from '../../types';
import { Modal } from '../ui/Modal';
import { formatCurrency, formatDate, formatDateTime, generateCode, maskCurrency } from '../../lib/utils';
import { GlobalFilter } from '../ui/GlobalFilter';
import { toast } from 'react-hot-toast';
import { generateFaturaPDF } from '../../lib/pdf';
import { pdfSharingService } from '../../lib/pdfSharingService';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { PainelRentabilidade } from './PainelRentabilidade';
import { PrestadoresFinanceiro } from './prestadores/PrestadoresFinanceiro';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';
import { logService } from '../../lib/logService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { CobrancaModule } from './CobrancaModule';
import { FiscalModule } from './FiscalModule';
import { AffiliateAdminModule } from './AffiliateAdminModule';
import { sessionService } from '../../lib/sessionService';

let syncFaturasPromise: Promise<void> | null = null;

const syncFaturasVencidas = async () => {
  if (syncFaturasPromise) return syncFaturasPromise;

  syncFaturasPromise = (async () => {
    try {
      const { error } = await supabase.rpc('fn_marcar_faturas_vencidas');
      if (error) throw error;
    } catch (err) {
      console.error('Erro ao sincronizar faturas vencidas:', err);
    } finally {
      syncFaturasPromise = null;
    }
  })();

  return syncFaturasPromise;
};

const getAdminSessionForRpc = () => {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken) {
    throw new Error('Sessão administrativa expirada. Faça login novamente.');
  }
  return session;
};

export function FinanceiroModule({ initialTab, initialItemId, adminType, colaboradorId, colaboradorNome, onNavigate }: { initialTab?: string, initialItemId?: string, adminType?: string, colaboradorId?: string, colaboradorNome?: string, onNavigate?: (module: string, tab?: string, itemId?: string) => void }) {
  const { pendencies } = useAdminNotifications();
  // ── 1. Tabs / UI state ────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<'faturas' | 'clientes' | 'prestadores_fin'>('faturas');
  const [activeTab, setActiveTab] = useState<'pendentes' | 'pagos' | 'cancelados' | 'saques' | 'transferencias'>('pendentes');
  const [showSubTabs, setShowSubTabs] = useState(false);
  const [isSubmoduleOpen, setIsSubmoduleOpen] = useState(Boolean(initialTab || initialItemId));
  const [financeiroSubmodule, setFinanceiroSubmodule] = useState<'core' | 'cobranca' | 'fiscal' | 'afiliados'>('core');

  // ── 2. Data state ─────────────────────────────────────────────────────────
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [saques, setSaques] = useState<Saque[]>([]);
  const [transferencias, setTransferencias] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({
    mes: '',
    ano: ''
  });
  const [loadingSaques, setLoadingSaques] = useState(false);

  // ── 3. Modal / selection state ────────────────────────────────────────────
  const [selectedFatura, setSelectedFatura] = useState<Fatura | null>(null);
  const [selectedSaque, setSelectedSaque] = useState<Saque | null>(null);
  const [selectedTransferencia, setSelectedTransferencia] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSaqueDetailOpen, setIsSaqueDetailOpen] = useState(false);
  const [isTransferenciaDetailOpen, setIsTransferenciaDetailOpen] = useState(false);
  const [cancelData, setCancelData] = useState({
    data: new Date().toISOString().split('T')[0],
    motivo: ''
  });
  const [isCancelFaturaModalOpen, setIsCancelFaturaModalOpen] = useState(false);
  const [faturaToCancel, setFaturaToCancel] = useState<Fatura | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newFaturaData, setNewFaturaData] = useState({
    cliente_id: '',
    os_id: '',
    ordem_compra_id: '',
    ordem_assinatura_id: '',
    valor_total: '',
    data_vencimento: new Date().toISOString().split('T')[0],
    data_emissao: new Date().toISOString().split('T')[0],
    descricao: '',
    categoria: 'servico' as 'servico' | 'produto' | 'assinatura'
  });
  const [isCreatingFatura, setIsCreatingFatura] = useState(false);
  const [availableClients, setAvailableClients] = useState<Cliente[]>([]);
  const [availableOrders, setAvailableOrders] = useState<{
    os: any[],
    oc: any[],
    oa: any[]
  }>({ os: [], oc: [], oa: [] });
  const [isProcessingSaque, setIsProcessingSaque] = useState(false);
  const [confirmModalSaque, setConfirmModalSaque] = useState<{
    isOpen: boolean;
    saque: Saque | null;
    type: 'approve' | 'reject';
    reason: string;
    dataPagamento: string;
  }>({
    isOpen: false,
    saque: null,
    type: 'approve',
    reason: '',
    dataPagamento: new Date().toISOString().split('T')[0]
  });
  const [isProcessingTransferencia, setIsProcessingTransferencia] = useState(false);
  const [confirmModalTransferencia, setConfirmModalTransferencia] = useState<{
    isOpen: boolean;
    transferencia: any | null;
    type: 'approve' | 'reject' | 'rollback';
    reason: string;
    dataPagamento: string;
  }>({
    isOpen: false,
    transferencia: null,
    type: 'approve',
    reason: '',
    dataPagamento: new Date().toISOString().split('T')[0]
  });

  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const hasAutoOpened = useRef<string | null>(null);

// Efeito para preenchimento automático de valor ao selecionar ordem
  useEffect(() => {
    if (newFaturaData.os_id) {
      const selected = availableOrders.os.find(o => o.id === newFaturaData.os_id);
      if (selected?.valor) {
        setNewFaturaData(prev => ({ ...prev, valor_total: maskCurrency(selected.valor.toString()) }));
      }
    }
  }, [newFaturaData.os_id, availableOrders.os]);

  useEffect(() => {
    if (newFaturaData.ordem_compra_id) {
      const selected = availableOrders.oc.find(o => o.id === newFaturaData.ordem_compra_id);
      if (selected?.valor) {
        setNewFaturaData(prev => ({ ...prev, valor_total: maskCurrency(selected.valor.toString()) }));
      }
    }
  }, [newFaturaData.ordem_compra_id, availableOrders.oc]);

  useEffect(() => {
    if (newFaturaData.ordem_assinatura_id) {
      const selected = availableOrders.oa.find(o => o.id === newFaturaData.ordem_assinatura_id);
      if (selected?.valor) {
        setNewFaturaData(prev => ({ ...prev, valor_total: maskCurrency(selected.valor.toString()) }));
      }
    }
  }, [newFaturaData.ordem_assinatura_id, availableOrders.oa]);

  useEffect(() => {
    if (initialItemId && hasAutoOpened.current !== initialItemId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`fatura-${initialItemId}`) || 
                        document.getElementById(`saque-${initialItemId}`) || 
                        document.getElementById(`transferencia-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          
          // Abrir modal automaticamente dependendo do tipo de item
          const fatura = faturas.find(f => f.id === initialItemId);
          if (fatura) {
            setSelectedFatura(fatura);
            setIsDetailOpen(true);
            hasAutoOpened.current = initialItemId;
          }

          const saque = saques.find(s => s.id === initialItemId);
          if (saque) {
            setSelectedSaque(saque);
            setIsSaqueDetailOpen(true);
            hasAutoOpened.current = initialItemId;
          }

          const transf = transferencias.find(t => t.id === initialItemId);
          if (transf) {
            setSelectedTransferencia(transf);
            setIsTransferenciaDetailOpen(true);
            hasAutoOpened.current = initialItemId;
          }

          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, faturas, saques, transferencias]);

  // ── 4. Refs (para evitar stale closures nos listeners realtime) ───────────
  const activeTabRef = useRef(activeTab);
  const searchRef = useRef(search);
  const filtersRef = useRef(filters);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  // ── 5. Constantes de navegação ────────────────────────────────────────────
  const MAIN_TABS = [
    { id: 'faturas', label: 'Faturas & Recebíveis', icon: FileText },
    { id: 'clientes', label: 'Clientes', icon: Landmark },
    { id: 'prestadores_fin', label: 'Prestadores', icon: Building2 }
  ];

  const MAIN_TABS_WITH_BADGES = [
    { 
      ...MAIN_TABS[0], 
      badge: pendencies.financeiro_faturas_pendentes + pendencies.financeiro_faturas_vencidas 
    },
    { 
      ...MAIN_TABS[1], 
      badge: pendencies.financeiro_saques_pendentes + pendencies.financeiro_transferencias_analise 
    },
    { 
      ...MAIN_TABS[2], 
      badge: pendencies.financeiro_prestador_saques_pendentes 
    }
  ];

  const SUB_TABS: Record<string, { id: string; label: string }[]> = {
    faturas: [
      { id: 'pendentes', label: 'Pendentes' },
      { id: 'pagos', label: 'Pagos' },
      { id: 'cancelados', label: 'Cancelados' }
    ],
    clientes: [
      { id: 'saques', label: 'Solicitações de Saque' },
      { id: 'transferencias', label: 'Transferências' }
    ],
    prestadores_fin: [
      { id: 'saques', label: 'Solicitações de Saque' }
    ]
  };

  // ── 6. Funções de fetch (declaradas antes dos handlers que as chamam) ──────
  const fetchFaturas = async (
    tab: string = activeTabRef.current,
    currentSearch: string = searchRef.current,
    currentFilters: Record<string, any> = filtersRef.current
  ) => {
    await syncFaturasVencidas();
    let query = supabase
      .from('faturas')
      .select('*, cobrancas(id), clientes(id, nome, cpf, cnpj, email, telefone, codigo_cliente), ordens_servico(codigo_os, orcamentos(codigo_orcamento, total, valor_servico, valor_adicional, descricao_adicional, acrescimo, desconto, servicos(nome))), ordens_compra(codigo_ordem, quantidade, produtos(nome, valor), orcamentos(codigo_orcamento, total, valor_servico, valor_adicional, descricao_adicional, acrescimo, desconto)), ordens_assinatura(codigo_ordem, quantidade, assinaturas(nome, valor), orcamentos(codigo_orcamento, total, valor_servico, valor_adicional, descricao_adicional, acrescimo, desconto, quantidade_meses, prazo_indeterminado)), pagamentos(metodo, valor), ordens_fiscais(id)');

    if (tab === 'pendentes') {
      query = query.in('status', ['pendente', 'revisada', 'vencida', 'pendente_pagamento', 'aguardando_link']);
    } else if (tab === 'pagos') {
      query = query.eq('status', 'pago');
    } else if (tab === 'cancelados') {
      query = query.eq('status', 'cancelado');
    }

    if (currentSearch) {
      query = query.ilike('codigo_fatura', `%${currentSearch}%`);
    }

    if (currentFilters.mes) {
      const year = currentFilters.ano || new Date().getFullYear();
      const startDate = `${year}-${currentFilters.mes}-01`;
      const endDate = new Date(Number(year), Number(currentFilters.mes), 0)
        .toISOString()
        .split('T')[0];
      query = query.gte('data_vencimento', startDate).lte('data_vencimento', endDate);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar faturas:', error);
      return;
    }

    if (data) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      setFaturas(data.map((f: any) => {
        let currentStatus = f.status;
        if (currentStatus === 'pendente' && f.data_vencimento) {
          const parts = f.data_vencimento.split('-');
          if (parts.length === 3) {
            const vencDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            vencDate.setHours(0, 0, 0, 0);
            if (vencDate < hoje) {
              currentStatus = 'vencida';
            }
          }
        }
        
        return {
          ...f,
          status: currentStatus,
          tem_cobranca: f.cobrancas && f.cobrancas.length > 0
        };
      }));
      
      // Sincroniza faturas vencidas (removido daqui, agora é feito antes da query)
    }
  };

  const fetchSaques = async () => {
    setLoadingSaques(true);
    try {
      const { data } = await supabase
        .from('saques')
        .select('*, clientes(id, nome, codigo_cliente, cpf, saldo_carteira)')
        .order('data_solicitacao', { ascending: false });
      if (data) setSaques(data as any);
    } finally {
      setLoadingSaques(false);
    }
  };

  const fetchTransferencias = async (currentSearch: string = searchRef.current) => {
    try {
      let query = supabase
        .from('transferencias')
        .select(
          '*, cliente_origem:clientes!cliente_origem_id(nome, cpf, data_cadastro, saldo_carteira, saldo_pontos), cliente_destino:clientes!cliente_destino_id(nome, cpf, data_cadastro, saldo_carteira, saldo_pontos)'
        );

      if (currentSearch) {
        // Busca flexível no nome ou CPF do remetente/destinatário
        query = query.or(`motivo.ilike.%${currentSearch}%,cliente_origem.nome.ilike.%${currentSearch}%,cliente_origem.cpf.ilike.%${currentSearch}%,cliente_destino.nome.ilike.%${currentSearch}%`);
      }

      const { data, error } = await query.order('data_solicitacao', { ascending: false });
      
      if (error) throw error;
      if (data) setTransferencias(data);
    } catch (err) {
      console.error('Erro ao buscar transferências:', err);
    }
  };

  const fetchDataForTab = (tab: string) => {
    if (tab === 'saques') {
      fetchSaques();
    } else if (tab === 'transferencias') {
      fetchTransferencias(searchRef.current);
    } else {
      fetchFaturas(tab, searchRef.current, filtersRef.current);
    }
  };

  // ── 7. Handlers de navegação ──────────────────────────────────────────────
  const handleMainTabClick = (tabId: 'faturas' | 'clientes' | 'prestadores_fin') => {
    setIsSubmoduleOpen(true);
    if (mainTab === tabId) {
      setShowSubTabs(!showSubTabs);
    } else {
      const firstSubTab = SUB_TABS[tabId][0].id;
      setMainTab(tabId);
      setActiveTab(firstSubTab as any);
      setShowSubTabs(true);
      fetchDataForTab(firstSubTab);
    }
  };

  const handleSubTabClick = (subId: string) => {
    setActiveTab(subId as any);
    setShowSubTabs(false);
    fetchDataForTab(subId);
  };

  const openFinanceSubmodule = (
    targetMainTab: 'faturas' | 'clientes' | 'prestadores_fin',
    targetSubTab: 'pendentes' | 'pagos' | 'cancelados' | 'saques' | 'transferencias'
  ) => {
    setFinanceiroSubmodule('core');
    setMainTab(targetMainTab);
    setActiveTab(targetSubTab);
    setShowSubTabs(false);
    setIsSubmoduleOpen(true);
    fetchDataForTab(targetSubTab);
  };

  const backToFinanceiroHome = () => {
    setIsSubmoduleOpen(false);
    setFinanceiroSubmodule('core');
    setShowSubTabs(false);
  };

  const openFinanceiroArea = (area: 'cobranca' | 'fiscal' | 'afiliados') => {
    setFinanceiroSubmodule(area);
    setShowSubTabs(false);
    setIsSubmoduleOpen(true);
  };

  // ── 8. Efeitos ────────────────────────────────────────────────────────────

  // Navegar para aba via prop initialTab (ex: vindo do Dashboard)
  useEffect(() => {
    if (initialTab) {
      if (initialTab === 'cobranca') {
        openFinanceiroArea('cobranca');
      } else if (initialTab === 'fiscal') {
        openFinanceiroArea('fiscal');
      } else if (initialTab === 'afiliados') {
        openFinanceiroArea('afiliados');
      } else if (initialTab === 'saques' || initialTab === 'transferencias') {
        setFinanceiroSubmodule('core');
        setMainTab('clientes');
        setActiveTab(initialTab as any);
        setIsSubmoduleOpen(true);
      } else if (initialTab === 'saques_rede') {
        setFinanceiroSubmodule('core');
        setMainTab('prestadores_fin');
        setActiveTab('saques');
        setIsSubmoduleOpen(true);
      } else if (['em_aberto', 'pendentes', 'pagos', 'cancelados'].includes(initialTab)) {
        setFinanceiroSubmodule('core');
        setMainTab('faturas');
        setActiveTab('pendentes');
        setIsSubmoduleOpen(true);
      } else if (initialTab === 'faturas') {
        setFinanceiroSubmodule('core');
        setMainTab('faturas');
        setActiveTab('pendentes');
        setIsSubmoduleOpen(true);
        fetchFaturas('pendentes', searchRef.current, filtersRef.current);
      }
    }
  }, [initialTab]);

  // Realtime subscriptions — usa refs para evitar stale closures
  useEffect(() => {
    fetchDataForTab(activeTab);
  }, [activeTab, search, filters]);

  // Stable Realtime Subscriptions
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const debouncedFetch = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchDataForTab(activeTabRef.current);
      }, 300);
    };

    const channelFaturas = supabase
      .channel(`admin-faturas-rt-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'faturas' }, () => {
        debouncedFetch();
      })
      .subscribe();

    const channelSaques = supabase
      .channel(`admin-saques-rt-${Date.now() + 1}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saques' }, () => {
        debouncedFetch();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_saques' }, () => {
        debouncedFetch();
      })
      .subscribe();

    const channelTransferencias = supabase
      .channel(`admin-transferencias-rt-${Date.now() + 2}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transferencias' }, () => {
        debouncedFetch();
      })
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channelFaturas);
      supabase.removeChannel(channelSaques);
      supabase.removeChannel(channelTransferencias);
    };
  }, []); // Empty dependency array for stability

  const handleAprovarSaque = async (saque: Saque) => {
    setConfirmModalSaque({ 
      isOpen: true, 
      saque, 
      type: 'approve', 
      reason: '',
      dataPagamento: new Date().toISOString().split('T')[0]
    });
  };

  const confirmAprovarSaque = async () => {
    const { saque, dataPagamento } = confirmModalSaque;
    if (!saque || isProcessingSaque) return;

    setIsProcessingSaque(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_processar_saque', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_saque_id: saque.id,
        p_acao: 'aprovar',
        p_motivo: null,
        p_data_pagamento: dataPagamento
      });
      if (error) throw error;
      if (data && !(data as any).success) throw new Error((data as any).error || 'Erro ao aprovar saque.');

      toast.success('Saque aprovado e marcado como pago!');
      setIsSaqueDetailOpen(false);
      setConfirmModalSaque({ ...confirmModalSaque, isOpen: false });
      fetchSaques();

      await notificationService.notifyClient(
        saque.cliente_id,
        'Saque realizado',
        `Seu saque no valor de ${formatCurrency(saque.valor)} foi processado e pago com sucesso.`,
        'financeiro',
        'saque_pago',
        { prioridade: 'alta', contexto: { saque_id: saque.id, valor: saque.valor } }
      );

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'APROVAR_SAQUE_CLIENTE',
        detalhes: `Aprovou saque de ${formatCurrency(saque.valor)} para o cliente ${(saque as any).clientes?.nome}`
      });
    } catch (error: any) {
      console.error('Erro ao aprovar saque:', error);
      toast.error(error.message || 'Erro ao aprovar saque.');
    } finally {
      setIsProcessingSaque(false);
    }
  };

  const handleRejeitarSaque = async (saque: Saque) => {
    setConfirmModalSaque({ isOpen: true, saque, type: 'reject', reason: '', dataPagamento: '' });
  };

  const confirmRejeitarSaque = async () => {
    const { saque, reason } = confirmModalSaque;
    if (!saque || isProcessingSaque) return;

    setIsProcessingSaque(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_processar_saque', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_saque_id: saque.id,
        p_acao: 'rejeitar',
        p_motivo: reason,
        p_data_pagamento: null
      });
      if (error) throw error;
      if (data && !(data as any).success) throw new Error((data as any).error || 'Erro ao rejeitar saque.');

      toast.success('Saque rejeitado e valor estornado para o cliente.');
      setIsSaqueDetailOpen(false);
      setConfirmModalSaque({ ...confirmModalSaque, isOpen: false });
      fetchSaques();

      await notificationService.notifyClient(
        saque.cliente_id,
        'Saque recusado',
        `Seu saque no valor de ${formatCurrency(saque.valor)} foi recusado. Motivo: ${reason}. O valor foi devolvido à sua carteira.`,
        'financeiro',
        'saque_recusado',
        { prioridade: 'alta', contexto: { saque_id: saque.id, valor: saque.valor, motivo: reason } }
      );

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'REJEITAR_SAQUE_CLIENTE',
        detalhes: `Rejeitou saque de ${formatCurrency(saque.valor)} para o cliente ${saque.clientes?.nome}. Motivo: ${reason}`
      });
    } catch (error: any) {
      console.error('Erro ao rejeitar saque:', error);
      toast.error(error.message || 'Erro ao rejeitar saque.');
    } finally {
      setIsProcessingSaque(false);
    }
  };

  const handleAprovarTransferencia = (t: any) => {
    setIsTransferenciaDetailOpen(false); // fecha o modal de detalhe
    setTimeout(() => {
      setConfirmModalTransferencia({
        isOpen: true,
        transferencia: t,
        type: 'approve',
        reason: '',
        dataPagamento: new Date().toISOString().split('T')[0]
      });
    }, 150); // aguarda animação de fechar
  };

  const handleRejeitarTransferencia = (t: any) => {
    setIsTransferenciaDetailOpen(false); // fecha o modal de detalhe
    setTimeout(() => {
      setConfirmModalTransferencia({
        isOpen: true,
        transferencia: t,
        type: 'reject',
        reason: '',
        dataPagamento: ''
      });
    }, 150);
  };

  const handleEstornarTransferencia = (t: any) => {
    setIsTransferenciaDetailOpen(false);
    setTimeout(() => {
      setConfirmModalTransferencia({
        isOpen: true,
        transferencia: t,
        type: 'rollback',
        reason: '',
        dataPagamento: ''
      });
    }, 150);
  };

  const confirmAprovarTransferencia = async () => {
    const t = confirmModalTransferencia.transferencia;
    const dataPag = confirmModalTransferencia.dataPagamento;
    if (!t || isProcessingTransferencia) return;

    setIsProcessingTransferencia(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_processar_transferencia', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_transferencia_id: t.id,
        p_acao: 'aprovar',
        p_motivo: null,
        p_data_pagamento: dataPag
      });
      if (error) throw error;
      if (data && !(data as any).success) throw new Error((data as any).error || 'Erro ao aprovar transferência.');

      setConfirmModalTransferencia(prev => ({ ...prev, isOpen: false, transferencia: null }));
      toast.success('Transferência aprovada com sucesso!');
      fetchTransferencias();

      if (t.cliente_origem_id) {
        await notificationService.notifyClient(
          t.cliente_origem_id,
          'Transferência aprovada',
          `Sua transferência de ${t.tipo?.toLowerCase().includes('ponto') ? `${Number(t.valor).toLocaleString('pt-BR')} pts` : formatCurrency(t.valor)} foi aprovada pelo sistema.`,
          'financeiro',
          'transferencia_aprovada',
          { prioridade: 'alta', contexto: { transferencia_id: t.id, valor: t.valor } }
        );
      }
      if (t.cliente_destino_id) {
        const valorLiquido = Number(t.valor_liquido || t.valor);
        await notificationService.notifyClient(
          t.cliente_destino_id,
          'Transferência recebida',
          `Você recebeu uma transferência de ${t.tipo?.toLowerCase().includes('ponto') ? `${valorLiquido} pts` : formatCurrency(valorLiquido)} de ${t.cliente_origem?.nome || 'cliente'}.`,
          'financeiro',
          'transferencia_aprovada',
          { prioridade: 'alta', contexto: { transferencia_id: t.id, valor: valorLiquido } }
        );
      }

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'APROVAR_TRANSFERENCIA',
        detalhes: `Aprovou transferência de ${t.valor} para ${t.cliente_destino?.nome}`
      });
    } catch (err: any) {
      console.error('Erro ao aprovar transferência:', err);
      toast.error(err?.message || 'Erro ao aprovar transferência.');
    } finally {
      setIsProcessingTransferencia(false);
    }
  };

  const confirmRejeitarTransferencia = async () => {
    const { transferencia: t, reason } = confirmModalTransferencia;
    if (!t || isProcessingTransferencia) return;

    setIsProcessingTransferencia(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_processar_transferencia', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_transferencia_id: t.id,
        p_acao: 'rejeitar',
        p_motivo: reason,
        p_data_pagamento: null
      });
      if (error) throw error;
      if (data && !(data as any).success) throw new Error((data as any).error || 'Erro ao rejeitar transferência.');

      setConfirmModalTransferencia(prev => ({ ...prev, isOpen: false, transferencia: null }));
      toast.success('Transferência rejeitada e valor estornado.');
      fetchTransferencias();

      if (t.cliente_origem_id) {
        await notificationService.notifyClient(
          t.cliente_origem_id,
          'Transferência recusada',
          `Sua transferência foi recusada. Motivo: ${reason}. O valor foi devolvido à sua conta.`,
          'financeiro',
          'transferencia_recusada',
          { prioridade: 'alta', contexto: { transferencia_id: t.id, motivo: reason } }
        );
      }

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'REJEITAR_TRANSFERENCIA',
        detalhes: `Rejeitou transferência de ${t.valor} para ${t.cliente_destino?.nome}. Motivo: ${reason}`
      });
    } catch (err: any) {
      console.error('Erro ao rejeitar transferência:', err);
      toast.error(err?.message || 'Erro ao rejeitar transferência.');
    } finally {
      setIsProcessingTransferencia(false);
    }
  };

  const confirmEstornarTransferencia = async () => {
    const { transferencia: t, reason } = confirmModalTransferencia;
    if (!t || isProcessingTransferencia) return;

    setIsProcessingTransferencia(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_processar_transferencia', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_transferencia_id: t.id,
        p_acao: 'estornar',
        p_motivo: reason,
        p_data_pagamento: null
      });
      if (error) throw error;
      if (data && !(data as any).success) throw new Error((data as any).error || 'Erro ao estornar transferência.');

      setConfirmModalTransferencia(prev => ({ ...prev, isOpen: false, transferencia: null }));
      toast.success('Transferência estornada com sucesso!');
      fetchTransferencias();

      if (t.cliente_origem_id) {
        await notificationService.notifyClient(
          t.cliente_origem_id,
          'Transferência estornada',
          `Sua transferência para ${t.cliente_destino?.nome} foi estornada pelo sistema. O valor foi devolvido à sua conta.`,
          'financeiro',
          'transferencia_aprovada'
        );
      }
      if (t.cliente_destino_id) {
        await notificationService.notifyClient(
          t.cliente_destino_id,
          'Transferência revertida',
          `Uma transferência recebida de ${t.cliente_origem?.nome} foi estornada pelo sistema.`,
          'financeiro',
          'transferencia_recusada'
        );
      }

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'ESTORNAR_TRANSFERENCIA',
        detalhes: `Estornou transferência #${t.id.slice(0, 8)} de ${t.valor} para ${t.cliente_destino?.nome}. Motivo: ${reason}`
      });
    } catch (err: any) {
      console.error('Erro ao estornar transferência:', err);
      toast.error(err?.message || 'Erro ao estornar transferência.');
    } finally {
      setIsProcessingTransferencia(false);
    }
  };

  const handleManualPayment = async (fatura: Fatura, method: string, dateTime: string, notes: string) => {
    if (!notes.trim()) return toast.error('Informe as observações da baixa.');

    try {
      const isoDateTime = new Date(dateTime).toISOString();
      const session = getAdminSessionForRpc();

      const { data: baixaResult, error: baixaError } = await supabase.rpc('gsa_admin_baixar_fatura', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_fatura_id: fatura.id,
        p_metodo: method,
        p_data_pagamento: isoDateTime,
        p_observacoes: notes
      });

      if (baixaError) throw baixaError;
      if (baixaResult && !(baixaResult as any).success) {
        throw new Error((baixaResult as any).error || 'Erro ao baixar fatura.');
      }

      toast.success('Baixa administrativa realizada com sucesso!');
      setIsDetailOpen(false);
      fetchFaturas(activeTab, searchRef.current, filtersRef.current);

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'BAIXAR_FATURA_MANUAL',
        detalhes: `Baixa manual da fatura #${fatura.codigo_fatura} via ${method}`
      });

      // Busca a fatura atualizada para pegar todos os descontos reais do banco
      const { data: updatedFatura } = await supabase
        .from('faturas')
        .select(`
          *,
          clientes (
            nome,
            telefone
          )
        `)
        .eq('id', fatura.id)
        .single();

      if (updatedFatura && updatedFatura.clientes?.telefone) {
        const mensagemWhats = whatsappNotificationService.gerarMensagemWhatsApp({
          tipo: 'fatura',
          clienteNome: updatedFatura.clientes.nome,
          codigo: updatedFatura.codigo_fatura,
          status: updatedFatura.status,
          dataVencimento: updatedFatura.data_vencimento ? formatDate(updatedFatura.data_vencimento) : undefined,
          valorTotal: formatCurrency(updatedFatura.valor_total),
          formaPagamento: method,
          valorLiquido: formatCurrency(updatedFatura.valor_pago || updatedFatura.valor_total),
          cupomAplicado: updatedFatura.voucher_codigo,
          valorCupom: updatedFatura.desconto_voucher_aplicado > 0 ? formatCurrency(updatedFatura.desconto_voucher_aplicado) : undefined,
          pontosUtilizados: updatedFatura.pontos_utilizados > 0 ? updatedFatura.pontos_utilizados : undefined,
          valorPontos: updatedFatura.desconto_pontos_aplicado > 0 ? formatCurrency(updatedFatura.desconto_pontos_aplicado) : undefined,
          saldoCarteiraUtilizado: updatedFatura.abatimento_carteira_aplicado > 0 ? formatCurrency(updatedFatura.abatimento_carteira_aplicado) : undefined,
        });

        // Dispara o WhatsApp em background
        whatsappNotificationService.enviarWhatsAppDireto(updatedFatura.clientes.telefone, mensagemWhats)
          .catch(err => console.warn('Falha silenciosa ao enviar WhatsApp automático', err));
      }
    } catch (error: any) {
      console.error('Erro na baixa manual:', error);
      toast.error(error?.message || 'Erro ao processar baixa administrativa.');
    }
  };

  const handleEnviarParaCobranca = async (fatura: Fatura) => {
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_enviar_fatura_cobranca', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_fatura_id: fatura.id
      });

      if (error) throw error;
      if (data && !(data as any).success) {
        throw new Error((data as any).error || 'Erro ao enviar fatura para cobrança.');
      }

      if ((data as any)?.already_exists) {
        toast('Esta fatura já está no módulo de Cobrança.', { icon: 'i' });
      } else {
        toast.success('Fatura enviada ao módulo de Cobrança!');
      }

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'ENVIAR_PARA_COBRANCA',
        detalhes: `Fatura #${fatura.codigo_fatura} enviada ao módulo de Cobrança.`
      });

      fetchFaturas(activeTab, searchRef.current, filtersRef.current);
      if (onNavigate) onNavigate('cobranca', 'fila', fatura.id);
    } catch (err: any) {
      console.error('Erro ao enviar para cobrança:', err);
      toast.error(err?.message || 'Erro ao enviar fatura para o módulo de Cobrança.');
    }
  };

  const handleCancelFatura = async (fatura: Fatura, reason: string) => {
    if (!reason.trim()) return toast.error('Informe o motivo do cancelamento.');

    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_cancelar_fatura', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_fatura_id: fatura.id,
        p_motivo: reason
      });

      if (error) throw error;
      if (data && !(data as any).success) {
        throw new Error((data as any).error || 'Erro ao cancelar fatura.');
      }

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'CANCELAR_FATURA',
        detalhes: `Cancelou a fatura #${fatura.codigo_fatura}. Motivo: ${reason}`
      });

      toast.success('Fatura cancelada com sucesso!');
      setIsCancelFaturaModalOpen(false);
      setIsDetailOpen(false);
      fetchFaturas(activeTab, searchRef.current, filtersRef.current);

      await notificationService.notifyClient(
        fatura.cliente_id,
        'Fatura cancelada',
        `Sua fatura #${fatura.codigo_fatura} foi cancelada pelo sistema.`,
        'financeiro',
        'fatura_cancelada',
        { itemId: fatura.id, contexto: { fatura_id: fatura.id, codigo: fatura.codigo_fatura } }
      );

      await createNotification(
        fatura.cliente_id,
        'Fatura cancelada',
        `Sua fatura #${fatura.codigo_fatura} foi cancelada pelo sistema.`,
        'financeiro',
        'faturas',
        fatura.id,
        'fatura_cancelada'
      );
    } catch (error: any) {
      console.error('Erro ao cancelar fatura:', error);
      toast.error(error?.message || 'Erro ao cancelar fatura.');
    }
  };

  const openCreateModal = async () => {
    setIsCreateModalOpen(true);
    try {
      const { data, error } = await supabase.from('clientes').select('id, nome, cpf, cnpj').eq('status', 'ativo').order('nome');
      if (error) throw error;
      if (data) setAvailableClients(data as unknown as Cliente[]);
    } catch (err) {
      toast.error('Erro ao carregar clientes.');
    }
  };

  const fetchOrdersForClient = async (cliente_id: string) => {
    if (!cliente_id) return;
    
    // Fetch OS com valor do orçamento
    const { data: os } = await supabase
      .from('ordens_servico')
      .select('id, codigo_os, orcamentos(total)')
      .eq('cliente_id', cliente_id)
      .eq('status', 'andamento');
      
    // Fetch OC com valor do orçamento
    const { data: oc } = await supabase
      .from('ordens_compra')
      .select('id, codigo_ordem, orcamentos(total)')
      .eq('cliente_id', cliente_id)
      .eq('status', 'em_analise');
      
    // Fetch OA com valor do orçamento
    const { data: oa } = await supabase
      .from('ordens_assinatura')
      .select('id, codigo_ordem, orcamentos(total)')
      .eq('cliente_id', cliente_id)
      .eq('status', 'em_analise');
    
    setAvailableOrders({
      os: (os || []).map(item => ({ ...item, valor: (item.orcamentos as any)?.total })),
      oc: (oc || []).map(item => ({ ...item, valor: (item.orcamentos as any)?.total })),
      oa: (oa || []).map(item => ({ ...item, valor: (item.orcamentos as any)?.total }))
    });
  };

  const handleCreateFatura = async () => {
    const { cliente_id, valor_total, data_vencimento, data_emissao, descricao, os_id, ordem_compra_id, ordem_assinatura_id, categoria } = newFaturaData;

    if (!cliente_id || !valor_total || !data_vencimento || !data_emissao) {
      toast.error('Preencha os campos obrigatorios.');
      return;
    }

    if (!os_id && !ordem_compra_id && !ordem_assinatura_id && !descricao.trim()) {
      toast.error('Informe a descricao para faturas sem vinculo.');
      return;
    }

    setIsCreatingFatura(true);
    try {
      const cleanValue = valor_total.replace(/[^\d]/g, '');
      const faturaValorNumerico = Number(cleanValue) / 100;

      if (isNaN(faturaValorNumerico) || faturaValorNumerico <= 0) {
        toast.error('O valor da fatura deve ser maior que zero.');
        setIsCreatingFatura(false);
        return;
      }

      const descricaoFatura = descricao || (
        os_id ? `Servico Prestado (OS: ${availableOrders.os.find(o => o.id === os_id)?.codigo_os})` :
        ordem_compra_id ? `Produto Adquirido (OC: ${availableOrders.oc.find(o => o.id === ordem_compra_id)?.codigo_ordem})` :
        ordem_assinatura_id ? `Assinatura Ativa (OA: ${availableOrders.oa.find(o => o.id === ordem_assinatura_id)?.codigo_ordem})` :
        'Venda Geral'
      );

      const session = getAdminSessionForRpc();
      const { data: faturaData, error: faturaError } = await supabase.rpc('gsa_admin_criar_fatura_manual', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cliente_id: cliente_id,
        p_valor_total: faturaValorNumerico,
        p_data_vencimento: data_vencimento,
        p_data_emissao: data_emissao,
        p_descricao: descricaoFatura,
        p_os_id: os_id || null,
        p_ordem_compra_id: ordem_compra_id || null,
        p_ordem_assinatura_id: ordem_assinatura_id || null,
        p_categoria: categoria || 'servico'
      });

      if (faturaError) throw faturaError;
      const faturaId = faturaData?.fatura_id;
      const codigo = faturaData?.codigo_fatura || 'FAT';

      toast.success('Fatura criada com sucesso!');
      setIsCreateModalOpen(false);

      setNewFaturaData({
        cliente_id: '', os_id: '', ordem_compra_id: '', ordem_assinatura_id: '',
        valor_total: '', data_vencimento: new Date().toISOString().split('T')[0],
        data_emissao: new Date().toISOString().split('T')[0],
        descricao: '',
        categoria: 'servico'
      });

      fetchFaturas(activeTab, searchRef.current, filtersRef.current);

      await logService.logAction({
        ator_tipo: 'colaborador',
        ator_id: colaboradorId,
        ator_nome: colaboradorNome,
        acao: 'CRIAR_FATURA',
        detalhes: `Criou a fatura #${codigo} no valor de ${formatCurrency(faturaValorNumerico)} para o cliente ${cliente_id}`
      });

      await notificationService.notifyClient(
        cliente_id,
        'Nova Fatura Gerada!',
        `Uma nova fatura no valor de ${formatCurrency(faturaValorNumerico)} foi gerada para voce. Vencimento: ${formatDate(data_vencimento)}.`,
        'financeiro',
        'fatura_gerada',
        { itemId: faturaId, contexto: { valor: faturaValorNumerico, vencimento: data_vencimento } }
      );

      await createNotification(
        cliente_id,
        'Nova Fatura Gerada!',
        `Uma nova fatura no valor de ${formatCurrency(faturaValorNumerico)} foi gerada para voce!`,
        'financeiro',
        'faturas',
        faturaId
      );
    } catch (error: any) {
      console.error('Erro ao criar fatura:', error);
      toast.error(error?.message || 'Erro ao criar fatura.');
    } finally {
      setIsCreatingFatura(false);
    }
  };

  const handleGerarOrdemFiscal = async (fatura: any) => {
    if (!fatura || isCreatingFatura) return;
    setIsCreatingFatura(true);
    
    try {
      const codigo = generateCode('FISC');
      const { error } = await supabase.from('ordens_fiscais').insert([{
        codigo_fiscal: codigo,
        fatura_id: fatura.id,
        cliente_id: fatura.cliente_id || null,
        cliente_nome: fatura.clientes?.nome || null,
        cliente_documento: fatura.clientes?.cnpj || fatura.clientes?.cpf || null,
        cliente_telefone: fatura.clientes?.telefone || null,
        tipo_compra: fatura.tipo === 'servico' ? 'servico' : (fatura.tipo === 'produto' ? 'produto' : 'servico'),
        descricao_item: fatura.observacoes || `Fatura #${fatura.codigo_fatura}`,
        valor_bruto: fatura.valor_total,
        valor_desconto: 0,
        valor_acrescimo: 0,
        valor_total: fatura.valor_total,
        status_pagamento: fatura.status === 'pago' ? 'pago' : 'pendente',
        status_emissao: 'pendente_emissao'
      }]);

      if (error) throw error;

      toast.success('Ordem fiscal gerada e enviada ao módulo fiscal!');
      setIsDetailOpen(false);
      fetchFaturas(activeTab, searchRef.current, filtersRef.current);
    } catch (error) {
      console.error('Erro ao gerar ordem fiscal:', error);
      toast.error('Erro ao gerar a ordem fiscal.');
    } finally {
      setIsCreatingFatura(false);
    }
  };

  const financeiroCards = [
    {
      id: 'faturas',
      title: 'Faturas',
      icon: FileText,
      badge: pendencies.financeiro_faturas_pendentes + pendencies.financeiro_faturas_vencidas,
      onClick: () => openFinanceSubmodule('faturas', 'pendentes')
    },
    {
      id: 'saques',
      title: 'Saques de Clientes',
      icon: ArrowDownCircle,
      badge: pendencies.financeiro_saques_pendentes,
      onClick: () => openFinanceSubmodule('clientes', 'saques')
    },
    {
      id: 'transferencias',
      title: 'Transferencias',
      icon: Repeat2,
      badge: pendencies.financeiro_transferencias_analise,
      onClick: () => openFinanceSubmodule('clientes', 'transferencias')
    },
    {
      id: 'prestadores',
      title: 'Financeiro de Prestadores',
      icon: Building2,
      badge: pendencies.financeiro_prestador_saques_pendentes,
      onClick: () => openFinanceSubmodule('prestadores_fin', 'saques')
    },
    {
      id: 'cobranca',
      title: 'Cobranca',
      icon: Gavel,
      badge: pendencies.moduleCobranca,
      onClick: () => openFinanceiroArea('cobranca')
    },
    {
      id: 'fiscal',
      title: 'Fiscal',
      icon: Receipt,
      badge: pendencies.moduleFiscal,
      onClick: () => openFinanceiroArea('fiscal')
    },
    {
      id: 'afiliados',
      title: 'Afiliados',
      icon: BadgePercent,
      badge: 0,
      onClick: () => openFinanceiroArea('afiliados')
    }
  ];

  if (!isSubmoduleOpen) {
    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
        <div className="rounded-[2rem] bg-[#1a1a1a] p-5 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-indigo-300">Painel ADM</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">Financeiro</h1>
            </div>
            <Landmark className="hidden h-10 w-10 text-white/10 sm:block" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {financeiroCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={card.onClick}
                className="group relative min-h-[150px] rounded-3xl border border-neutral-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-xl"
              >
                {card.badge > 0 && (
                  <span className="absolute right-4 top-4 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-[10px] font-black text-white">
                    {card.badge > 99 ? '99+' : card.badge}
                  </span>
                )}
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 transition-all group-hover:bg-indigo-600 group-hover:text-white">
                  <Icon className="h-7 w-7" />
                </span>
                <h2 className="mt-5 text-base font-black text-neutral-950">{card.title}</h2>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (financeiroSubmodule === 'cobranca') {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
        <button
          type="button"
          onClick={backToFinanceiroHome}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-700 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>
        <CobrancaModule
          initialTab={initialTab === 'cobranca' ? undefined : initialTab}
          initialItemId={initialItemId}
          colaboradorNome={colaboradorNome}
          onNavigate={(mod, tab, itemId) => onNavigate?.(mod, tab, itemId)}
        />
      </div>
    );
  }

  if (financeiroSubmodule === 'fiscal') {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
        <button
          type="button"
          onClick={backToFinanceiroHome}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-700 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>
        <FiscalModule
          initialItemId={initialItemId}
          colaboradorId={colaboradorId}
          colaboradorNome={colaboradorNome}
        />
      </div>
    );
  }

  if (financeiroSubmodule === 'afiliados') {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
        <button
          type="button"
          onClick={backToFinanceiroHome}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-700 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>
        <AffiliateAdminModule />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={backToFinanceiroHome}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-700 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>

        {mainTab === 'faturas' && (
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-2 rounded-full bg-[#1a1a1a] px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-indigo-600 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Gerar Fatura
          </button>
        )}
      </div>

      {/* Module Header */}
      <div className="hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col gap-3 md:gap-3">
          <div className="flex flex-row items-center justify-between gap-6 border-b border-white/5 pb-3">
            <div className="flex items-center gap-4">
              <div className="h-6 w-1 bg-indigo-500 rounded-full shadow-[0_0_20px_rgba(99,102,241,0.6)]"></div>
              <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-100 to-neutral-400 whitespace-nowrap overflow-hidden">
                Gestão Financeira
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {mainTab === 'faturas' && (
                <button
                  onClick={() => openCreateModal()}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  Nova Fatura
                </button>
              )}
              <Landmark className="hidden md:block h-8 w-8 text-white/5" />
            </div>
          </div>

          <div className="flex flex-wrap justify-center md:justify-start gap-1.5 w-full">
            {MAIN_TABS_WITH_BADGES.map((tab) => {
              const Icon = tab.icon;
              const isActive = mainTab === tab.id;

              return (
                <div key={tab.id} className="relative flex-none font-black translate-y-0 active:translate-y-1 transition-transform">
                  <button
                    onClick={() => handleMainTabClick(tab.id as any)}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 md:px-4 rounded-xl transition-all text-[7px] sm:text-[8px] md:text-[9.5px] uppercase tracking-widest border
                      ${isActive 
                        ? 'bg-white text-indigo-600 shadow-[0_10px_20px_rgba(0,0,0,0.3)] border-white border-b-4 border-b-indigo-500' 
                        : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border-white/5'}`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {tab.badge > 0 && (
                      <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white ring-2 ring-white/10 animate-pulse">
                        {tab.badge}
                      </span>
                    )}
                  </button>

                  {isActive && showSubTabs && (
                    <div className="absolute top-full left-0 mt-4 z-50 w-72 animate-in fade-in zoom-in-95 duration-200">
                      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 p-2 flex flex-col gap-1 overflow-hidden border border-neutral-100">
                        <div className="px-4 py-2 text-[7px] font-black text-neutral-400 uppercase tracking-[0.2em] border-b border-neutral-100 mb-1">
                          Selecione uma opção
                        </div>
                        {SUB_TABS[mainTab].map((sub, idx) => {
                          let subBadge = 0;
                          if (mainTab === 'faturas') {
                            if (sub.id === 'vencidas') subBadge = pendencies.financeiro_faturas_vencidas;
                            if (sub.id === 'pendentes') subBadge = pendencies.financeiro_faturas_pendentes;
                          } else if (mainTab === 'clientes') {
                            if (sub.id === 'saques') subBadge = pendencies.financeiro_saques_pendentes;
                            if (sub.id === 'transferencias') subBadge = pendencies.financeiro_transferencias_analise;
                          } else if (mainTab === 'prestadores_fin') {
                            if (sub.id === 'saques_rede') subBadge = pendencies.financeiro_prestador_saques_pendentes;
                          }

                          return (
                            <button
                              key={sub.id}
                              onClick={() => handleSubTabClick(sub.id)}
                              style={{ animationDelay: `${idx * 50}ms` }}
                              className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all hover:translate-x-1 border border-transparent ${
                                activeTab === sub.id
                                  ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                                  : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {sub.label}
                                {subBadge > 0 && (
                                  <span className="flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-red-500 px-1 text-[7px] font-black text-white">
                                    {subBadge}
                                  </span>
                                )}
                              </div>
                              {activeTab === sub.id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-200"></div>}
                            </button>
                          );
                        })}
                      </div>
                      {/* Visual Connector */}
                      <div className="absolute -top-1.5 left-6 w-3 h-3 bg-white rotate-45 rounded-sm border-l border-t border-neutral-100"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Unified Filter Component */}
      {mainTab !== 'prestadores_fin' && (
        <div className="flex justify-end px-2 mb-2">
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
                label: 'Mês de Vencimento',
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
      )}

      {/* Renderização de Conteúdo */}
      <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-sm ring-1 ring-black/5">
        {mainTab === 'prestadores_fin' ? (
          <div className="p-6">
            <PrestadoresFinanceiro subTab={activeTab} initialItemId={initialItemId} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            {activeTab === 'transferencias' ? (
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Data</th>
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Origem</th>
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Valor</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {transferencias.map((t) => (
                  <tr 
                    key={t.id} 
                    id={`transferencia-${t.id}`}
                    className={`group hover:bg-neutral-50/50 transition-colors ${
                      highlightedId === t.id 
                        ? 'bg-indigo-50/50 ring-2 ring-indigo-500 z-10 shadow-lg' 
                        : ''
                    }`}
                  >
                    <td className="px-6 py-4 text-xs font-bold text-neutral-600">{formatDateTime(t.data_solicitacao)}</td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-black text-neutral-900">{t.cliente_origem?.nome}</p>
                      <p className="text-[10px] text-neutral-400 uppercase">{t.cliente_origem?.cpf}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        t.status === 'aprovado' || t.status === 'concluido' ? 'bg-emerald-100 text-emerald-700' :
                        t.status === 'pendente' || t.status === 'em_analise' ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-black text-indigo-600">{formatCurrency(t.valor)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => { setSelectedTransferencia(t); setIsTransferenciaDetailOpen(true); }} className="p-2 hover:bg-white rounded-lg transition-all text-neutral-400 hover:text-indigo-600 shadow-sm border border-transparent hover:border-neutral-100">
                        <Info size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : activeTab === 'saques' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Cliente</th>
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Valor</th>
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {saques.map((s) => (
                  <tr 
                    key={s.id} 
                    id={`saque-${s.id}`}
                    className={`group hover:bg-neutral-50/50 transition-colors ${
                      highlightedId === s.id 
                        ? 'bg-indigo-50/50 ring-2 ring-indigo-500 z-10 shadow-lg' 
                        : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <p className="text-xs font-black text-neutral-900">{s.clientes?.nome}</p>
                      <p className="text-[10px] text-neutral-400 uppercase">{s.clientes?.cpf}</p>
                    </td>
                    <td className="px-6 py-4 font-black text-neutral-900">{formatCurrency(s.valor)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        s.status === 'pago' ? 'bg-emerald-100 text-emerald-700' :
                        s.status === 'pendente' ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => { setSelectedSaque(s); setIsSaqueDetailOpen(true); }} className="px-4 py-2 rounded-xl bg-neutral-50 text-neutral-600 text-[10px] font-black uppercase tracking-widest hover:bg-neutral-900 hover:text-white transition-all">
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Fatura</th>
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Cliente</th>
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Valor</th>
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Vencimento</th>
                  <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {faturas.map((f) => (
                  <tr 
                    key={f.id} 
                    id={`fatura-${f.id}`}
                    className={`group hover:bg-neutral-50/50 transition-colors ${
                      highlightedId === f.id 
                        ? 'bg-indigo-50/50 ring-2 ring-indigo-500 z-10 shadow-lg' 
                        : ''
                    }`}
                  >
                    <td className="px-6 py-4 text-xs font-black text-neutral-900 uppercase">#{f.codigo_fatura}</td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-black text-neutral-900">{f.clientes?.nome}</p>
                    </td>
                    <td className="px-6 py-4 font-black text-indigo-600">{formatCurrency(f.valor_total)}</td>
                    <td className="px-6 py-4 text-xs font-bold text-neutral-500">{formatDate(f.data_vencimento)}</td>
                    <td className="px-6 py-4">
                      {f.tem_cobranca ? (
                        <div className="flex flex-col gap-1">
                          <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 w-max">
                            {f.status}
                          </span>
                          <span className="px-2 py-0.5 rounded border border-rose-500/30 text-[8px] font-black uppercase text-rose-600 bg-rose-50 w-max flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                            Em Cobrança
                          </span>
                        </div>
                      ) : (
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          f.status === 'pago' ? 'bg-emerald-100 text-emerald-700' :
                          f.status === 'vencida' ? 'bg-rose-100 text-rose-700' :
                          f.status === 'fatura_negociada' ? 'bg-indigo-100 text-indigo-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {f.status.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {f.tem_cobranca && onNavigate ? (
                          <button 
                            onClick={() => onNavigate('cobranca', 'fila', f.id)} 
                            className="px-3.5 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white hover:border-transparent transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            Ver Cobrança
                          </button>
                        ) : null}
                        <button 
                          onClick={() => { setSelectedFatura(f); setIsDetailOpen(true); }} 
                          className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-md whitespace-nowrap cursor-pointer"
                        >
                          Gerenciar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Gerenciar Fatura" size="full">
        <div className="max-w-6xl mx-auto py-8">
          {selectedFatura && (
            <FaturaDetails 
              fatura={selectedFatura as any} 
              onManualPay={(method, dt, notes) => handleManualPayment(selectedFatura, method, dt, notes)} 
              onCancel={() => {
                setFaturaToCancel(selectedFatura);
                setCancelData({ ...cancelData, motivo: '' });
                setIsCancelFaturaModalOpen(true);
              }}
              onGerarFiscal={() => handleGerarOrdemFiscal(selectedFatura)}
              onEnviarParaCobranca={() => handleEnviarParaCobranca(selectedFatura)}
              colaboradorId={colaboradorId}
              colaboradorNome={colaboradorNome}
            />
          )}
        </div>
      </Modal>

      {/* Modal de Cancelamento de Fatura */}
      <Modal isOpen={isCancelFaturaModalOpen} onClose={() => setIsCancelFaturaModalOpen(false)} title="Cancelar Fatura" size="wide">
        <div className="space-y-4">
          <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-100">
            <p className="text-sm text-rose-800">
              Tem certeza que deseja cancelar esta fatura? Esta ação é irreversível.
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">Motivo do Cancelamento</label>
            <textarea
              value={cancelData.motivo}
              onChange={(e) => setCancelData({ ...cancelData, motivo: e.target.value })}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none"
              rows={3}
              placeholder="Descreva o motivo do cancelamento..."
            />
          </div>
          <div className="flex gap-4">
            <button onClick={() => setIsCancelFaturaModalOpen(false)} className="flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50 font-black uppercase tracking-widest text-[10px]">Voltar</button>
            <button 
              onClick={() => faturaToCancel && handleCancelFatura(faturaToCancel, cancelData.motivo)}
              disabled={!cancelData.motivo}
              className="flex-1 rounded-xl bg-rose-600 py-3 font-bold text-white shadow-lg shadow-rose-600/20 hover:bg-rose-700 disabled:opacity-50 font-black uppercase tracking-widest text-[10px]"
            >
              Confirmar Cancelamento
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isSaqueDetailOpen} onClose={() => setIsSaqueDetailOpen(false)} title="Detalhes do Saque" size="full">
        <div className="max-w-6xl mx-auto py-8">
          {selectedSaque && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Cliente</p>
                <p className="font-bold text-neutral-900">{selectedSaque.clientes?.nome}</p>
                <p className="text-[10px] text-neutral-500 uppercase">{selectedSaque.clientes?.cpf}</p>
              </div>
              <div className="rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
                <p className="text-[10px] font-bold text-neutral-400 uppercase">Valor do Saque</p>
                <p className="text-lg font-black text-indigo-600">{formatCurrency(selectedSaque.valor)}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-indigo-50/50 p-6 border-2 border-indigo-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Dados PIX ({selectedSaque.tipo_chave_pix?.toUpperCase()})</p>
                <p className="text-lg font-black text-indigo-900 font-mono select-all">
                  {selectedSaque.chave_pix}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center shadow-sm">
                <CreditCard className="text-indigo-600 h-6 w-6" />
              </div>
            </div>

            {/* Detalhamento Financeiro */}
            <div className="rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-5 space-y-3">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Detalhamento Financeiro</p>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-neutral-500">Valor Solicitado</span>
                <span className="text-sm font-black text-neutral-900">{formatCurrency(selectedSaque.valor)}</span>
              </div>
              {selectedSaque.taxa_aplicada != null && Number(selectedSaque.taxa_aplicada) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-neutral-500">Taxa Aplicada</span>
                  <span className="text-sm font-black text-rose-600">- {formatCurrency(selectedSaque.taxa_aplicada)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-3 border-t border-neutral-200">
                <span className="text-sm font-black text-neutral-900 uppercase">Valor Líquido a Pagar</span>
                <span className="text-xl font-black text-emerald-600">
                  {formatCurrency(selectedSaque.valor_liquido ?? selectedSaque.valor)}
                </span>
              </div>
            </div>

            <div className="flex gap-4">
              {selectedSaque.status === 'pendente' && (
                <>
                  <button 
                    onClick={() => handleAprovarSaque(selectedSaque)} 
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Check className="h-5 w-5" />
                    Aprovar
                  </button>
                  <button 
                    onClick={() => handleRejeitarSaque(selectedSaque)} 
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <X className="h-5 w-5" />
                    Rejeitar
                  </button>
                </>
              )}
              {selectedSaque.status !== 'pendente' && (
                <div className="w-full space-y-4">
                  {selectedSaque.status === 'cancelado' && selectedSaque.motivo_cancelamento && (
                    <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
                      <p className="text-[10px] font-bold text-rose-400 uppercase mb-1">Motivo da Rejeição</p>
                      <p className="text-sm font-medium text-rose-900">{selectedSaque.motivo_cancelamento}</p>
                    </div>
                  )}
                  <button 
                    onClick={() => setIsSaqueDetailOpen(false)} 
                    className="w-full rounded-xl bg-neutral-900 py-3 text-white font-bold"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </Modal>

      {/* Confirmation Modal for Saque */}
      <Modal
        isOpen={confirmModalSaque.isOpen}
        onClose={() => setConfirmModalSaque({ ...confirmModalSaque, isOpen: false })}
        title={confirmModalSaque.type === 'approve' ? 'Confirmar Aprovação' : 'Rejeitar Saque'}
        size="sm"
      >
        <div className="space-y-6">
          {confirmModalSaque.type === 'approve' ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
                <p className="text-sm text-emerald-800">
                  Confirma que a transferência de <strong>{formatCurrency(confirmModalSaque.saque?.valor_liquido || confirmModalSaque.saque?.valor || 0)}</strong> foi realizada com sucesso para o cliente? Informe a data do pagamento abaixo.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">Data do Pagamento</label>
                <input
                  type="date"
                  value={confirmModalSaque.dataPagamento}
                  onChange={(e) => setConfirmModalSaque({ ...confirmModalSaque, dataPagamento: e.target.value })}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none font-bold text-neutral-800"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-100 mb-4">
                <p className="text-sm text-rose-800">
                  O valor de <strong>{formatCurrency(confirmModalSaque.saque?.valor || 0)}</strong> será estornado para a carteira do cliente.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">Motivo da Rejeição</label>
                <textarea
                  value={confirmModalSaque.reason}
                  onChange={(e) => setConfirmModalSaque({ ...confirmModalSaque, reason: e.target.value })}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  rows={3}
                  placeholder="Ex: Chave PIX inválida..."
                />
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => setConfirmModalSaque({ ...confirmModalSaque, isOpen: false })}
              className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-bold text-neutral-600 hover:bg-neutral-50"
              disabled={isProcessingSaque}
            >
              Cancelar
            </button>
            <button
              onClick={confirmModalSaque.type === 'approve' ? confirmAprovarSaque : confirmRejeitarSaque}
              disabled={isProcessingSaque}
              className={`flex-1 rounded-xl py-3 text-sm font-bold text-white shadow-xl transition-all ${
                confirmModalSaque.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
              } disabled:opacity-50`}
            >
              {isProcessingSaque ? 'Processando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isTransferenciaDetailOpen} onClose={() => setIsTransferenciaDetailOpen(false)} title="Detalhes da Transferência" size="full">
        <div className="max-w-6xl mx-auto py-8">
          {selectedTransferencia && (
          <div className="space-y-5">

            {/* Data / Hora */}
            <div className="flex items-center gap-3 rounded-2xl bg-indigo-50 border border-indigo-100 px-5 py-4">
              <div className="flex-1">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Data &amp; Hora da Solicitação</p>
                <p className="text-base font-black text-indigo-900">{formatDateTime(selectedTransferencia.data_solicitacao)}</p>
              </div>
              {selectedTransferencia.data_analise && (
                <div className="flex-1 border-l border-indigo-200 pl-4">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Data de Análise</p>
                  <p className="text-sm font-bold text-indigo-800">{formatDateTime(selectedTransferencia.data_analise)}</p>
                </div>
              )}
            </div>

            {/* Origem → Destino */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-4 space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                  <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Remetente</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black text-neutral-900">{selectedTransferencia.cliente_origem?.nome}</p>
                  {selectedTransferencia.cliente_origem?.plano_vip && (
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tight shadow-sm ${
                      selectedTransferencia.cliente_origem.plano_vip === 'black' ? 'bg-black text-white ring-1 ring-white/20' :
                      selectedTransferencia.cliente_origem.plano_vip === 'platinum' ? 'bg-neutral-800 text-neutral-100' :
                      selectedTransferencia.cliente_origem.plano_vip === 'gold' ? 'bg-amber-100 text-amber-700' :
                      selectedTransferencia.cliente_origem.plano_vip === 'silver' ? 'bg-neutral-200 text-neutral-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {selectedTransferencia.cliente_origem.plano_vip}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-neutral-500 uppercase font-bold">{selectedTransferencia.cliente_origem?.cpf}</p>
                <div className="pt-2 mt-2 border-t border-neutral-200 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-neutral-400 font-bold uppercase">Carteira atual</span>
                    <span className="text-xs font-black text-emerald-600">{formatCurrency(selectedTransferencia.cliente_origem?.saldo_carteira || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-neutral-400 font-bold uppercase">Pontos</span>
                    <span className="text-xs font-black text-amber-600">{(selectedTransferencia.cliente_origem?.saldo_pontos || 0).toLocaleString('pt-BR')} pts</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-4 space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Destinatário</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black text-neutral-900">{selectedTransferencia.cliente_destino?.nome}</p>
                  {selectedTransferencia.cliente_destino?.plano_vip && (
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tight shadow-sm ${
                      selectedTransferencia.cliente_destino.plano_vip === 'black' ? 'bg-black text-white ring-1 ring-white/20' :
                      selectedTransferencia.cliente_destino.plano_vip === 'platinum' ? 'bg-neutral-800 text-neutral-100' :
                      selectedTransferencia.cliente_destino.plano_vip === 'gold' ? 'bg-amber-100 text-amber-700' :
                      selectedTransferencia.cliente_destino.plano_vip === 'silver' ? 'bg-neutral-200 text-neutral-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {selectedTransferencia.cliente_destino.plano_vip}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-neutral-500 uppercase font-bold">{selectedTransferencia.cliente_destino?.cpf}</p>
                <div className="pt-2 mt-2 border-t border-neutral-200 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-neutral-400 font-bold uppercase">Carteira atual</span>
                    <span className="text-xs font-black text-emerald-600">{formatCurrency(selectedTransferencia.cliente_destino?.saldo_carteira || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-neutral-400 font-bold uppercase">Pontos</span>
                    <span className="text-xs font-black text-amber-600">{(selectedTransferencia.cliente_destino?.saldo_pontos || 0).toLocaleString('pt-BR')} pts</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Valores — adapta conforme tipo (pontos ou dinheiro) */}
            {(() => {
              const isPontos = selectedTransferencia.tipo?.toLowerCase().includes('ponto');
              const fmt = (v: number) => isPontos
                ? `${Number(v).toLocaleString('pt-BR')} pts`
                : formatCurrency(v);

              return (
                <div className={`rounded-2xl ring-1 p-5 space-y-3 ${isPontos ? 'bg-amber-50 ring-amber-200' : 'bg-neutral-50 ring-neutral-200'}`}>
                  <div className="flex items-center gap-2 mb-3">
                    {isPontos ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-widest">
                        ⭐ Transferência de Pontos
                      </span>
                    ) : (
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Detalhamento Financeiro</p>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm font-bold ${isPontos ? 'text-amber-700' : 'text-neutral-500'}`}>{isPontos ? 'Pontos Enviados' : 'Valor Bruto'}</span>
                    <span className={`text-sm font-black ${isPontos ? 'text-amber-900' : 'text-neutral-900'}`}>{fmt(selectedTransferencia.valor)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-neutral-500">
                      Taxa Aplicada 
                      <span className="ml-2 text-[10px] font-black px-1.5 py-0.5 bg-neutral-100 rounded-md text-neutral-400">
                        {selectedTransferencia.valor > 0 ? (Math.round((Number(selectedTransferencia.taxa_aplicada || 0) / Number(selectedTransferencia.valor)) * 100)) : 0}%
                      </span>
                    </span>
                    <span className={`text-sm font-black ${Number(selectedTransferencia.taxa_aplicada || 0) > 0 ? 'text-rose-600' : 'text-neutral-400'}`}>
                      - {fmt(selectedTransferencia.taxa_aplicada || 0)}
                    </span>
                  </div>
                  {selectedTransferencia.valor_liquido != null && (
                    <div className={`flex justify-between items-center pt-3 border-t ${isPontos ? 'border-amber-200' : 'border-neutral-200'}`}>
                      <span className="text-sm font-black text-neutral-900 uppercase">{isPontos ? 'Pontos Recebidos' : 'Valor Líquido'}</span>
                      <span className={`text-lg font-black ${isPontos ? 'text-amber-600' : 'text-indigo-600'}`}>{fmt(selectedTransferencia.valor_liquido)}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Tipo / Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-neutral-50 ring-1 ring-neutral-200 p-4">
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Tipo de Transferência</p>
                {selectedTransferencia.tipo?.toLowerCase().includes('ponto') ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest">
                    ⭐ Pontos
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
                    💰 {selectedTransferencia.tipo || 'Dinheiro'}
                  </span>
                )}
              </div>
              <div className="rounded-xl bg-neutral-50 ring-1 ring-neutral-200 p-4">
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Status</p>
                <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                  selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido' ? 'bg-emerald-100 text-emerald-700' :
                  selectedTransferencia.status === 'pendente' || selectedTransferencia.status === 'em_analise' ? 'bg-amber-100 text-amber-700' :
                  'bg-rose-100 text-rose-700'
                }`}>
                  {selectedTransferencia.status}
                </span>
              </div>
            </div>

            {selectedTransferencia.motivo && (
              <div className="rounded-xl bg-blue-50 ring-1 ring-blue-100 p-4">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Motivo da Transferência</p>
                <p className="text-sm font-medium text-blue-900">{selectedTransferencia.motivo}</p>
              </div>
            )}

            {selectedTransferencia.observacoes_admin && (
              <div className="rounded-xl bg-amber-50 ring-1 ring-amber-100 p-4">
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Observações do Admin</p>
                <p className="text-sm font-medium text-amber-900">{selectedTransferencia.observacoes_admin}</p>
              </div>
            )}

            {/* Motivo de cancelamento */}
            {selectedTransferencia.status === 'cancelado' && selectedTransferencia.motivo_cancelamento && (
              <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-4">
                <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Motivo da Rejeição</p>
                <p className="text-sm font-medium text-rose-900">{selectedTransferencia.motivo_cancelamento}</p>
              </div>
            )}

            {/* Botões de ação */}
            <div className="flex gap-3">
              {(selectedTransferencia.status === 'pendente' || selectedTransferencia.status === 'em_analise') ? (
                <>
                  <button
                    onClick={() => handleAprovarTransferencia(selectedTransferencia)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Check className="h-5 w-5" />
                    Aprovar
                  </button>
                  <button
                    onClick={() => handleRejeitarTransferencia(selectedTransferencia)}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <X className="h-5 w-5" />
                    Rejeitar
                  </button>
                </>
              ) : (selectedTransferencia.status === 'concluido' || selectedTransferencia.status === 'aprovado') ? (
                <>
                  <button
                    onClick={() => handleEstornarTransferencia(selectedTransferencia)}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <History className="h-5 w-5" />
                    Estornar Transferência
                  </button>
                  <button
                    onClick={() => setIsTransferenciaDetailOpen(false)}
                    className="flex-1 rounded-xl bg-neutral-900 py-3 text-white font-bold hover:bg-black transition-all"
                  >
                    Fechar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsTransferenciaDetailOpen(false)}
                  className="w-full rounded-xl bg-neutral-900 py-3 text-white font-bold hover:bg-black transition-all"
                >
                  Fechar
                </button>
              )}
            </div>
          </div>
        )}
        </div>
      </Modal>

      {/* Modal de Confirmação de Transferência */}
      <Modal
        isOpen={confirmModalTransferencia.isOpen}
        onClose={() => setConfirmModalTransferencia({ ...confirmModalTransferencia, isOpen: false })}
        title={
          confirmModalTransferencia.type === 'approve' ? 'Confirmar Aprovação' : 
          confirmModalTransferencia.type === 'reject' ? 'Rejeitar Transferência' : 
          'Estornar Transferência Concluída'
        }
        size="sm"
      >
        <div className="space-y-6">
          {confirmModalTransferencia.type === 'approve' ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
                <p className="text-sm text-emerald-800">
                  Confirma a aprovação desta transferência? Informe a data em que o pagamento foi realizado.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">Data do Pagamento</label>
                <input
                  type="date"
                  value={confirmModalTransferencia.dataPagamento}
                  onChange={(e) => setConfirmModalTransferencia({ ...confirmModalTransferencia, dataPagamento: e.target.value })}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none font-bold text-neutral-800"
                />
              </div>
            </div>
          ) : confirmModalTransferencia.type === 'rollback' ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
                <p className="text-sm text-amber-800 font-bold">ATENÇÃO: Esta ação é irreversível.</p>
                <p className="text-xs text-amber-700 mt-1">
                  O valor será debitado do destinatário e devolvido ao remetente. Informe o motivo do estorno.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">Motivo do Estorno</label>
                <textarea
                  value={confirmModalTransferencia.reason}
                  onChange={(e) => setConfirmModalTransferencia({ ...confirmModalTransferencia, reason: e.target.value })}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  rows={3}
                  placeholder="Ex: Erro no valor / Solicitação do cliente..."
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-100">
                <p className="text-sm text-rose-800">Informe o motivo da rejeição desta transferência.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">Motivo da Rejeição</label>
                <textarea
                  value={confirmModalTransferencia.reason}
                  onChange={(e) => setConfirmModalTransferencia({ ...confirmModalTransferencia, reason: e.target.value })}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  rows={3}
                  placeholder="Ex: Dados inconsistentes..."
                />
              </div>
            </div>
          )}
          <div className="flex gap-4">
            <button
              onClick={() => setConfirmModalTransferencia({ ...confirmModalTransferencia, isOpen: false })}
              className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-bold text-neutral-600 hover:bg-neutral-50"
              disabled={isProcessingTransferencia}
            >
              Cancelar
            </button>
            <button
              onClick={confirmModalTransferencia.type === 'approve' ? confirmAprovarTransferencia : (confirmModalTransferencia.type === 'reject' ? confirmRejeitarTransferencia : confirmEstornarTransferencia)}
              disabled={isProcessingTransferencia}
              className={`flex-1 rounded-xl py-3 text-sm font-bold text-white shadow-xl transition-all ${
                confirmModalTransferencia.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 
                confirmModalTransferencia.type === 'reject' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20' : 
                'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
              } disabled:opacity-50`}
            >
              {isProcessingTransferencia ? 'Processando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de Criação de Fatura */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Criar Nova Fatura" size="wide">
        <div className="space-y-8 py-2">
          {/* Header Legend */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
            <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center border border-neutral-100">
              <Plus className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase text-neutral-900 tracking-wider">Nova Cobrança</p>
              <p className="text-[10px] text-neutral-400 font-medium">Preencha os campos abaixo para gerar uma nova fatura administrativa.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {/* Cliente */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                <Send className="h-3 w-3" /> Cliente *
              </label>
              <select 
                value={newFaturaData.cliente_id}
                onChange={async (e) => {
                  const cid = e.target.value;
                  setNewFaturaData({ ...newFaturaData, cliente_id: cid, os_id: '', ordem_compra_id: '', ordem_assinatura_id: '' });
                  await fetchOrdersForClient(cid);
                }}
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              >
                <option value="">Selecione o Cliente</option>
                {availableClients.map(c => (
                  <option key={c.id} value={c.id}>{c.nome} ({c.cpf || c.cnpj})</option>
                ))}
              </select>
            </div>

            {/* Vínculo */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                <FileText className="h-3 w-3" /> Vínculo Opcional
              </label>
              <select 
                value={newFaturaData.os_id ? `os:${newFaturaData.os_id}` : (newFaturaData.ordem_compra_id ? `oc:${newFaturaData.ordem_compra_id}` : (newFaturaData.ordem_assinatura_id ? `oa:${newFaturaData.ordem_assinatura_id}` : ''))}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setNewFaturaData({ ...newFaturaData, os_id: '', ordem_compra_id: '', ordem_assinatura_id: '' });
                    return;
                  }
                  const [type, id] = val.split(':');
                  setNewFaturaData({ 
                    ...newFaturaData, 
                    os_id: type === 'os' ? id : '',
                    ordem_compra_id: type === 'oc' ? id : '',
                    ordem_assinatura_id: type === 'oa' ? id : ''
                  });
                }}
                disabled={!newFaturaData.cliente_id}
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all disabled:bg-neutral-50 disabled:text-neutral-300"
              >
                <option value="">Nenhum Vínculo (Avulsa)</option>
                {availableOrders.os.length > 0 && <optgroup label="Ordens de Serviço">
                  {availableOrders.os.map(o => <option key={o.id} value={`os:${o.id}`}>OS: {o.codigo_os}</option>)}
                </optgroup>}
                {availableOrders.oc.length > 0 && <optgroup label="Ordens de Compra">
                  {availableOrders.oc.map(o => <option key={o.id} value={`oc:${o.id}`}>Compra: {o.codigo_ordem}</option>)}
                </optgroup>}
                {availableOrders.oa.length > 0 && <optgroup label="Assinaturas">
                  {availableOrders.oa.map(o => <option key={o.id} value={`oa:${o.id}`}>Assinatura: {o.codigo_ordem}</option>)}
                </optgroup>}
              </select>
            </div>

            {/* Categoria (Chips) */}
            {!newFaturaData.os_id && !newFaturaData.ordem_compra_id && !newFaturaData.ordem_assinatura_id && (
              <div className="md:col-span-2 space-y-3 p-4 rounded-2xl bg-neutral-50 border border-dotted border-neutral-200">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1 block">Natureza da Fatura *</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'servico', label: 'Serviço', icon: ClipboardList },
                    { id: 'produto', label: 'Produto', icon: Building2 },
                    { id: 'assinatura', label: 'Assinatura', icon: CreditCard }
                  ].map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = newFaturaData.categoria === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setNewFaturaData({ ...newFaturaData, categoria: cat.id as any })}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
                          isSelected 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20 active:scale-95' 
                            : 'bg-white border-neutral-100 text-neutral-400 hover:border-neutral-200'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Valor */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                <Landmark className="h-3 w-3" /> Valor Total *
              </label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-neutral-400 group-focus-within:text-indigo-600 transition-colors">R$</span>
                <input 
                  type="text"
                  placeholder="0,00"
                  value={newFaturaData.valor_total}
                  onChange={e => {
                    const value = e.target.value.replace(/\D/g, "");
                    const formattedValue = (Number(value) / 100).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    });
                    setNewFaturaData({ ...newFaturaData, valor_total: formattedValue });
                  }}
                  className="w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-4 py-3.5 text-sm font-black text-neutral-800 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-neutral-300"
                />
              </div>
            </div>

            {/* Emissão */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                <Calendar className="h-3 w-3" /> Data de Emissão *
              </label>
              <input 
                type="date"
                value={newFaturaData.data_emissao}
                onChange={e => setNewFaturaData({ ...newFaturaData, data_emissao: e.target.value })}
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* Vencimento */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                <History className="h-3 w-3" /> Data de Vencimento *
              </label>
              <input 
                type="date"
                value={newFaturaData.data_vencimento}
                onChange={e => setNewFaturaData({ ...newFaturaData, data_vencimento: e.target.value })}
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* Descrição */}
            <div className="md:col-span-2 space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                <MessageSquare className="h-3 w-3" /> Descritivo da Fatura {!newFaturaData.os_id && !newFaturaData.ordem_compra_id && !newFaturaData.ordem_assinatura_id && '*'}
              </label>
              <textarea 
                placeholder="Ex: Consultoria extra de marketing / Fornecimento de licenças..."
                value={newFaturaData.descricao}
                onChange={e => setNewFaturaData({ ...newFaturaData, descricao: e.target.value })}
                rows={3}
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-4 text-sm font-medium text-neutral-700 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all resize-none placeholder:text-neutral-300"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-neutral-100">
            <button 
              onClick={() => setIsCreateModalOpen(false)} 
              className="flex-1 order-2 sm:order-1 rounded-xl border border-neutral-200 py-4 font-black uppercase tracking-widest text-[10px] text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={handleCreateFatura}
              disabled={isCreatingFatura || !newFaturaData.cliente_id || !newFaturaData.valor_total}
              className="flex-1 order-1 sm:order-2 rounded-xl bg-indigo-600 py-4 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isCreatingFatura ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle className="h-5 w-5" />
                  Finalizar e Gerar Fatura
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function FaturaDetails({ 
  fatura, 
  onManualPay, 
  onCancel,
  onGerarFiscal,
  onEnviarParaCobranca,
  colaboradorId,
  colaboradorNome
}: { 
  fatura: any, 
  onManualPay?: (method: string, dateTime: string, notes: string) => void,
  onCancel?: () => void,
  onGerarFiscal?: () => void,
  onEnviarParaCobranca?: () => void,
  colaboradorId?: string,
  colaboradorNome?: string
}) {
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDateTime, setPaymentDateTime] = useState(new Date().toISOString().slice(0, 16));
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [enviandoParaCobranca, setEnviandoParaCobranca] = useState(false);
  
  // Acordo / Negociação (mantido para compatibilidade)
  const [isNegotiating, setIsNegotiating] = useState(false);
  const [acordoData, setAcordoData] = useState({
    novoValor: String(fatura.valor_total).replace('.', ','),
    novaDataVencimento: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString().split('T')[0],
    motivo: ''
  });
  const [processandoAcordo, setProcessandoAcordo] = useState(false);

  // Auto-envio para cobrança ao abrir modal de fatura vencida sem cobrança
  useEffect(() => {
    if (
      fatura.status === 'vencida' &&
      !fatura.tem_cobranca &&
      onEnviarParaCobranca
    ) {
      onEnviarParaCobranca();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contestação
  const [contestacao, setContestacao] = useState<any | null>(undefined); // undefined = carregando
  const [respostaAdmin, setRespostaAdmin] = useState('');
  const [processandoContestacao, setProcessandoContestacao] = useState(false);

  useEffect(() => {
    const fetchContestacao = async () => {
      const { data } = await supabase
        .from('fatura_contestacoes')
        .select('*')
        .eq('fatura_id', fatura.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setContestacao(data || null);
    };
    fetchContestacao();
  }, [fatura.id]);

  const handleResponderContestacao = async (novoStatus: 'resolvida' | 'recusada') => {
    if (!contestacao) return;
    if (!respostaAdmin.trim()) { return; }
    setProcessandoContestacao(true);
    try {
      const { error } = await supabase
        .from('fatura_contestacoes')
        .update({ status: novoStatus, resposta_admin: respostaAdmin.trim(), updated_at: new Date().toISOString() })
        .eq('id', contestacao.id);
      if (error) throw error;

      // Notifica o cliente
      const emoji = novoStatus === 'resolvida' ? '✅' : '❌';
      await createNotification(
        fatura.cliente_id,
        `Contestação ${novoStatus === 'resolvida' ? 'Resolvida' : 'Recusada'} ${emoji}`,
        `Sua contestação da fatura #${fatura.codigo_fatura} foi ${novoStatus === 'resolvida' ? 'resolvida' : 'recusada'}. Confira a resposta no portal.`,
        'financeiro',
        'faturas',
        fatura.id,
        'contestacao_respondida'
      );

      setContestacao((prev: any) => ({ ...prev, status: novoStatus, resposta_admin: respostaAdmin.trim() }));
      toast.success(`Contestação ${novoStatus === 'resolvida' ? 'marcada como resolvida' : 'recusada'} com sucesso!`);
    } catch (err) {
      console.error('Erro ao responder contestação:', err);
      toast.error('Erro ao processar a contestação.');
    } finally {
      setProcessandoContestacao(false);
    }
  };

  // Ajuste de valor
  const [ajusteDesconto, setAjusteDesconto] = useState(String(fatura.desconto_manual || ''));
  const [ajusteAcrescimo, setAjusteAcrescimo] = useState(String(fatura.acrescimo_manual || ''));
  const [ajusteMotivo, setAjusteMotivo] = useState('');
  const [aplicandoAjuste, setAplicandoAjuste] = useState(false);

  const handleAplicarAjuste = async () => {
    const desconto = parseFloat(ajusteDesconto) || 0;
    const acrescimo = parseFloat(ajusteAcrescimo) || 0;
    if (!ajusteMotivo.trim()) return toast.error('Informe o motivo do ajuste.');
    if (desconto < 0 || acrescimo < 0) return toast.error('Os valores nao podem ser negativos.');
    setAplicandoAjuste(true);
    try {
      const session = sessionService.getCurrentSession();
      if (!session?.sessaoId || !session?.sessionToken) {
        throw new Error('Sessao administrativa expirada. Faca login novamente.');
      }

      const { data, error } = await supabase.rpc('gsa_admin_aplicar_ajuste_fatura', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_fatura_id: fatura.id,
        p_desconto: desconto,
        p_acrescimo: acrescimo,
        p_motivo: ajusteMotivo.trim()
      });

      if (error) throw error;

      const novoTotal = Number(data?.valor_total ?? 0);
      const baseOriginal = Number(data?.valor_base_original ?? fatura.valor_base_original ?? fatura.valor_total);
      const novoHistorico = data?.historico_ajustes || fatura.historico_ajustes || [];

      let detalheAjuste = '';
      if (acrescimo > 0 && desconto > 0) {
        detalheAjuste = `• *Acréscimo:* + ${formatCurrency(acrescimo)}\n• *Desconto:* - ${formatCurrency(desconto)}`;
      } else if (acrescimo > 0) {
        detalheAjuste = `• *Acréscimo Aplicado:* + ${formatCurrency(acrescimo)}`;
      } else if (desconto > 0) {
        detalheAjuste = `• *Desconto Aplicado:* - ${formatCurrency(desconto)}`;
      } else {
        detalheAjuste = `• *Ajuste de Valor:* Valor atualizado`;
      }

      const mensagemNotificacao = [
        `Informamos que houve um ajuste nos valores da sua fatura *#${fatura.codigo_fatura}*.`,
        ``,
        `📊 *DETALHES DO AJUSTE:*`,
        `• *Valor Anterior:* ${formatCurrency(baseOriginal)}`,
        detalheAjuste,
        `• *Novo Valor Total:* *${formatCurrency(novoTotal)}*`,
        `• *Motivo / Justificativa:* _${ajusteMotivo.trim()}_`,
        ``,
        `▶️ *PRÓXIMO PASSO:*`,
        `Acesse o Portal do Cliente GSA para conferir os detalhes e realizar o pagamento.`
      ].join('\n');

      await createNotification(
        fatura.cliente_id,
        'Fatura Atualizada',
        mensagemNotificacao,
        'financeiro',
        'faturas',
        fatura.id,
        'ajuste_fatura'
      );

      await logService.logAction({
        ator_tipo: 'colaborador',
        ator_id: (window as any).colaborador_id,
        ator_nome: (window as any).colaborador_nome,
        acao: 'AJUSTE_FINANCEIRO_MANUAL',
        detalhes: `Ajuste manual na fatura ${fatura.codigo_fatura}: Novo valor ${formatCurrency(novoTotal)}. Desconto: ${formatCurrency(desconto)}, Acrescimo: ${formatCurrency(acrescimo)}. Motivo: ${ajusteMotivo.trim()}`
      });

      toast.success(`Ajuste aplicado! Novo valor: ${formatCurrency(novoTotal)}`);
      fatura.valor_total = novoTotal;
      fatura.valor_final_pendente = Math.max(0, novoTotal - Number(fatura.valor_pago || 0));
      fatura.desconto_manual = desconto;
      fatura.acrescimo_manual = acrescimo;
      fatura.valor_base_original = baseOriginal;
      fatura.historico_ajustes = novoHistorico;
      setAjusteMotivo('');
      setAjusteDesconto('');
      setAjusteAcrescimo('');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao aplicar ajuste.');
    } finally {
      setAplicandoAjuste(false);
    }
  };

  const handleSendFaturaWithPDF = async () => {
    try {
      setIsGeneratingPDF(true);
      toast.loading('Gerando PDF da fatura...', { id: 'pdf-toast' });
      
      const os = fatura.ordens_servico;
      const doc = await generateFaturaPDF(fatura, fatura.clientes, os, { returnDoc: true }) as any;
      if (!doc) throw new Error("Erro ao gerar PDF");

      const pdfBase64 = doc.output('datauristring');

      const mensagemBase = whatsappNotificationService.gerarMensagemWhatsApp({
        tipo: 'fatura',
        clienteNome: fatura.clientes?.nome,
        codigo: fatura.codigo_fatura,
        status: fatura.status === 'pago' ? 'Paga' : fatura.status === 'vencida' ? 'Vencida' : fatura.status === 'cancelado' ? 'Cancelada' : 'Pendente',
        dataVencimento: fatura.data_vencimento ? formatDate(fatura.data_vencimento) : undefined,
        valorTotal: formatCurrency(fatura.valor_total)
      });

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(
        fatura.clientes?.telefone, 
        mensagemBase,
        {
          mediaBase64: pdfBase64,
          fileName: `fatura_${fatura.codigo_fatura}.pdf`
        }
      );

      if (sent) {
        toast.success('✅ PDF da fatura e notificação enviados no WhatsApp!', { id: 'pdf-toast' });
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao enviar notificação com PDF', { id: 'pdf-toast' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const details = getFaturaDetails(fatura);

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      {/* Coluna Principal (Conteúdo) */}
      <div className="w-full xl:w-2/3 space-y-6">
        
        {/* Cabeçalho Premium da Fatura */}
        <div className="relative rounded-[2.5rem] bg-[#1a1a1a] p-8 text-white shadow-2xl">
          <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] pointer-events-none">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none"></div>
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-300 ring-1 ring-white/20">
                Fatura Gerada
              </span>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white uppercase mt-1">
                #{fatura.codigo_fatura}
              </h2>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-bold text-neutral-400">
                <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl"><Calendar className="h-4 w-4" /> Emissão: {formatDate(fatura.data_emissao || fatura.created_at || fatura.data_vencimento)}</span>
                <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-xl"><Clock className="h-4 w-4" /> Vencimento: <span className="text-white">{formatDate(fatura.data_vencimento)}</span></span>
              </div>
            </div>
            
            <div className="flex flex-col items-start md:items-end gap-2">
              <div className="flex items-center gap-2">
                <div className="bg-white/10 p-1 rounded-2xl backdrop-blur-sm">
                  <AdminWhatsAppButton 
                    telefone={fatura.clientes?.telefone}
                    isGeneratingPDF={isGeneratingPDF}
                    onSendWithPDF={handleSendFaturaWithPDF}
                    mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                      tipo: 'fatura',
                      clienteNome: fatura.clientes?.nome,
                      codigo: fatura.codigo_fatura,
                      status: fatura.status === 'pago' ? 'Paga' : fatura.status === 'vencida' ? 'Vencida' : fatura.status === 'cancelado' ? 'Cancelada' : 'Pendente',
                      dataVencimento: fatura.data_vencimento ? formatDate(fatura.data_vencimento) : undefined,
                      valorTotal: formatCurrency(fatura.valor_total)
                    })}
                  />
                </div>
                <span className={`inline-flex items-center justify-center px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg ${
                  fatura.status === 'pago' ? 'bg-emerald-500 text-white shadow-emerald-500/30' :
                  fatura.status === 'vencida' ? 'bg-rose-500 text-white shadow-rose-500/30' :
                  fatura.status === 'fatura_negociada' ? 'bg-indigo-500 text-white shadow-indigo-500/30' :
                  'bg-amber-500 text-white shadow-amber-500/30'
                }`}>
                  {fatura.status.replace('_', ' ')}
                </span>
              </div>
              {fatura.tem_cobranca && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-500/20 text-rose-300 text-[10px] font-black uppercase tracking-widest ring-1 ring-rose-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  Em Cobrança
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Informações do Cliente */}
        <div className="rounded-3xl bg-white p-6 ring-1 ring-neutral-200 shadow-sm relative overflow-hidden group">
          <div className="absolute right-0 top-0 h-full w-2 bg-indigo-500 opacity-0 transition-opacity group-hover:opacity-100"></div>
          <h4 className="mb-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
            <User className="h-4 w-4 text-indigo-500" />
            Dados do Cliente
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-1">Nome / Razão Social</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-neutral-900">{fatura.clientes?.nome || 'N/A'}</p>
                {fatura.clientes?.plano_vip && (
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tight shadow-sm ${
                    fatura.clientes.plano_vip === 'black' ? 'bg-black text-white ring-1 ring-white/20' :
                    fatura.clientes.plano_vip === 'platinum' ? 'bg-neutral-800 text-neutral-100' :
                    fatura.clientes.plano_vip === 'gold' ? 'bg-amber-100 text-amber-700' :
                    fatura.clientes.plano_vip === 'silver' ? 'bg-neutral-200 text-neutral-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {fatura.clientes.plano_vip}
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-1">Documento (CPF/CNPJ)</p>
              <p className="text-sm font-bold text-neutral-900 font-mono">{fatura.clientes?.cnpj || fatura.clientes?.cpf || 'N/A'}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-wider mb-1">Contato</p>
              <p className="text-sm font-bold text-neutral-900">{fatura.clientes?.telefone || 'N/A'}</p>
              <p className="text-xs font-medium text-neutral-500 truncate">{fatura.clientes?.email || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Detalhamento Financeiro (Tabela de Itens) */}
        <div className="rounded-3xl bg-white ring-1 ring-neutral-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-neutral-100 bg-neutral-50/50">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-indigo-500" />
              Itens Faturados
            </h4>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b-2 border-neutral-100">
                    <th className="pb-3 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Descrição do Item</th>
                    <th className="pb-3 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-center">Qtd</th>
                    <th className="pb-3 px-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-right whitespace-nowrap">V. Unitário</th>
                    <th className="pb-3 pl-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest text-right whitespace-nowrap">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {Array.isArray(fatura.itens_faturados) && fatura.itens_faturados.length > 0 ? (
                    fatura.itens_faturados.map((item: any, idx: number) => (
                      <tr key={idx} className="group hover:bg-neutral-50/50 transition-colors">
                        <td className="py-4 pr-4">
                          <p className="text-xs font-bold text-neutral-800">{item.descricao || item.nome || 'Produto/Serviço'}</p>
                          {item.codigo && <span className="text-[9px] font-mono text-neutral-400">{item.codigo}</span>}
                        </td>
                        <td className="py-4 text-center text-xs font-bold text-neutral-600">
                          {item.quantidade || 1}
                        </td>
                        <td className="py-4 px-4 text-right text-xs font-bold text-neutral-600 whitespace-nowrap">
                          {formatCurrency(item.valor_unitario || item.valor || 0)}
                        </td>
                        <td className="py-4 pl-4 text-right text-sm font-black text-neutral-900 whitespace-nowrap">
                          {formatCurrency(item.subtotal || ((item.quantidade || 1) * (item.valor_unitario || item.valor || 0)))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="group hover:bg-neutral-50/50 transition-colors">
                      <td className="py-4 pr-4">
                        <p className="text-xs font-bold text-neutral-800">{details.itemLabel}</p>
                      </td>
                      <td className="py-4 text-center text-xs font-bold text-neutral-600">
                        {details.quantidade || 1}
                      </td>
                      <td className="py-4 px-4 text-right text-xs font-bold text-neutral-600 whitespace-nowrap">
                        {formatCurrency(details.valorItem)}
                      </td>
                      <td className="py-4 pl-4 text-right text-sm font-black text-neutral-900 whitespace-nowrap">
                        {formatCurrency(details.valorItem * (details.quantidade || 1))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Resumo Financeiro */}
            <div className="flex justify-end pt-4 border-t border-neutral-100">
              <div className="w-full sm:w-1/2 lg:w-1/3 space-y-3">
                <div className="flex justify-between items-center text-xs font-bold text-neutral-500">
                  <span>Subtotal Base</span>
                  <span>{formatCurrency(fatura.valor_base_original || fatura.valor_total)}</span>
                </div>
                
                {fatura.acrescimo_manual > 0 && (
                  <div className="flex justify-between items-center text-xs font-bold text-amber-600">
                    <span>Acréscimos</span>
                    <span>+ {formatCurrency(fatura.acrescimo_manual)}</span>
                  </div>
                )}
                
                {fatura.desconto_manual > 0 && (
                  <div className="flex justify-between items-center text-xs font-bold text-emerald-600">
                    <span>Descontos</span>
                    <span>- {formatCurrency(fatura.desconto_manual)}</span>
                  </div>
                )}

                {/* Exibição adicional para assinaturas se baseada no pedido antigo */}
                {fatura.tipo === 'assinatura' && details.quantidade_meses && (
                   <div className="flex justify-between items-center text-[10px] text-indigo-500 font-bold uppercase">
                     <span>Duração</span>
                     <span>{details.quantidade_meses} Meses</span>
                   </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-neutral-200">
                  <span className="text-sm font-black text-neutral-900 uppercase tracking-widest">Total Final</span>
                  <span className="text-2xl font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl">
                    {formatCurrency(fatura.valor_total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Composição do Pagamento (Apenas se pago) */}
        {fatura.status === 'pago' && (() => {
          const voucherDesc = Number(fatura.desconto_voucher_aplicado) || 0;
          const pontosDesc  = Number(fatura.desconto_pontos_aplicado)  || 0;
          const carteiraDesc= Number(fatura.abatimento_carteira_aplicado) || 0;
          const pagamentosArr = Array.isArray(fatura.pagamentos) ? fatura.pagamentos : [];
          if (!voucherDesc && !pontosDesc && !carteiraDesc && !pagamentosArr.length) return null;
          const metodoLabel = (m) => ({
            pix: 'PIX', credit_card: 'Cartão de Crédito',
            cartao: 'Cartão de Crédito', boleto: 'Boleto',
            infinitepay: 'InfinitePay', manual: 'Manual', dinheiro: 'Dinheiro', debito: 'Débito'
          }[m?.toLowerCase()] || m || 'Pagamento');
          
          return (
            <div className="rounded-3xl bg-emerald-50 p-6 ring-1 ring-emerald-100 shadow-sm space-y-4">
              <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Composição do Pagamento
              </h4>
              {fatura.observacoes && (
                 <div className="p-4 rounded-xl bg-white border border-indigo-100 text-xs font-medium text-indigo-900 whitespace-pre-wrap leading-relaxed">
                   <span className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">
                     Histórico / Observações
                   </span>
                   {fatura.observacoes}
                 </div>
              )}
              
              <div className="space-y-2 bg-white p-4 rounded-2xl">
                {voucherDesc > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-700 font-bold flex items-center gap-2"><Ticket className="h-4 w-4" /> Voucher (desconto)</span>
                    <span className="font-black text-emerald-700">- {formatCurrency(voucherDesc)}</span>
                  </div>
                )}
                {pontosDesc > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-indigo-700 font-bold flex items-center gap-2"><History className="h-4 w-4" /> Pontos</span>
                    <span className="font-black text-indigo-700">- {formatCurrency(pontosDesc)}</span>
                  </div>
                )}
                {carteiraDesc > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-violet-700 font-bold flex items-center gap-2"><Wallet className="h-4 w-4" /> Saldo da Carteira</span>
                    <span className="font-black text-violet-700">- {formatCurrency(carteiraDesc)}</span>
                  </div>
                )}
                {(() => {
                  const externalPagamentos = pagamentosArr.filter((p: any) => !['voucher', 'pontos', 'carteira'].includes(p.metodo?.toLowerCase()));
                  const hasNotes = !!fatura.observacoes;
                  if (externalPagamentos.length > 0) {
                    return externalPagamentos.map((p: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-neutral-700 font-bold flex items-center gap-2"><CreditCard className="h-4 w-4" /> {metodoLabel(p.metodo)}{hasNotes ? ' - Baixa realizada manualmente pelo financeiro' : ''}</span>
                        <span className="font-black text-neutral-900">{formatCurrency(p.valor)}</span>
                      </div>
                    ));
                  }
                  if (fatura.status === 'pago') {
                    const valorTotalFatura = Number(fatura.valor_pago || fatura.valor_total || 0);
                    if (valorTotalFatura > 0) {
                      const metodo = fatura.forma_pagamento_escolhida || 'PIX';
                      return (
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-700 font-bold flex items-center gap-2"><CreditCard className="h-4 w-4" /> {metodoLabel(metodo)}{hasNotes ? ' - Baixa realizada manualmente pelo financeiro' : ''}</span>
                          <span className="font-black text-neutral-900">{formatCurrency(valorTotalFatura)}</span>
                        </div>
                      );
                    }
                  }
                  return null;
                })()}
              </div>
              
              <div className="flex justify-between items-center pt-3 px-4 border-t border-emerald-200">
                <span className="text-sm font-black text-emerald-800 uppercase tracking-tight">Total Pago Real</span>
                <span className="text-xl font-black text-emerald-700">{formatCurrency(fatura.valor_pago || fatura.valor_total)}</span>
              </div>
            </div>
          );
        })()}

        {fatura.status === 'pago' && fatura.tipo === 'servico' && (
          <PainelRentabilidade tipo="realizado" faturaId={fatura.id} />
        )}

        {/* Contestação Panel */}
        {contestacao !== undefined && contestacao !== null && (
          <div className={`rounded-3xl p-6 ring-1 shadow-sm space-y-4 ${
            contestacao.status === 'resolvida' ? 'bg-emerald-50 ring-emerald-200' :
            contestacao.status === 'recusada' ? 'bg-red-50 ring-red-200' :
            'bg-orange-50 ring-orange-200'
          }`}>
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-black text-neutral-700 uppercase tracking-widest flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-orange-500" />
                Contestação do Cliente
              </h4>
              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                contestacao.status === 'resolvida' ? 'bg-emerald-100 text-emerald-700' :
                contestacao.status === 'recusada' ? 'bg-red-100 text-red-700' :
                contestacao.status === 'em_analise' ? 'bg-blue-100 text-blue-700' :
                'bg-orange-100 text-orange-700'
              }`}>
                {contestacao.status === 'aberta' ? 'Aguardando análise' :
                 contestacao.status === 'em_analise' ? 'Em análise' :
                 contestacao.status === 'resolvida' ? 'Resolvida' : 'Recusada'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/70 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Motivo</p>
                <p className="text-sm font-bold text-neutral-800">{contestacao.motivo}</p>
              </div>
              <div className="bg-white/70 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Enviada em</p>
                <p className="text-sm font-bold text-neutral-800">{formatDate(contestacao.created_at)}</p>
              </div>
            </div>
            <div className="bg-white/70 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Descrição do cliente</p>
              <p className="text-sm text-neutral-700 leading-relaxed">{contestacao.descricao}</p>
            </div>
            {contestacao.resposta_admin && (
              <div className="bg-white rounded-2xl p-4 ring-1 ring-emerald-200">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Resposta enviada</p>
                <p className="text-sm text-neutral-700">{contestacao.resposta_admin}</p>
              </div>
            )}
            {['aberta', 'em_analise'].includes(contestacao.status) && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black text-neutral-500 uppercase tracking-wider block mb-1.5">Resposta ao cliente (obrigatório)</label>
                  <textarea
                    value={respostaAdmin}
                    onChange={e => setRespostaAdmin(e.target.value)}
                    rows={3}
                    placeholder="Descreva a análise e decisão tomada..."
                    className="w-full rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleResponderContestacao('resolvida')}
                    disabled={processandoContestacao || !respostaAdmin.trim()}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 py-3 text-xs font-black uppercase tracking-widest text-white shadow-md transition-all disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4" /> Resolver
                  </button>
                  <button
                    onClick={() => handleResponderContestacao('recusada')}
                    disabled={processandoContestacao || !respostaAdmin.trim()}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-red-600 hover:bg-red-700 py-3 text-xs font-black uppercase tracking-widest text-white shadow-md transition-all disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> Recusar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Coluna Lateral (Ações) */}
      <div className="w-full xl:w-1/3 flex flex-col gap-4">
        
        {/* Painel de Exportação e Ações Rápidas */}
        <div className="rounded-3xl bg-white p-6 ring-1 ring-neutral-200 shadow-sm flex flex-col gap-3">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Ações Rápidas</h4>
          <PDFExportMenu 
            onDownload={() => generateFaturaPDF(fatura, fatura.clientes, fatura.ordens_servico)}
            onWhatsApp={async () => {
              const doc = await generateFaturaPDF(fatura, fatura.clientes, fatura.ordens_servico, { returnDoc: true });
              if (doc) {
                const result = await pdfSharingService.uploadAndGetLink(doc, `fatura_${fatura.codigo_fatura}.pdf`);
                if (result) {
                  await pdfSharingService.shareViaWhatsApp(fatura.clientes?.telefone || '', result.url, 'Fatura', fatura.codigo_fatura);
                  setTimeout(() => pdfSharingService.deleteTempFile(result.path), 86400000);
                }
              }
            }}
            onEmail={async () => {
              const doc = await generateFaturaPDF(fatura, fatura.clientes, fatura.ordens_servico, { returnDoc: true });
              if (doc) {
                const result = await pdfSharingService.uploadAndGetLink(doc, `fatura_${fatura.codigo_fatura}.pdf`);
                if (result) {
                  await pdfSharingService.shareViaEmail(fatura.clientes?.email || '', 'Fatura', fatura.codigo_fatura, result.url);
                  setTimeout(() => pdfSharingService.deleteTempFile(result.path), 86400000);
                }
              }
            }}
          />
          
          {(!fatura.ordens_fiscais || fatura.ordens_fiscais.length === 0) && (
            <button 
              onClick={onGerarFiscal}
              className="w-full mt-2 rounded-2xl border border-indigo-200 bg-indigo-50/50 py-3 text-indigo-600 font-black uppercase tracking-widest text-[10px] hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <FileText className="h-4 w-4" />
              Enviar ao Módulo Fiscal
            </button>
          )}
        </div>

        {/* Baixa Administrativa (Manual) */}
        {fatura.status !== 'pago' && fatura.status !== 'cancelado' && (
          <div className="rounded-3xl bg-neutral-50/80 p-6 ring-1 ring-neutral-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <h4 className="text-[10px] font-black text-neutral-900 uppercase tracking-widest">Baixa Administrativa</h4>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-black text-neutral-400 uppercase ml-1 block mb-1">Forma de Pgto.</label>
                <select 
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="credito">Cartão de Crédito</option>
                  <option value="debito">Cartão de Débito</option>
                  <option value="indicacao">Bonificação / Indicação</option>
                </select>
              </div>
              
              <div>
                <label className="text-[9px] font-black text-neutral-400 uppercase ml-1 block mb-1">Data / Hora</label>
                <input 
                  type="datetime-local"
                  value={paymentDateTime}
                  onChange={e => setPaymentDateTime(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-neutral-400 uppercase ml-1 block mb-1">Observações</label>
                <textarea 
                  placeholder="Motivo da baixa manual..."
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none"
                />
              </div>
            </div>

            <button 
              onClick={() => onManualPay && onManualPay(paymentMethod, paymentDateTime, paymentNotes)}
              disabled={!paymentNotes}
              className="w-full rounded-xl bg-emerald-600 py-3 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Confirmar Pagamento
            </button>
          </div>
        )}

        {/* Ajuste de Valor */}
        {fatura.status !== 'pago' && fatura.status !== 'cancelado' && (
          <div className="rounded-3xl bg-indigo-50/60 ring-1 ring-indigo-200 p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4 text-indigo-500" />
              <h4 className="text-[10px] font-black text-neutral-900 uppercase tracking-widest">Ajustes Manuais</h4>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-emerald-600 uppercase tracking-wider block mb-1">
                    Desconto (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400">R$</span>
                    <input 
                      type="text"
                      value={ajusteDesconto ? maskCurrency(ajusteDesconto) : ''}
                      inputMode="decimal"
onChange={e => {
                        const val = e.target.value.replace(/\D/g, "");
                        setAjusteDesconto((Number(val) / 100).toString());
                      }}
                      placeholder="0,00"
                      className="w-full pl-7 pr-2 py-2 rounded-xl border border-emerald-200 bg-white text-xs font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-emerald-400/30 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black text-amber-600 uppercase tracking-wider block mb-1">
                    Acréscimo (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400">R$</span>
                    <input 
                      type="text"
                      value={ajusteAcrescimo ? maskCurrency(ajusteAcrescimo) : ''}
                      inputMode="decimal"
onChange={e => {
                        const val = e.target.value.replace(/\D/g, "");
                        setAjusteAcrescimo((Number(val) / 100).toString());
                      }}
                      placeholder="0,00"
                      className="w-full pl-7 pr-2 py-2 rounded-xl border border-amber-200 bg-white text-xs font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-amber-400/30 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-neutral-500 uppercase tracking-wider block mb-1">
                  Motivo
                </label>
                <input
                  type="text"
                  value={ajusteMotivo}
                  onChange={e => setAjusteMotivo(e.target.value)}
                  placeholder="Justificativa..."
                  className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs text-neutral-800 outline-none focus:ring-2 focus:ring-indigo-400/30 transition-all"
                />
              </div>
            </div>

            <button
              onClick={handleAplicarAjuste}
              disabled={aplicandoAjuste || !ajusteMotivo.trim() || (parseFloat(ajusteDesconto || '0') === 0 && parseFloat(ajusteAcrescimo || '0') === 0)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-md shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {aplicandoAjuste ? 'Aplicando...' : 'Aplicar Ajuste'}
            </button>

            {Array.isArray(fatura.historico_ajustes) && fatura.historico_ajustes.length > 0 && (
              <details className="group pt-2">
                <summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-700 transition-colors">
                  Ver Histórico ({fatura.historico_ajustes.length})
                </summary>
                <div className="mt-2 space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                  {[...fatura.historico_ajustes].reverse().map((h: any, i: number) => (
                    <div key={i} className="bg-white rounded-lg p-2 ring-1 ring-neutral-100 text-[10px] space-y-1">
                      <div className="flex justify-between">
                        <span className="font-bold text-neutral-500">{formatDate(h.data)}</span>
                        <span className="font-black text-indigo-600">{formatCurrency(h.valor_novo)}</span>
                      </div>
                      <p className="text-neutral-600 leading-tight">{h.motivo}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Enviar para Cobrança (Se Vencida) */}
        {fatura.status === 'vencida' && !fatura.tem_cobranca && (
          <button 
            onClick={async () => {
              if (!onEnviarParaCobranca || enviandoParaCobranca) return;
              setEnviandoParaCobranca(true);
              try {
                await onEnviarParaCobranca();
              } finally {
                setEnviandoParaCobranca(false);
              }
            }}
            disabled={enviandoParaCobranca}
            className="w-full rounded-3xl bg-rose-600 py-4 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-rose-600/20 hover:bg-rose-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Landmark className="h-4 w-4" />
            {enviandoParaCobranca ? 'Enviando...' : 'Enviar para Cobrança'}
          </button>
        )}

        {fatura.tem_cobranca && (
          <div className="w-full rounded-3xl bg-rose-50 py-4 ring-1 ring-rose-200 text-rose-600 font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            Em Cobrança
          </div>
        )}



        {/* Cancelar Fatura */}
        {fatura.status !== 'cancelado' && fatura.status !== 'pago' && (
          <button 
            onClick={() => onCancel && onCancel()}
            className="w-full mt-2 rounded-3xl border border-rose-200 bg-white py-4 text-rose-600 font-black uppercase tracking-widest text-[10px] hover:bg-rose-50 transition-all flex items-center justify-center gap-2"
          >
            <XCircle className="h-4 w-4" />
            Cancelar Fatura
          </button>
        )}

      </div>
    </div>
  );
}


export function getFaturaDetails(fat: any) {
  const os = fat.ordens_servico;
  const oc = fat.ordens_compra;
  const oa = fat.ordens_assinatura;

  if (os) {
    const orc = Array.isArray(os.orcamentos) ? os.orcamentos[0] : os.orcamentos;
    return {
      orderType: 'Ordem de Serviço',
      orderCode: os.codigo_os,
      orcamentoCode: orc?.codigo_orcamento,
      itemName: orc?.servicos?.nome || 'Serviço',
      itemLabel: 'Serviço',
      valorItem: Number(orc?.valor_servico) || 0,
      quantidade: 1,
      valorAdicional: Number(orc?.valor_adicional) || 0,
      descricaoAdicional: orc?.descricao_adicional,
      acrescimo: Number(orc?.acrescimo) || 0,
      desconto: Number(orc?.desconto) || 0
    };
  }

  if (oc) {
    const orc = Array.isArray(oc.orcamentos) ? oc.orcamentos[0] : oc.orcamentos;
    return {
      orderType: 'Ordem de Compra',
      orderCode: oc.codigo_ordem,
      orcamentoCode: orc?.codigo_orcamento,
      itemName: orc?.produtos?.nome || 'Produto',
      itemLabel: 'Produto',
      valorItem: Number(orc?.produtos?.valor) || 0,
      quantidade: oc.quantidade || 1,
      valorAdicional: Number(orc?.valor_adicional) || 0,
      descricaoAdicional: orc?.descricao_adicional,
      acrescimo: Number(orc?.acrescimo) || 0,
      desconto: Number(orc?.desconto) || 0
    };
  }

  if (oa) {
    const orc = Array.isArray(oa.orcamentos) ? oa.orcamentos[0] : oa.orcamentos;
    return {
      orderType: 'Ordem de Assinatura',
      orderCode: oa.codigo_ordem,
      orcamentoCode: orc?.codigo_orcamento,
      itemName: oa.assinaturas?.nome || 'Assinatura',
      itemLabel: 'Assinatura',
      valorItem: Number(oa.assinaturas?.valor) || 0,
      quantidade: oa.quantidade || 1,
      quantidade_meses: orc?.quantidade_meses,
      prazo_indeterminado: orc?.prazo_indeterminado,
      valorAdicional: Number(orc?.valor_adicional) || 0,
      descricaoAdicional: orc?.descricao_adicional,
      acrescimo: Number(orc?.acrescimo) || 0,
      desconto: Number(orc?.desconto) || 0
    };
  }

  return {
    orderType: 'Fatura Avulsa',
    orderCode: '',
    itemName: fat.observacoes || 'Fatura de Serviços',
    itemLabel: {
      servico: 'Serviço',
      produto: 'Produto',
      assinatura: 'Assinatura',
      pacote_nivel: 'Pacote VIP'
    }[fat.tipo as string] || 'Cobrança',
    valorItem: fat.valor_total,
    quantidade: 1,
    valorAdicional: 0,
    acrescimo: 0,
    desconto: 0
  };
}

function PDFExportMenu({ onDownload, onWhatsApp, onEmail }: any) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative flex-1 min-w-[200px]">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50 flex items-center justify-center gap-2 shadow-sm transition-all"
      >
        <Printer className="h-5 w-5" />
        Gerar PDF
      </button>
      
      {isOpen && (
        <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] ring-1 ring-black/5 p-2 z-50 flex flex-col gap-1 animate-in slide-in-from-bottom-2 fade-in">
          <button onClick={() => { setIsOpen(false); onDownload(); }} className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 rounded-lg text-sm font-bold text-neutral-700 flex items-center gap-3 transition-colors">
            <Printer className="h-4 w-4 text-neutral-400"/> Fazer Download
          </button>
          <button onClick={() => { setIsOpen(false); onWhatsApp(); }} className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 text-emerald-700 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors">
            <Send className="h-4 w-4"/> Enviar por WhatsApp
          </button>
          <button onClick={() => { setIsOpen(false); onEmail(); }} className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors">
            <MessageSquare className="h-4 w-4"/> Enviar por E-mail
          </button>
        </div>
      )}
    </div>
  );
}


