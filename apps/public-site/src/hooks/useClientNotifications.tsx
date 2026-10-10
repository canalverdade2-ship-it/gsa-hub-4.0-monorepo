import React, { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { playPremiumBeep } from '../lib/utils';
import { showAnimatedToast } from '../lib/notifications';
import { sessionService } from '../lib/sessionService';
import { callClientRpc } from '../lib/clientRpc';
import { isMarketplaceNotification } from '../routing/marketplaceScope';

// Constantes de reconexão
const HEARTBEAT_INTERVAL_MS = 60000; // 60s polling de fallback
const RECONNECT_DELAY_MS = 3000;     // 3s delay para reconexão

export interface ClientPendencyCounts {
  financeiro_faturas_pendentes: number;
  financeiro_faturas_vencidas: number;
  financeiro_saques_analise: number;
  orcamentos_abertos: number;
  servicos_andamento: number;
  vouchers_ativos: number;
  suporte_tickets_ativos: number;
  suporte_mensagens_nao_lidas: number;
  indicacoes_abertas: number;
  produtos_analise: number;
  assinaturas_analise: number;
  documentos_pendentes: number;

  // Module Totals (for sidebar)
  moduleFinanceiro: number;
  moduleServicos: number;
  moduleOrcamentos: number;
  moduleSuporte: number;
  moduleVouchers: number;
  moduleIndiqueGanhe: number;
  moduleProdutos: number;
  moduleAssinaturas: number;
  modulePromocoes: number;
  modulePerfil: number;
  
  // Overall Total
  total: number;
}

const defaultCounts: ClientPendencyCounts = {
  financeiro_faturas_pendentes: 0,
  financeiro_faturas_vencidas: 0,
  financeiro_saques_analise: 0,
  orcamentos_abertos: 0,
  servicos_andamento: 0,
  vouchers_ativos: 0,
  suporte_tickets_ativos: 0,
  suporte_mensagens_nao_lidas: 0,
  indicacoes_abertas: 0,
  produtos_analise: 0,
  assinaturas_analise: 0,
  documentos_pendentes: 0,
  moduleFinanceiro: 0,
  moduleServicos: 0,
  moduleOrcamentos: 0,
  moduleSuporte: 0,
  moduleVouchers: 0,
  moduleIndiqueGanhe: 0,
  moduleProdutos: 0,
  moduleAssinaturas: 0,
  modulePromocoes: 0,
  modulePerfil: 0,
  total: 0
};

interface ClientNotificacao {
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

interface ClientNotificationContextType {
  pendencies: ClientPendencyCounts;
  notifications: ClientNotificacao[];
  unreadNotifications: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshCounts: () => Promise<void>;
}

const ClientNotificationContext = createContext<ClientNotificationContextType | undefined>(undefined);

export function ClientNotificationProvider({ children, clientId }: { children: React.ReactNode, clientId: string }) {
  const [pendencies, setPendencies] = useState<ClientPendencyCounts>(defaultCounts);
  const [notifications, setNotifications] = useState<ClientNotificacao[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const registrationDateRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSubscribedRef = useRef(false);
  const seenNotificationsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    registrationDateRef.current = null;
    seenNotificationsRef.current = null;
    setNotifications([]);
    setUnreadNotifications(0);
  }, [clientId]);

  const fetchPendencies = useCallback(async () => {
    if (!clientId) return;

    try {
      const { data, error } = await supabase.rpc('get_client_pendency_counts', { p_cliente_id: clientId });
      if (error) throw error;

      // Promoções precisam ser calculadas à parte por causa da lógica de data dinâmica
      const now = new Date().toISOString();
      const [promocoesAtivas, minhasPromosAtivadas] = await Promise.all([
        supabase.from('promocoes').select('id').eq('status', 'ativa').lte('data_inicio_divulgacao', now).gte('data_fim_divulgacao', now),
        supabase.from('cliente_promocoes').select('promocao_id').eq('cliente_id', clientId)
      ]);

      const allActivePromos = (promocoesAtivas?.data || []) as {id: string}[];
      const activatedPromoIds = ((minhasPromosAtivadas?.data || []) as {promocao_id: string}[]).map(p => p.promocao_id);
      const promocoesDisponiveisCount = allActivePromos.filter(p => !activatedPromoIds.includes(p.id)).length;

      // Buscar vouchers reais filtrando os globais de Indicação (IDC), igual a View ClientVouchers
      const { data: activeVouchers } = await supabase
        .from('vouchers')
        .select('cliente_id, codigo_voucher')
        .eq('status', 'ativo')
        .or(`cliente_id.eq.${clientId},cliente_id.is.null`);
        
      const realVouchersCount = activeVouchers 
        ? activeVouchers.filter(v => !(v.cliente_id === null && v.codigo_voucher?.startsWith('IDC'))).length 
        : (data.vouchers_ativos || 0);

      const counts: ClientPendencyCounts = {
        financeiro_faturas_pendentes: data.financeiro_faturas_pendentes || 0,
        financeiro_faturas_vencidas: data.financeiro_faturas_vencidas || 0,
        financeiro_saques_analise: data.financeiro_saques_analise || 0,
        orcamentos_abertos: 0,
        servicos_andamento: 0,
        vouchers_ativos: realVouchersCount,
        suporte_tickets_ativos: data.suporte_tickets_ativos || 0,
        suporte_mensagens_nao_lidas: data.suporte_mensagens_nao_lidas || 0,
        indicacoes_abertas: data.indicacoes_abertas || 0,
        produtos_analise: data.produtos_analise || 0,
        assinaturas_analise: data.assinaturas_analise || 0,
        documentos_pendentes: data.documentos_pendentes || 0,

        moduleFinanceiro: (data.financeiro_faturas_pendentes || 0) + (data.financeiro_faturas_vencidas || 0) + (data.financeiro_saques_analise || 0),
        moduleServicos: 0,
        moduleOrcamentos: 0,
        moduleSuporte: (data.suporte_tickets_ativos || 0) + (data.suporte_mensagens_nao_lidas || 0),
        moduleVouchers: realVouchersCount,
        moduleIndiqueGanhe: data.indicacoes_abertas || 0,
        moduleProdutos: data.produtos_analise || 0,
        moduleAssinaturas: data.assinaturas_analise || 0,
        modulePromocoes: promocoesDisponiveisCount,
        modulePerfil: data.documentos_pendentes || 0,
        
        total: 0
      };

      counts.total = counts.moduleFinanceiro + counts.moduleServicos + counts.moduleOrcamentos + 
                     counts.moduleSuporte + counts.moduleVouchers + counts.moduleIndiqueGanhe + 
                     counts.moduleProdutos + counts.moduleAssinaturas + counts.modulePromocoes + 
                     counts.modulePerfil;

      setPendencies(counts);
    } catch (error) {
      console.error('Error fetching client pendencies RPC:', error);
    }
  }, [clientId]);

  const fetchNotifications = useCallback(async () => {
    if (!clientId) return;
    try {
      // 1. Obter data de cadastro para filtrar broadcasts (cacheado em ref)
      if (!registrationDateRef.current) {
        const { data: client, error: registrationError } = await supabase
          .from('clientes')
          .select('data_cadastro')
          .eq('id', clientId)
          .maybeSingle();
        
        if (registrationError) console.error('Não foi possível consultar a data de cadastro:', registrationError);
        registrationDateRef.current = client?.data_cadastro || null;
      }

      const regTime = registrationDateRef.current ? new Date(registrationDateRef.current).getTime() : 0;
      const safetyBuffer = 10 * 60 * 1000; // 10 min de margem

      // 2. Buscar notificações (Nominais + Broadcasts)
      const notifs: any[] = [];
      for (let offset = 0; ; offset += 200) {
        const { data: page, error } = await supabase.from('notificacoes').select('*')
          .or(`cliente_id.eq.${clientId},destinatario_tipo.in.(broadcast_clientes,broadcast_todos)`)
          .order('data_criacao', { ascending: false }).order('id', { ascending: false })
          .range(offset, offset + 199);
        if (error) throw error;
        notifs.push(...(page || []));
        if (!page || page.length < 200) break;
      }

      if (notifs) {
        const notificationIds = notifs.map((notification) => notification.id);
        let readIds = new Set<string>();
        if (notificationIds.length > 0) {
          try {
            const readResult = await callClientRpc<{ ids?: string[] }>('gsa_client_get_notification_read_ids', {
              p_notification_ids: notificationIds,
            });
            readIds = new Set(readResult?.ids || []);
          } catch (readError) {
            console.error('[useClientNotifications] Erro ao buscar leituras individuais:', readError);
          }
        }

        const normalized = notifs
          .filter(n => {
            // Regra: Notificação nominal ao cliente SEMPRE aparece
            if (n.cliente_id && String(n.cliente_id) === String(clientId)) return true;
            
            // Regra: Broadcast só aparece se for criado APÓS (ou quase junto) o cadastro do cliente
            const notifTime = new Date(n.data_criacao).getTime();
            return notifTime >= (regTime - safetyBuffer);
          })
          .filter(isMarketplaceNotification)
          .map(n => ({
            id: n.id,
            tipo: n.tipo || 'sistema',
            titulo: n.titulo,
            mensagem: n.mensagem,
            lida: !!n.lida || readIds.has(n.id),
            modulo: n.modulo || 'bell',
            tab: n.tab,
            item_id: n.item_id,
            created_at: n.data_criacao,
            prioridade: n.prioridade || 'normal'
          }));

        const previous = seenNotificationsRef.current;
        const fresh = normalized.find(n => !n.lida && previous && !previous.has(n.id));
        seenNotificationsRef.current = new Set(normalized.map(n => n.id));
        if (fresh) {
          playPremiumBeep();
          showAnimatedToast(fresh.titulo, fresh.mensagem, fresh.modulo || 'bell');
        }
        setNotifications(normalized);
        setUnreadNotifications(normalized.filter(n => !n.lida).length);
      }
    } catch (e) {
      console.error('[useClientNotifications] Erro ao buscar notificações:', e);
    }
  }, [clientId]);

  useEffect(() => {
    fetchPendencies();
    fetchNotifications();

    if (!clientId) return;

    let timeoutId: NodeJS.Timeout;
    const debouncedFetch = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchNotifications();
        fetchPendencies();
      }, 300); // Debounce de 300ms mais amigável
    };

    // Assinaturas filtradas pelo proprietário. Tabelas sem vínculo direto usam o
    // polling de fallback, evitando despertar todos os clientes a cada mudança global.
    const channel = supabase.channel(`notif-client-${clientId}`);
    const scopedTables = [
      'faturas', 'saques', 'ordens_compra', 'ordens_assinatura', 'vouchers',
      'tickets', 'indicacoes', 'cliente_documentos',
 'cliente_promocoes', 'loja_credito_solicitacoes',
    ];

    scopedTables.forEach((table) => {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter: `cliente_id=eq.${clientId}`,
      }, () => debouncedFetch());
    });

    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'promocoes',
    }, () => debouncedFetch());

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        isSubscribedRef.current = true;
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        fetchNotifications();
        fetchPendencies();
      }
      
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        isSubscribedRef.current = false;
        
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            fetchNotifications();
            fetchPendencies();
          }, RECONNECT_DELAY_MS);
        }
      }
      
      if (status === 'CLOSED') {
        isSubscribedRef.current = false;
      }
    });

    // Canal dedicado APENAS para notificações (evita limite de bindings do Supabase)
    const notifChannel = supabase.channel(`notif-direct-${clientId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes' }, (payload) => {
        const n = payload.new as any;
        const isForMe = n.cliente_id && String(n.cliente_id) === String(clientId);
        const isBroadcast = ['broadcast_clientes', 'broadcast_todos'].includes(n.destinatario_tipo);
        
        if (isForMe || isBroadcast) {
          console.log('[Realtime Client] Nova notificação recebida:', n.titulo);
          fetchNotifications();
        }
      })
      .subscribe();

    // Security subscription: Detect if the current client is deleted or blocked
    const securityChannel = supabase.channel(`client-security-${clientId}`);
    
    securityChannel.on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'clientes',
      filter: `id=eq.${clientId}`
    }, (payload) => {
      const next = payload.new as any;
      const revoked = payload.eventType === 'DELETE'
        || (
          payload.eventType === 'UPDATE'
          && (
            ['bloqueado', 'excluido'].includes(String(next?.status || '').toLowerCase())
            || next?.bloqueado === true
          )
        );

      if (revoked) {
        void sessionService.endSession().finally(() => {
          window.dispatchEvent(new CustomEvent('gsa-session-revoked', { detail: { reason: 'revoked' } }));
        });
      }
    });

    securityChannel.subscribe();

    // Heartbeat: Polling de fallback para garantir dados frescos
    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchPendencies();
        fetchNotifications();
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearTimeout(timeoutId);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      clearInterval(heartbeatInterval);
      isSubscribedRef.current = false;
      supabase.removeChannel(channel);
      supabase.removeChannel(securityChannel);
      supabase.removeChannel(notifChannel);
    };
  }, [clientId, fetchPendencies, fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
    setUnreadNotifications(prev => Math.max(0, prev - 1));
    try {
      await callClientRpc('gsa_client_mark_notification_read', { p_notification_id: id });
    } catch (error) {
      console.error('Erro ao registrar leitura da notificação:', error);
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((notification) => !notification.lida).map((notification) => notification.id);
    setNotifications(prev => prev.map(n => ({ ...n, lida: true })));
    setUnreadNotifications(0);
    try {
      await Promise.all(unreadIds.map((id) => callClientRpc('gsa_client_mark_notification_read', {
        p_notification_id: id,
      })));
    } catch (error) {
      console.error('Erro ao registrar leituras das notificações:', error);
      await fetchNotifications();
    }
  }, [notifications, fetchNotifications]);

  const value = useMemo(() => ({ 
    pendencies, 
    notifications, 
    unreadNotifications,
    markAsRead,
    markAllAsRead,
    refreshCounts: fetchPendencies 
  }), [pendencies, notifications, unreadNotifications, markAsRead, markAllAsRead, fetchPendencies]);

  return (
    <ClientNotificationContext.Provider value={value}>
      {children}
    </ClientNotificationContext.Provider>
  );
}

export function useClientNotifications() {
  const context = useContext(ClientNotificationContext);
  if (context === undefined) {
    // Retorna valores padrão vazios em vez de estourar erro, permitindo uso na loja por visitantes
    return {
      pendencies: defaultCounts,
      notifications: [],
      unreadNotifications: 0,
      markAsRead: async () => {},
      markAllAsRead: async () => {},
      refreshCounts: async () => {}
    };
  }
  return context;
}
