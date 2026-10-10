import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { playPremiumBeep } from '../lib/utils';
import { showAnimatedToast } from '../lib/notifications';
import { providerOperations } from '../lib/providerOperations';
import { isProviderRevoked } from '../lib/providerStatus';

const HEARTBEAT_INTERVAL_MS = 60_000;

type ProviderProfile = {
  id: string;
  nome_razao: string;
  documento: string;
  email?: string | null;
  telefone?: string | null;
  cep?: string | null;
  numero?: string | null;
  area_servico?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export interface ProviderPendencyCounts {
  demandas_novas: number;
  demandas_negociacao: number;
  servicos_ativos: number;
  financeiro_saques_pendentes: number;
  vouchers_ativos: number;
  suporte_tickets_ativos: number;
  suporte_mensagens_nao_lidas: number;
  promocoes_ativas: number;
  total: number;
  moduleDemandas: number;
  moduleDemandasAbertas: number;
  moduleDemandasAtivas: number;
  moduleAgenda: number;
  moduleFinanceiro: number;
  moduleVouchers: number;
  moduleSuporte: number;
  moduleDocumentos: number;
  modulePremios: number;
  modulePromocoes: number;
  demandas_pendentes: number;
  demandas_em_execucao: number;
}

const emptyCounts: ProviderPendencyCounts = {
  demandas_novas: 0,
  demandas_negociacao: 0,
  servicos_ativos: 0,
  financeiro_saques_pendentes: 0,
  vouchers_ativos: 0,
  suporte_tickets_ativos: 0,
  suporte_mensagens_nao_lidas: 0,
  promocoes_ativas: 0,
  total: 0,
  moduleDemandas: 0,
  moduleDemandasAbertas: 0,
  moduleDemandasAtivas: 0,
  moduleAgenda: 0,
  moduleFinanceiro: 0,
  moduleVouchers: 0,
  moduleSuporte: 0,
  moduleDocumentos: 0,
  modulePremios: 0,
  modulePromocoes: 0,
  demandas_pendentes: 0,
  demandas_em_execucao: 0,
};

export interface ProviderNotification {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  modulo?: string;
  tab?: string;
  item_id?: string;
  created_at: string;
  prioridade?: string;
}

interface ProviderNotificationContextValue {
  pendencies: ProviderPendencyCounts;
  notifications: ProviderNotification[];
  unreadNotifications: number;
  prestador: ProviderProfile | null;
  loading: boolean;
  error: string | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshCounts: () => Promise<void>;
}

const ProviderNotificationContext = createContext<ProviderNotificationContextValue | undefined>(undefined);

export function ProviderNotificationProvider({ children, prestadorId }: { children: React.ReactNode; prestadorId: string }) {
  const [pendencies, setPendencies] = useState<ProviderPendencyCounts>(emptyCounts);
  const [notifications, setNotifications] = useState<ProviderNotification[]>([]);
  const [prestador, setPrestador] = useState<ProviderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const registrationDateRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const fetchPrestador = useCallback(async () => {
    if (!prestadorId) return;
    const { data, error: queryError } = await supabase
      .from('prestadores')
      .select('id,nome_razao,documento,email,telefone,cep,numero,area_servico,status,created_at')
      .eq('id', prestadorId)
      .maybeSingle();

    if (queryError) throw queryError;
    if (!data) throw new Error('Cadastro de prestador não encontrado.');
    if (!mountedRef.current) return;
    setPrestador(data as ProviderProfile);
    registrationDateRef.current = data.created_at || null;
  }, [prestadorId]);

  const fetchPendencies = useCallback(async () => {
    if (!prestadorId) return;
    const source = await providerOperations.pendencySnapshot();
    const counts: ProviderPendencyCounts = {
      ...emptyCounts,
      ...source,
      demandas_novas: Number(source?.demandas_novas || 0),
      demandas_negociacao: Number(source?.demandas_negociacao || 0),
      demandas_pendentes: Number(source?.demandas_pendentes || 0),
      demandas_em_execucao: Number(source?.demandas_em_execucao || 0),
      servicos_ativos: Number(source?.servicos_ativos || 0),
      financeiro_saques_pendentes: Number(source?.financeiro_saques_pendentes || 0),
      vouchers_ativos: Number(source?.vouchers_ativos || 0),
      suporte_tickets_ativos: Number(source?.suporte_tickets_ativos || 0),
      suporte_mensagens_nao_lidas: Number(source?.suporte_mensagens_nao_lidas || 0),
      promocoes_ativas: Number(source?.promocoes_ativas || 0),
      total: Number(source?.total || 0),
      moduleDemandas: Number(source?.moduleDemandas || 0),
      moduleDemandasAbertas: Number(source?.moduleDemandasAbertas || 0),
      moduleDemandasAtivas: Number(source?.moduleDemandasAtivas || 0),
      moduleAgenda: Number(source?.moduleAgenda || 0),
      moduleFinanceiro: Number(source?.moduleFinanceiro || 0),
      moduleVouchers: Number(source?.moduleVouchers || 0),
      moduleSuporte: Number(source?.moduleSuporte || 0),
      moduleDocumentos: Number(source?.moduleDocumentos || 0),
      modulePremios: Number(source?.modulePremios || 0),
      modulePromocoes: Number(source?.modulePromocoes || 0),
    };
    if (mountedRef.current) setPendencies(counts);
  }, [prestadorId]);

  const fetchNotifications = useCallback(async () => {
    if (!prestadorId) return;
    const registrationDate = registrationDateRef.current;
    const [{ data: rows, error: notificationError }, { data: reads, error: readsError }] = await Promise.all([
      supabase
        .from('notificacoes')
        .select('id,tipo,titulo,mensagem,lida,modulo,tab,item_id,data_criacao,prioridade,prestador_id,destinatario_tipo')
        .or(`prestador_id.eq.${prestadorId},destinatario_tipo.in.(broadcast_prestadores,broadcast_todos)`)
        .order('data_criacao', { ascending: false })
        .limit(50),
      supabase
        .from('notificacao_leituras')
        .select('notificacao_id')
        .eq('ator_tipo', 'prestador')
        .eq('ator_id', prestadorId),
    ]);

    if (notificationError) throw notificationError;
    if (readsError) throw readsError;

    const readIds = new Set((reads || []).map((row: any) => row.notificacao_id));
    const minimumBroadcastDate = registrationDate ? new Date(registrationDate).getTime() - 10 * 60 * 1000 : 0;
    const normalized = (rows || [])
      .filter((row: any) => {
        if (row.prestador_id === prestadorId) return true;
        return new Date(row.data_criacao).getTime() >= minimumBroadcastDate;
      })
      .slice(0, 30)
      .map((row: any): ProviderNotification => ({
        id: row.id,
        tipo: row.tipo || 'geral',
        titulo: row.titulo || 'Notificação',
        mensagem: row.mensagem || '',
        lida: readIds.has(row.id) || (row.prestador_id === prestadorId && row.lida === true),
        modulo: row.modulo || undefined,
        tab: row.tab || undefined,
        item_id: row.item_id || undefined,
        created_at: row.data_criacao,
        prioridade: row.prioridade || 'normal',
      }));

    if (mountedRef.current) setNotifications(normalized);
  }, [prestadorId]);

  const refreshCounts = useCallback(async () => {
    setError(null);
    try {
      // 1. Prioritize critical profile fetch to unblock UI ASAP
      await fetchPrestador();
      // 2. Fetch non-critical metrics
      const results = await Promise.allSettled([fetchPendencies(), fetchNotifications()]);
      const failed = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
      if (failed && mountedRef.current) {
        setError(failed.reason?.message || 'Não foi possível atualizar as notificações.');
      }
    } catch (err: any) {
      if (mountedRef.current) setError(err?.message || 'Falha ao carregar prestador.');
    }
  }, [fetchNotifications, fetchPendencies, fetchPrestador]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    refreshCounts().finally(() => mountedRef.current && setLoading(false));

    if (!prestadorId) return;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void refreshCounts(), 350);
    };

    const channel = supabase.channel(`provider-scoped-${prestadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_demandas', filter: `prestador_id=eq.${prestadorId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_transacoes', filter: `prestador_id=eq.${prestadorId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_saques', filter: `prestador_id=eq.${prestadorId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_vouchers', filter: `prestador_id=eq.${prestadorId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_agendamentos', filter: `prestador_id=eq.${prestadorId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_documentos', filter: `prestador_id=eq.${prestadorId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `prestador_id=eq.${prestadorId}` }, scheduleRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `prestador_id=eq.${prestadorId}` }, (payload) => {
        const row = payload.new as any;
        playPremiumBeep();
        showAnimatedToast(row.titulo || 'Nova notificação', row.mensagem || '', row.modulo || 'bell');
        scheduleRefresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: 'destinatario_tipo=in.(broadcast_prestadores,broadcast_todos)' }, (payload) => {
        const row = payload.new as any;
        playPremiumBeep();
        showAnimatedToast(row.titulo || 'Nova notificação', row.mensagem || '', row.modulo || 'bell');
        scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestadores', filter: `id=eq.${prestadorId}` }, (payload) => {
        if (payload.eventType === 'DELETE' || isProviderRevoked((payload.new as any)?.status)) {
          window.sessionStorage.clear();
          window.localStorage.removeItem('sessaoId');
          window.location.assign('/?msg=revoked');
          return;
        }
        scheduleRefresh();
      })
      .subscribe();

    const heartbeat = window.setInterval(() => void refreshCounts(), HEARTBEAT_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.clearInterval(heartbeat);
      supabase.removeChannel(channel).catch(console.error);
    };
  }, [prestadorId, refreshCounts]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, lida: true } : item));
    try {
      await providerOperations.markNotificationRead(id);
    } catch (markError) {
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, lida: false } : item));
      throw markError;
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const previous = notifications;
    setNotifications((current) => current.map((item) => ({ ...item, lida: true })));
    try {
      await providerOperations.markAllNotificationsRead();
    } catch (markError) {
      setNotifications(previous);
      throw markError;
    }
  }, [notifications]);

  const unreadNotifications = useMemo(() => notifications.filter((item) => !item.lida).length, [notifications]);

  const value = useMemo(() => ({
    pendencies,
    notifications,
    unreadNotifications,
    prestador,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refreshCounts,
  }), [
    pendencies,
    notifications,
    unreadNotifications,
    prestador,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refreshCounts,
  ]);

  return (
    <ProviderNotificationContext.Provider value={value}>
      {children}
    </ProviderNotificationContext.Provider>
  );
}

export function useProviderNotifications() {
  const context = useContext(ProviderNotificationContext);
  if (!context) throw new Error('useProviderNotifications must be used within a ProviderNotificationProvider');
  return context;
}
