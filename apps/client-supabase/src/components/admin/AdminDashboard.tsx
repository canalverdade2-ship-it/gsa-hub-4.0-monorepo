import React, { useEffect, useState } from 'react';
import {
  Users,
  Briefcase,
  Wallet,
  MessageCircle,
  AlertCircle,
  Clock,
  CheckCircle,
  ChevronRight,
  Plus
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { api, money, when } from '../../api';

export interface AdminDashboardProps {
  onNavigate?: (screen: string, detail?: string) => void;
}

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const [serverNotifications, setServerNotifications] = useState<any[]>([]);
  const [serverState, setServerState] = useState<any>({ clients: [], orders: [], invoices: [], tickets: [] });
  const [activitiesModalOpen, setActivitiesModalOpen] = useState(false);
  useEffect(() => {
    const reload = async () => {
      try {
        const [notifications, state] = await Promise.all([api('/notifications'), api('/state')]);
        if (Array.isArray(notifications)) setServerNotifications(notifications);
        if (state) setServerState(state);
      } catch {
        // Keep the dashboard's operational summary available if the API is offline.
      }
    };
    void reload();
    window.addEventListener('gsa:reload', reload);
    return () => window.removeEventListener('gsa:reload', reload);
  }, []);
  const activeClients = (serverState.clients || []).filter((client: any) => client.active !== false);
  const activeOrders = (serverState.orders || []).filter((order: any) => order.status !== 'Concluída');
  const openInvoices = (serverState.invoices || []).filter((invoice: any) => invoice.status !== 'Pago');
  const openInvoiceTotal = openInvoices.reduce((total: number, invoice: any) => total + Number(invoice.total || 0) - Number(invoice.paidAmount || 0), 0);
  const overdueInvoices = openInvoices.filter((invoice: any) => invoice.status === 'Vencido');
  const openTickets = (serverState.tickets || []).filter((ticket: any) => ticket.status !== 'Resolvido');
  const clientName = (clientId: any) => serverState.clients?.find((client: any) => String(client.id) === String(clientId))?.name || 'Cliente';
  const pendingItems = [
    ...overdueInvoices.map((invoice: any) => ({
      id: 'invoice-' + invoice.id,
      severity: 'red',
      title: 'Fatura ' + (invoice.code || invoice.id) + ' vencida',
      subtitle: clientName(invoice.clientId) + ' — ' + money(invoice.total) + ' vencida',
      badge: 'Vencido',
      actionScreen: 'finance'
    })),
    ...activeOrders.filter((order: any) => order.priority === 'Alta').map((order: any) => ({
      id: 'order-' + order.id,
      severity: 'red',
      title: (order.code || 'OS') + ' com prioridade Alta em andamento',
      subtitle: clientName(order.clientId) + ' — ' + (order.title || 'Ordem de Serviço'),
      badge: 'Urgente',
      actionScreen: 'orders'
    })),
    ...(serverState.documents || []).filter((document: any) => ['Em análise', 'Aguardando envio'].includes(document.status)).map((document: any) => ({
      id: 'document-' + document.id,
      severity: 'yellow',
      title: 'Documento ' + (document.status === 'Em análise' ? 'aguardando conferência' : 'aguardando envio'),
      subtitle: (document.title || 'Documento') + ' — ' + clientName(document.clientId),
      badge: document.status,
      actionScreen: 'documents'
    })),
    ...openTickets.map((ticket: any) => ({
      id: 'ticket-' + ticket.id,
      severity: 'yellow',
      title: 'Ticket ' + (ticket.code || ticket.id) + ' em atendimento',
      subtitle: (ticket.title || 'Chamado') + ' — ' + clientName(ticket.clientId),
      badge: ticket.status,
      actionScreen: 'support'
    })),
    ...(serverState.proposals || []).filter((proposal: any) => proposal.status === 'Aceita').map((proposal: any) => ({
      id: 'proposal-' + proposal.id,
      severity: 'blue',
      title: 'Proposta ' + (proposal.code || proposal.id) + ' aceita',
      subtitle: 'Pronta para formalização de contrato — ' + clientName(proposal.clientId),
      badge: 'Aceita',
      actionScreen: 'contracts'
    }))
  ].slice(0, 8);

  const recentActivities = (serverState.history || [])
    .filter((entry: any) => entry.message)
    .map((entry: any) => ({
      createdAt: entry.createdAt,
      time: when(entry.createdAt),
      text: entry.message,
      actor: entry.actor || 'Sistema'
    }));
  const liveActivities = serverNotifications.map((notification) => ({
    createdAt: notification.createdAt,
    time: when(notification.createdAt),
    text: notification.message || 'Nova notificação no sistema',
    actor: notification.kind === 'proposals' ? 'Portal do cliente' : 'Sistema'
  }));
  const allActivities = [...liveActivities, ...recentActivities].sort((a, b) => {
    const aTime = Date.parse(String(a.createdAt || ''));
    const bTime = Date.parse(String(b.createdAt || ''));
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
  const visibleActivities = allActivities.slice(0, 3);
  const renderActivity = (act: { time: string; text: string; actor: string }, idx: number, compact = false) => (
    <div
      className="responsive-row"
      key={`${act.time}-${act.text}-${idx}`}
      style={{
        display: 'flex',
        gap: 10,
        ...(compact ? {} : { padding: '10px 0', borderBottom: '1px solid #eef2f7' })
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#2563eb',
          marginTop: 6,
          flexShrink: 0
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflowWrap: 'anywhere' }}>{act.text}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, overflowWrap: 'anywhere' }}>
          {act.actor} • {act.time}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Top Welcome & Quick Actions */}
      <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Visão geral</h1>
          <p className="page-subtitle">Central de decisões e pendências prioritárias da operação.</p>
        </div>
        <div className="responsive-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="outline-blue" size="md" icon={<Plus size={16} />} onClick={() => onNavigate?.('clients', 'novo')}>
            Novo Cliente
          </Button>
          <Button variant="primary" size="md" icon={<Plus size={16} />} onClick={() => onNavigate?.('orders')}>
            Nova OS
          </Button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid-4-cols" style={{ marginBottom: 24 }}>
        <div
          className="card dashboard-stat-card"
          role="button"
          tabIndex={0}
          aria-label="Abrir módulo de clientes"
          onClick={() => onNavigate?.('clients')}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigate?.('clients'); } }}
          style={{ padding: 18, cursor: 'pointer', transition: 'transform 150ms ease, box-shadow 150ms ease' }}
        >
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Clientes ativos</span>
            <Users size={18} color="#2563eb" />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>{activeClients.length}</div>
          <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>Base sincronizada</div>
        </div>

        <div
          className="card dashboard-stat-card"
          role="button"
          tabIndex={0}
          aria-label="Abrir módulo de ordens de serviço"
          onClick={() => onNavigate?.('orders')}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigate?.('orders'); } }}
          style={{ padding: 18, cursor: 'pointer', transition: 'transform 150ms ease, box-shadow 150ms ease' }}
        >
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Ordens de Serviço ativas</span>
            <Briefcase size={18} color="#2563eb" />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>{activeOrders.length}</div>
          <div style={{ fontSize: 12, color: '#2563eb', marginTop: 4 }}>{activeOrders[0]?.code || 'Nenhuma OS em andamento'}</div>
        </div>

        <div
          className="card dashboard-stat-card"
          role="button"
          tabIndex={0}
          aria-label="Abrir módulo financeiro"
          onClick={() => onNavigate?.('finance')}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigate?.('finance'); } }}
          style={{ padding: 18, cursor: 'pointer', transition: 'transform 150ms ease, box-shadow 150ms ease' }}
        >
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Faturas pendentes</span>
            <Wallet size={18} color="#2563eb" />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>{money(openInvoiceTotal)}</div>
          <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{overdueInvoices.length} fatura(s) vencida(s)</div>
        </div>

        <div
          className="card dashboard-stat-card"
          role="button"
          tabIndex={0}
          aria-label="Abrir módulo de suporte ao cliente"
          onClick={() => onNavigate?.('support')}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onNavigate?.('support'); } }}
          style={{ padding: 18, cursor: 'pointer', transition: 'transform 150ms ease, box-shadow 150ms ease' }}
        >
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Tickets abertos</span>
            <MessageCircle size={18} color="#2563eb" />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>{openTickets.length}</div>
          <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>{openTickets.length ? 'Requer resposta' : 'Tudo em dia'}</div>
        </div>
      </div>

      {/* 2-Column Dashboard Layout */}
      <div className="layout-2col">
        {/* Main Column: Pendências Prioritárias */}
        <div className="layout-2col-main">
          <Card
            title="Pendências prioritárias"
            subtitle="Itens organizados por criticidade que exigem ação da sua equipe."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {pendingItems.map((item) => (
                <div className="responsive-row"
                  key={item.id}
                  onClick={() => onNavigate?.(item.actionScreen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    borderLeft: `4px solid ${
                      item.severity === 'red' ? '#ef4444' : item.severity === 'yellow' ? '#f59e0b' : '#2563eb'
                    }`,
                    cursor: 'pointer',
                    transition: 'all 150ms ease'
                  }}
                >
                  <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <AlertCircle
                      size={18}
                      color={
                        item.severity === 'red' ? '#ef4444' : item.severity === 'yellow' ? '#f59e0b' : '#2563eb'
                      }
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{item.subtitle}</div>
                    </div>
                  </div>

                  <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Badge status={item.badge} />
                    <ChevronRight size={16} color="#94a3b8" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Rail: Movimentações Recentes */}
        <div className="layout-2col-rail">
          <Card
            title="Movimentações recentes"
            subtitle="Histórico de atividades do sistema."
            action={
              <Button
                variant="ghost"
                size="sm"
                aria-label="Ver todas as movimentações"
                onClick={() => setActivitiesModalOpen(true)}
              >
                Ver todas
              </Button>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
              {visibleActivities.length > 0
                ? visibleActivities.map((act, idx) => renderActivity(act, idx, true))
                : <div style={{ color: '#94a3b8', fontSize: 13 }}>Nenhuma movimentação registrada.</div>}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={activitiesModalOpen}
        onClose={() => setActivitiesModalOpen(false)}
        title="Todas as movimentações"
      >
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 13 }}>
          Histórico completo de atividades do sistema.
        </p>
        <div style={{ maxHeight: 'min(60vh, 520px)', overflowY: 'auto', paddingRight: 4 }}>
          {allActivities.length > 0
            ? allActivities.map((act, idx) => renderActivity(act, idx))
            : <div style={{ padding: 16, border: '1px dashed #cbd5e1', borderRadius: 10, color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>Nenhuma movimentação registrada.</div>}
        </div>
      </Modal>
    </div>
  );
}

export default AdminDashboard;
