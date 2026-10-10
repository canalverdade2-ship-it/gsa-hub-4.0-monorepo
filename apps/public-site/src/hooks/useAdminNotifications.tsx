import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { callAdminRpc } from '../lib/adminRpc';

export interface PendencyCounts {
  cadastro_clientes_inativos: number;
  cadastro_clientes_bloqueados: number;
  cadastro_clientes_pendentes: number;
  cadastro_prestadores_pendentes: number;
  cadastro_prestadores_analise: number;
  cadastro_documentos_pendentes: number;
  cadastro_cliente_documentos_analise: number;
  cadastro_vouchers_pendentes: number;
  cadastro_premios_pendentes: number;
  cobrancas_pendentes: number;
  cobrancas_criticas: number;
  financeiro_faturas_vencidas: number;
  financeiro_faturas_pendentes: number;
  financeiro_saques_pendentes: number;
  financeiro_transferencias_analise: number;
  financeiro_prestador_saques_pendentes: number;
  vendas_orcamentos_pendentes: number;
  vendas_orcamentos_aprovados: number;
  vendas_demandas_abertas: number;
  vendas_demandas_prestador: number;
  vendas_demandas_internas: number;
  vendas_demandas_ativas: number;
  vendas_demandas_suporte: number;
  vendas_os_andamento: number;
  vendas_credito_pendentes: number;
  vendas_assinaturas_pendentes: number;
  suporte_tickets_abertos: number;
  suporte_tickets_em_andamento: number;
  suporte_mensagens_nao_lidas: number;
  acessos_exclusoes_pendentes: number;
  fiscal_pendencias: number;
  moduleCadastro: number;
  moduleVendas: number;
  moduleFinanceiro: number;
  moduleCobranca: number;
  moduleFiscal: number;
  moduleSuporte: number;
  moduleAcessos: number;
  moduleDemandas: number;
  total: number;
}

const defaultCounts: PendencyCounts = {
  cadastro_clientes_inativos: 0,
  cadastro_clientes_bloqueados: 0,
  cadastro_clientes_pendentes: 0,
  cadastro_prestadores_pendentes: 0,
  cadastro_prestadores_analise: 0,
  cadastro_documentos_pendentes: 0,
  cadastro_cliente_documentos_analise: 0,
  cadastro_vouchers_pendentes: 0,
  cadastro_premios_pendentes: 0,
  cobrancas_pendentes: 0,
  cobrancas_criticas: 0,
  financeiro_faturas_vencidas: 0,
  financeiro_faturas_pendentes: 0,
  financeiro_saques_pendentes: 0,
  financeiro_transferencias_analise: 0,
  financeiro_prestador_saques_pendentes: 0,
  vendas_orcamentos_pendentes: 0,
  vendas_orcamentos_aprovados: 0,
  vendas_demandas_abertas: 0,
  vendas_demandas_prestador: 0,
  vendas_demandas_internas: 0,
  vendas_demandas_ativas: 0,
  vendas_demandas_suporte: 0,
  vendas_os_andamento: 0,
  vendas_credito_pendentes: 0,
  vendas_assinaturas_pendentes: 0,
  suporte_tickets_abertos: 0,
  suporte_tickets_em_andamento: 0,
  suporte_mensagens_nao_lidas: 0,
  acessos_exclusoes_pendentes: 0,
  fiscal_pendencias: 0,
  moduleCadastro: 0,
  moduleVendas: 0,
  moduleFinanceiro: 0,
  moduleCobranca: 0,
  moduleFiscal: 0,
  moduleSuporte: 0,
  moduleAcessos: 0,
  moduleDemandas: 0,
  total: 0,
};

export interface AdminNotificacao {
  id: string;
  source_table?: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  modulo?: string;
  tab?: string;
  item_id?: string;
  link?: string;
  created_at: string;
  prioridade?: string;
  acao_origem?: string;
  destinatario_tipo?: string;
}

interface AdminNotificationContextType {
  pendencies: PendencyCounts;
  notifications: AdminNotificacao[];
  unreadNotifications: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteAllNotifications: () => Promise<void>;
  refreshCounts: () => Promise<void>;
}

const AdminNotificationContext = createContext<AdminNotificationContextType | undefined>(undefined);

function asNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeCounts(raw: Record<string, unknown> = {}): PendencyCounts {
  const counts = {
    cadastro_clientes_inativos: asNumber(raw.cadastro_clientes_inativos),
    cadastro_clientes_bloqueados: asNumber(raw.cadastro_clientes_bloqueados),
    cadastro_clientes_pendentes: asNumber(raw.cadastro_clientes_pendentes),
    cadastro_prestadores_pendentes: asNumber(raw.cadastro_prestadores_pendentes),
    cadastro_prestadores_analise: asNumber(raw.cadastro_prestadores_analise),
    cadastro_documentos_pendentes: asNumber(raw.cadastro_docs_pendentes),
    cadastro_cliente_documentos_analise: asNumber(raw.cadastro_cliente_docs_pendentes),
    cadastro_vouchers_pendentes: asNumber(raw.cadastro_vouchers_pendentes),
    cadastro_premios_pendentes: asNumber(raw.cadastro_premios_pendentes),
    cobrancas_pendentes: asNumber(raw.cobranca_pendentes),
    cobrancas_criticas: asNumber(raw.cobranca_criticas),
    financeiro_faturas_vencidas: asNumber(raw.financeiro_faturas_vencidas),
    financeiro_faturas_pendentes: asNumber(raw.financeiro_faturas_pendentes),
    financeiro_saques_pendentes: asNumber(raw.financeiro_saques_pendentes),
    financeiro_transferencias_analise: asNumber(raw.financeiro_transferencias_analise),
    financeiro_prestador_saques_pendentes: asNumber(raw.financeiro_prestador_saques),
    vendas_orcamentos_pendentes: asNumber(raw.vendas_orcamentos_pendentes),
    vendas_orcamentos_aprovados: asNumber(raw.vendas_orcamentos_aprovados),
    vendas_demandas_abertas: asNumber(raw.vendas_demandas_abertas),
    vendas_demandas_prestador: asNumber(raw.vendas_demandas_prestador),
    vendas_demandas_internas: asNumber(raw.vendas_demandas_internas),
    vendas_demandas_suporte: asNumber(raw.vendas_demandas_suporte),
    vendas_os_andamento: asNumber(raw.vendas_os_andamento),
    vendas_credito_pendentes: asNumber(raw.vendas_credito_pendentes),
    vendas_assinaturas_pendentes: asNumber(raw.vendas_assinaturas_pendentes),
    suporte_tickets_abertos: asNumber(raw.suporte_tickets_abertos),
    suporte_tickets_em_andamento: asNumber(raw.suporte_tickets_em_andamento),
    suporte_mensagens_nao_lidas: asNumber(raw.suporte_mensagens_nao_lidas),
    acessos_exclusoes_pendentes: asNumber(raw.acessos_exclusao_pendentes),
    fiscal_pendencias: asNumber(raw.fiscal_pendentes),
  };

  const moduleCadastro =
    counts.cadastro_clientes_inativos +
    counts.cadastro_clientes_bloqueados +
    counts.cadastro_clientes_pendentes +
    counts.cadastro_prestadores_pendentes +
    counts.cadastro_prestadores_analise +
    counts.cadastro_documentos_pendentes +
    counts.cadastro_cliente_documentos_analise +
    counts.cadastro_vouchers_pendentes +
    counts.cadastro_premios_pendentes;
  const moduleCobranca = counts.cobrancas_pendentes + counts.cobrancas_criticas;
  const moduleFinanceiro =
    counts.financeiro_faturas_vencidas +
    counts.financeiro_faturas_pendentes +
    counts.financeiro_saques_pendentes +
    counts.financeiro_transferencias_analise +
    counts.financeiro_prestador_saques_pendentes;
  const moduleVendas =
    counts.vendas_orcamentos_pendentes +
    counts.vendas_orcamentos_aprovados +
    counts.vendas_demandas_abertas +
    counts.vendas_demandas_prestador +
    counts.vendas_demandas_internas +
    counts.vendas_demandas_suporte +
    counts.vendas_os_andamento +
    counts.vendas_credito_pendentes +
    counts.vendas_assinaturas_pendentes;
  const moduleSuporte =
    counts.suporte_tickets_abertos +
    Math.max(counts.suporte_mensagens_nao_lidas, counts.suporte_tickets_em_andamento);
  const moduleAcessos = counts.acessos_exclusoes_pendentes;
  const moduleDemandas = counts.vendas_demandas_internas;
  const moduleFiscal = counts.fiscal_pendencias;
  const total =
    moduleCadastro +
    moduleFinanceiro +
    moduleCobranca +
    moduleVendas +
    moduleSuporte +
    moduleAcessos +
    moduleDemandas +
    moduleFiscal;

  return {
    ...counts,
    vendas_demandas_ativas: counts.vendas_demandas_prestador + counts.vendas_demandas_internas,
    moduleCadastro,
    moduleVendas,
    moduleFinanceiro,
    moduleCobranca,
    moduleFiscal,
    moduleSuporte,
    moduleAcessos,
    moduleDemandas,
    total,
  };
}

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(760, context.currentTime);
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  } catch {
    // Navegadores podem bloquear áudio antes da primeira interação.
  }
}

export function AdminNotificationProvider({ children }: { children: React.ReactNode }) {
  const [pendencies, setPendencies] = useState<PendencyCounts>(defaultCounts);
  const [notifications, setNotifications] = useState<AdminNotificacao[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const notificationsLoadedRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPendencies = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const data = await callAdminRpc<Record<string, unknown>>('gsa_admin_get_pendency_counts_secure');
      setPendencies(normalizeCounts(data || {}));
    } catch (error) {
      console.error('Erro ao buscar pendências administrativas seguras:', error);
    }
  }, []);

  const fetchNotifications = useCallback(async (notifyOnNew = false) => {
    if (document.visibilityState !== 'visible') return;
    try {
      const data = await callAdminRpc<AdminNotificacao[]>('gsa_admin_list_notifications', {
        p_limit: 10000,
      });
      const next = Array.isArray(data) ? data : [];
      if (notifyOnNew && notificationsLoadedRef.current) {
        const newlyReceived = next.find((item) => !item.lida && !knownIdsRef.current.has(item.id));
        if (newlyReceived) {
          playNotificationSound();
          toast.success(newlyReceived.titulo, { duration: 4500 });
        }
      }
      knownIdsRef.current = new Set(next.map((item) => item.id));
      notificationsLoadedRef.current = true;
      setNotifications(next);
    } catch (error) {
      console.error('Erro ao buscar notificações administrativas seguras:', error);
    }
  }, []);

  const refreshAll = useCallback(
    async (notifyOnNew = false) => {
      await Promise.all([fetchPendencies(), fetchNotifications(notifyOnNew)]);
    },
    [fetchNotifications, fetchPendencies],
  );

  const scheduleRefresh = useCallback(
    (notifyOnNew = true) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        void refreshAll(notifyOnNew);
      }, 700);
    },
    [refreshAll],
  );

  useEffect(() => {
    // Atraso de 500ms para permitir que a UI principal (como fetch do colaborador) renderize primeiro 
    // sem esgotar o pool de conexões do navegador.
    const initialTimer = setTimeout(() => {
      void refreshAll(false);
    }, 500);

    const channel = supabase
      .channel('admin-notifications-secure')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_notificacoes' }, () => scheduleRefresh(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes' }, () => scheduleRefresh(true))
      .subscribe();

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshAll(true);
    }, 60_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefresh(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      clearTimeout(initialTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      supabase.removeChannel(channel).catch(console.error);
    };
  }, [refreshAll, scheduleRefresh]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((items) => items.map((item) => (item.id === id ? { ...item, lida: true } : item)));
    try {
      await callAdminRpc('gsa_admin_set_notification_state', {
        p_notification_id: id,
        p_read: true,
        p_dismiss: false,
      });
    } catch (error) {
      console.error('Erro ao marcar notificação como lida:', error);
      await fetchNotifications(false);
    }
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    const previous = notifications;
    setNotifications((items) => items.map((item) => ({ ...item, lida: true })));
    try {
      await callAdminRpc('gsa_admin_mark_all_notifications', { p_dismiss: false });
    } catch (error) {
      console.error('Erro ao marcar todas as notificações:', error);
      setNotifications(previous);
      toast.error('Não foi possível marcar todas as notificações.');
    }
  }, [notifications]);

  const deleteAllNotifications = useCallback(async () => {
    const previous = notifications;
    setNotifications([]);
    try {
      await callAdminRpc('gsa_admin_mark_all_notifications', { p_dismiss: true });
    } catch (error) {
      console.error('Erro ao dispensar notificações:', error);
      setNotifications(previous);
      toast.error('Não foi possível dispensar as notificações.');
    }
  }, [notifications]);

  const unreadNotifications = useMemo(
    () => notifications.reduce((total, item) => total + (item.lida ? 0 : 1), 0),
    [notifications],
  );

  const value = useMemo<AdminNotificationContextType>(
    () => ({
      pendencies,
      notifications,
      unreadNotifications,
      markAsRead,
      markAllAsRead,
      deleteAllNotifications,
      refreshCounts: fetchPendencies,
    }),
    [
      deleteAllNotifications,
      fetchPendencies,
      markAllAsRead,
      markAsRead,
      notifications,
      pendencies,
      unreadNotifications,
    ],
  );

  return <AdminNotificationContext.Provider value={value}>{children}</AdminNotificationContext.Provider>;
}

export function useAdminNotifications() {
  const context = useContext(AdminNotificationContext);
  if (!context) {
    throw new Error('useAdminNotifications must be used within an AdminNotificationProvider');
  }
  return context;
}
